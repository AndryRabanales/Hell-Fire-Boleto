const express = require('express');
const { getRow, execute } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/stats/visit — público, cuenta una visita a la página
router.post('/visit', async (req, res) => {
    try {
        const row = await getRow("SELECT value FROM config WHERE key = 'visits'");
        const next = (row ? parseInt(row.value) || 0 : 0) + 1;
        await execute(
            `INSERT INTO config (key, value, updated_at) VALUES ('visits', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
            [String(next)]
        );
        res.json({ success: true, visits: next });
    } catch (err) {
        console.error('Visit increment error:', err.message);
        res.status(500).json({ error: 'Error al contar visita' });
    }
});

// GET /api/stats — admin, devuelve el total de visitas
router.get('/', auth, async (req, res) => {
    try {
        const row = await getRow("SELECT value FROM config WHERE key = 'visits'");
        res.json({ visits: row ? parseInt(row.value) || 0 : 0 });
    } catch (err) {
        console.error('Get stats error:', err.message);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

module.exports = router;
