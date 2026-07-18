const express = require('express');
const { query, getRow, execute } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/reservations — public, create a reservation
router.post('/', async (req, res) => {
    const { ticket_type, instagram, whatsapp, quantity } = req.body;
    console.log(`🎟️ New reservation (click Apartar) for [${ticket_type}]`);

    // Solo se requiere el tipo de boleto. El clic en "Apartar" cuenta como
    // apartado y redirige a WhatsApp; NO se pide Instagram ni WhatsApp.
    if (!ticket_type) {
        return res.status(400).json({ error: 'ticket_type es requerido' });
    }

    const qty = 1; // Force 1 ticket as per user request

    const ig = (instagram || '').replace(/^@/, '').trim();
    const wa = (whatsapp || '').trim();

    try {
        const configRow = await getRow("SELECT value FROM config WHERE key = 'tickets'");
        const ticketsConfig = configRow ? JSON.parse(configRow.value) : [];

        // Find ticket by id in the dynamic array
        const ticketIdx = ticketsConfig.findIndex(t => t.id === ticket_type);
        if (ticketIdx === -1) {
            return res.status(400).json({ error: 'Tipo de boleto inválido' });
        }
        const ticketInfo = ticketsConfig[ticketIdx];

        const phasesRow = await getRow("SELECT value FROM config WHERE key = 'phases'");
        const phases = phasesRow ? JSON.parse(phasesRow.value) : [];

        const now = new Date();
        let currentPhaseId = phases.length > 0 ? phases[phases.length - 1].id : "1"; // Default to last phase

        // Find active phase (first phase whose endDate is in the future)
        for (const phase of phases) {
            if (now < new Date(phase.endDate)) {
                currentPhaseId = phase.id;
                break;
            }
        }

        const price = ticketInfo.prices?.[currentPhaseId] || 0;

        // Find phase name for saving
        const phaseInfo = phases.find(p => p.id === currentPhaseId) || { name: 'Fase ' + currentPhaseId };
        const phaseName = phaseInfo.name;

        // Uses $1, $2, ... $6
        const result = await execute(
            `INSERT INTO reservations (ticket_type, instagram, whatsapp, fase, quantity, price_each) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [ticketInfo?.label || ticket_type, ig, wa, phaseName, qty, price] // save the friendly label for the UI
        );

        const newId = result.id || result.lastID || result[0]?.id; // handles Postgres RETURNING vs sqlite hack

        const inserted = await getRow('SELECT * FROM reservations WHERE id = $1', [newId]);

        if (ticketsConfig && ticketInfo) {
            // Update real stock
            ticketInfo.realStock = Math.max(0, (ticketInfo.realStock || 0) - qty);

            // We NO LONGER decrement fakeStart.
            // Fake sales are additive for display: sold = fakeStart + realReservations

            // Get actual counts to check auto-expansion
            const counts = await query('SELECT ticket_type, COUNT(*) as count FROM reservations GROUP BY ticket_type');
            const countsMap = {};
            counts.forEach(c => { countsMap[c.ticket_type] = parseInt(c.count); });
            const purchasedCount = countsMap[ticketInfo.label] || 0;

            const soldCount = (ticketInfo.fakeStart || 0) + purchasedCount;
            if (soldCount >= (ticketInfo.fakeTotal || 0)) {
                ticketInfo.fakeTotal = (ticketInfo.fakeTotal || 0) + 50;
            }

            ticketsConfig[ticketIdx] = ticketInfo;

            await execute(
                "UPDATE config SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'tickets'",
                [JSON.stringify(ticketsConfig)]
            );
        }

        res.status(201).json({ success: true, reservation: inserted });
    } catch (err) {
        console.error('Create reservation error:', err.message);
        res.status(500).json({ error: 'Error al guardar la reserva' });
    }
});

// GET /api/reservations — admin only
router.get('/', auth, async (req, res) => {
    const { status, ticket_type, search, limit = 100, offset = 0 } = req.query;

    let sql = 'SELECT * FROM reservations WHERE 1=1';
    let countSql = 'SELECT COUNT(*) as count FROM reservations WHERE 1=1';
    const params = [];
    let pIdx = 1;

    if (status) {
        sql += ` AND status = $${pIdx}`;
        countSql += ` AND status = $${pIdx}`;
        params.push(status);
        pIdx++;
    }
    if (ticket_type) {
        sql += ` AND ticket_type = $${pIdx}`;
        countSql += ` AND ticket_type = $${pIdx}`;
        params.push(ticket_type);
        pIdx++;
    }
    if (search) {
        sql += ` AND instagram LIKE $${pIdx}`;
        countSql += ` AND instagram LIKE $${pIdx}`;
        params.push(`%${search}%`);
        pIdx++;
    }

    const countRawParams = [...params];

    sql += ` ORDER BY created_at DESC LIMIT $${pIdx} OFFSET $${pIdx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    try {
        const reservations = await query(sql, params);
        const countRow = await getRow(countSql, countRawParams);

        const stats = await query(`
      SELECT
        ticket_type,
        status,
        COUNT(*) AS count,
        SUM(quantity) AS total_tickets,
        SUM(quantity * price_each) AS total_revenue
      FROM reservations
      GROUP BY ticket_type, status
      ORDER BY ticket_type, status
    `);

        res.json({
            reservations,
            total: countRow.count,
            stats,
        });
    } catch (err) {
        console.error('Get reservations error:', err.message);
        res.status(500).json({ error: 'Error al obtener reservas' });
    }
});

// PATCH /api/reservations/:id — admin only
router.patch('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'confirmed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
    }

    try {
        const fields = [];
        const params = [];
        let pIdx = 1;

        if (status !== undefined) { fields.push(`status = $${pIdx++}`); params.push(status); }
        if (notes !== undefined) { fields.push(`notes  = $${pIdx++}`); params.push(notes); }

        if (fields.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

        params.push(id);
        const result = await execute(`UPDATE reservations SET ${fields.join(', ')} WHERE id = $${pIdx}`, params);

        if (result.changes === 0) return res.status(404).json({ error: 'Reserva no encontrada' });

        const updated = await getRow('SELECT * FROM reservations WHERE id = $1', [id]);
        res.json({ success: true, reservation: updated });
    } catch (err) {
        console.error('Update reservation error:', err.message);
        res.status(500).json({ error: 'Error al actualizar reserva' });
    }
});

// DELETE /api/reservations/:id — admin only
router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await execute('DELETE FROM reservations WHERE id = $1', [id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Reserva no encontrada' });
        res.json({ success: true });
    } catch (err) {
        console.error('Delete reservation error:', err.message);
        res.status(500).json({ error: 'Error al eliminar reserva' });
    }
});

module.exports = router;
