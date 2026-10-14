const express = require('express');
const { query, getRow, execute } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/config — public
router.get('/', async (req, res) => {
    try {
        const rows = await query('SELECT key, value FROM config');
        const config = {};
        rows.forEach(row => { config[row.key] = JSON.parse(row.value); });

        // Add real reservations count to tickets if they exist
        if (config.tickets) {
            const counts = await query('SELECT ticket_type, COUNT(*) as count FROM reservations GROUP BY ticket_type');
            const countsMap = {};
            counts.forEach(c => { countsMap[c.ticket_type] = parseInt(c.count); });

            // Las reservas guardan el label (ej. "UADY") en ticket_type, por eso contamos por label
            config.tickets = config.tickets.map(t => ({
                ...t,
                purchasedCount: countsMap[t.label] || 0
            }));
        }

        res.json(config);
    } catch (err) {
        console.error('Get config error:', err.message);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// GET /api/promo — public: la promo/cartel para la página (solo si está activa)
router.get('/promo', async (req, res) => {
    try {
        const row = await getRow("SELECT value FROM config WHERE key = 'promo'");
        const p = row ? JSON.parse(row.value) : {};
        // Solo se expone la imagen si la promo está activa (la página EXIGE imagen)
        const activa = !!(p && p.active && p.img);
        res.json(activa ? {
            active: true,
            img: p.img,
            titulo: p.titulo || '',
            btn_texto: p.btn_texto || '',
            wa_text: p.wa_text || '',
        } : { active: false });
    } catch (err) {
        console.error('Get promo error:', err.message);
        res.json({ active: false });
    }
});

// GET /api/config/vendedor/:codigo — público: el WhatsApp del vendedor de un link /v/CODIGO.
// Solo expone lo necesario para redirigir (código, nombre y número), nada más.
router.get('/vendedor/:codigo', async (req, res) => {
    const codigo = String(req.params.codigo || '').toLowerCase().trim();
    if (!codigo) return res.status(404).json({ error: 'Vendedor no encontrado' });
    try {
        const row = await getRow("SELECT value FROM config WHERE key = 'vendedores'");
        const lista = row ? JSON.parse(row.value) : [];
        const v = (Array.isArray(lista) ? lista : []).find(
            (x) => x && x.activo !== false && String(x.codigo || '').toLowerCase() === codigo
        );
        if (!v || !v.whatsapp) return res.status(404).json({ error: 'Vendedor no encontrado' });
        res.set('Cache-Control', 'public, max-age=60');
        res.json({ codigo: v.codigo, nombre: v.nombre || '', whatsapp: String(v.whatsapp).replace(/\D/g, '') });
    } catch (err) {
        console.error('Get vendedor error:', err.message);
        res.status(500).json({ error: 'Error al buscar vendedor' });
    }
});

// ── Vendedores: altas/bajas ATÓMICAS sobre la lista guardada ──
// Antes el admin mandaba la lista completa: dos pestañas se pisaban entre sí.
// Ahora cada operación lee la lista actual de la base y modifica solo un vendedor.
async function leerVendedores() {
    const row = await getRow("SELECT value FROM config WHERE key = 'vendedores'");
    const l = row ? JSON.parse(row.value) : [];
    return Array.isArray(l) ? l : [];
}
async function guardarVendedores(lista) {
    await execute(
        `INSERT INTO config (key, value, updated_at) VALUES ('vendedores', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(lista)]
    );
}

// GET /api/config/vendedores/lista — admin: lista vigente
router.get('/vendedores/lista', auth, async (req, res) => {
    try { res.json({ vendedores: await leerVendedores() }); }
    catch (e) { res.status(500).json({ error: 'Error al leer vendedores' }); }
});

// POST /api/config/vendedores — admin: agrega UNO
router.post('/vendedores', auth, async (req, res) => {
    const nombre = String(req.body.nombre || '').trim();
    const codigo = String(req.body.codigo || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    const whatsapp = String(req.body.whatsapp || '').replace(/\D/g, '');
    if (!nombre || !codigo) return res.status(400).json({ error: 'Nombre y código requeridos' });
    if (whatsapp.length < 10) return res.status(400).json({ error: 'WhatsApp inválido' });
    try {
        const lista = await leerVendedores();
        if (lista.some((v) => v.codigo === codigo)) {
            return res.status(409).json({ error: 'Ese código ya existe', vendedores: lista });
        }
        lista.push({ nombre, codigo, whatsapp, activo: true });
        await guardarVendedores(lista);
        res.json({ success: true, vendedores: lista });
    } catch (e) { res.status(500).json({ error: 'Error al guardar vendedor' }); }
});

// DELETE /api/config/vendedores/:codigo — admin: elimina UNO
router.delete('/vendedores/:codigo', auth, async (req, res) => {
    const codigo = String(req.params.codigo || '').toLowerCase();
    try {
        const lista = (await leerVendedores()).filter((v) => v.codigo !== codigo);
        await guardarVendedores(lista);
        res.json({ success: true, vendedores: lista });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar vendedor' }); }
});

// PUT /api/config/:key — admin only
router.put('/:key', auth, async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;

    const allowedKeys = ['phases', 'tickets', 'faqs', 'event_info', 'rewards', 'metric_descriptions', 'ventas_boost', 'ventas_cupos', 'ventas_cupos_fase', 'flash', 'promo'];
    if (!allowedKeys.includes(key)) {
        return res.status(400).json({ error: 'Clave de configuración inválida' });
    }

    if (value === undefined) {
        return res.status(400).json({ error: 'Valor requerido' });
    }

    try {
        // UPSERT: crea la clave si no existe (p. ej. metric_descriptions no viene en el seed)
        await execute(
            `INSERT INTO config (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
            [key, JSON.stringify(value)]
        );
        res.json({ success: true, key, value });
    } catch (err) {
        console.error('Update config error:', err.message);
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
});

// POST /api/config/click/:id — public, increment click count
router.post('/click/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const configRow = await getRow("SELECT value FROM config WHERE key = 'tickets'");
        if (!configRow) return res.status(404).json({ error: 'Configuración de tickets no encontrada' });

        let tickets = JSON.parse(configRow.value);
        const tIdx = tickets.findIndex(t => t.id === id);
        if (tIdx === -1) return res.status(404).json({ error: 'Ticket no encontrado' });

        // Get actual reservation counts to check capacity correctly
        const counts = await query('SELECT ticket_type, COUNT(*) as count FROM reservations GROUP BY ticket_type');
        const countsMap = {};
        counts.forEach(c => { countsMap[c.ticket_type] = parseInt(c.count); });

        let ticket = tickets[tIdx];
        const purchasedCount = countsMap[ticket.id] || 0;

        // Increment fakeStart (clicks)
        ticket.fakeStart = (ticket.fakeStart || 0) + 1;

        // Auto-expand capacity if reached
        const soldCount = ticket.fakeStart + purchasedCount;
        if (soldCount >= (ticket.fakeTotal || 0)) {
            ticket.fakeTotal = (ticket.fakeTotal || 0) + 50;
        }

        tickets[tIdx] = ticket;

        await execute(
            "UPDATE config SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'tickets'",
            [JSON.stringify(tickets)]
        );

        res.json({ success: true, ticket });
    } catch (err) {
        console.error('Increment click error:', err.message);
        res.status(500).json({ error: 'Error al procesar el click' });
    }
});

module.exports = router;
