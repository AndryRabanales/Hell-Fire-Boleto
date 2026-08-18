/* ============================================================
   VENTAS — lee el número real de boletos generados desde la base
   del sistema generador (otro proyecto de Railway), solo lectura.

   Conexión: variable de entorno VENTAS_DATABASE_URL (Postgres).
   Si no está definida, los endpoints responden 503 sin romper nada.
   ============================================================ */
const express = require('express');
const { Pool } = require('pg');
const auth = require('../middleware/auth');

const router = express.Router();

let ventasPool = null;
function getVentasPool() {
    if (!process.env.VENTAS_DATABASE_URL) return null;
    if (!ventasPool) {
        ventasPool = new Pool({
            connectionString: process.env.VENTAS_DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 8000,
        });
    }
    return ventasPool;
}

// Valida que un nombre de tabla exista (evita inyección en /sample)
async function tablaExiste(pool, name) {
    const r = await pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
        [name]
    );
    return r.rows.length > 0;
}

// GET /api/ventas/inspect — TEMPORAL y abierto: descubre el esquema (tablas +
// columnas + conteos). Solo expone metadatos y números, ningún dato personal.
// Se elimina en cuanto quede conectada la consulta real de ventas.
router.get('/inspect', async (req, res) => {
    const pool = getVentasPool();
    if (!pool) return res.status(503).json({ error: 'VENTAS_DATABASE_URL no configurada' });

    try {
        const cols = await pool.query(`
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        `);

        const schema = {};
        cols.rows.forEach(r => {
            (schema[r.table_name] = schema[r.table_name] || []).push(`${r.column_name} (${r.data_type})`);
        });

        // Conteo de filas por tabla (para ubicar la tabla de boletos)
        const counts = {};
        for (const table of Object.keys(schema)) {
            try {
                const c = await pool.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
                counts[table] = c.rows[0].n;
            } catch (e) {
                counts[table] = 'error';
            }
        }

        // Diagnóstico específico de ventas (solo tipos y conteos, sin datos personales)
        const diag = {};
        try {
            const tipos = await pool.query('SELECT id, name, price_cents, is_vip, active, needs_faculty FROM ticket_types ORDER BY id');
            diag.ticket_types = tipos.rows;
        } catch (e) { diag.ticket_types = 'error: ' + e.message; }
        try {
            const bd = await pool.query(`
                SELECT type_name, type_is_vip, status, es_cortesia, COUNT(*)::int AS n
                FROM tickets
                GROUP BY type_name, type_is_vip, status, es_cortesia
                ORDER BY type_name, status
            `);
            diag.tickets_breakdown = bd.rows;
        } catch (e) { diag.tickets_breakdown = 'error: ' + e.message; }

        res.json({ schema, counts, diag });
    } catch (err) {
        console.error('Ventas inspect error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/ventas/sample/:table — admin: primeras filas de una tabla (para ver formato de datos)
router.get('/sample/:table', auth, async (req, res) => {
    const pool = getVentasPool();
    if (!pool) return res.status(503).json({ error: 'VENTAS_DATABASE_URL no configurada' });

    const { table } = req.params;
    try {
        if (!(await tablaExiste(pool, table))) {
            return res.status(404).json({ error: 'Tabla no encontrada' });
        }
        const rows = await pool.query(`SELECT * FROM "${table}" LIMIT 3`);
        res.json({ table, rows: rows.rows });
    } catch (err) {
        console.error('Ventas sample error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
