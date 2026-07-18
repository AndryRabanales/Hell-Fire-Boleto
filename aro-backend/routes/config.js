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

// PUT /api/config/:key — admin only
router.put('/:key', auth, async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;

    const allowedKeys = ['phases', 'tickets', 'faqs', 'event_info', 'rewards', 'metric_descriptions'];
    if (!allowedKeys.includes(key)) {
        return res.status(400).json({ error: 'Clave de configuración inválida' });
    }

    if (value === undefined) {
        return res.status(400).json({ error: 'Valor requerido' });
    }

    try {
        const result = await execute(
            'UPDATE config SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
            [JSON.stringify(value), key]
        );
        if (result.changes === 0 && !result.id) return res.status(404).json({ error: 'Clave no encontrada' });
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
