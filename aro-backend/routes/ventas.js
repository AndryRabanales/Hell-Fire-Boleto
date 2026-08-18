/* ============================================================
   VENTAS — lee el número real de boletos generados desde la base
   del sistema generador (otro proyecto de Railway), solo lectura.

   Conexión: variable de entorno VENTAS_DATABASE_URL (Postgres).
   Si no está definida, los endpoints responden 503 sin romper nada.
   ============================================================ */
const express = require('express');
const { Pool } = require('pg');
const auth = require('../middleware/auth');
const { getRow } = require('../db');

const router = express.Router();

// Lee un objeto {general,vip,ultra} de una clave de config, con valores por defecto
async function getConfigNums(key, def) {
    try {
        const row = await getRow('SELECT value FROM config WHERE key = $1', [key]);
        if (row) {
            const b = JSON.parse(row.value);
            return {
                general: Number.isFinite(parseInt(b.general)) ? parseInt(b.general) : def.general,
                vip: Number.isFinite(parseInt(b.vip)) ? parseInt(b.vip) : def.vip,
                ultra: Number.isFinite(parseInt(b.ultra)) ? parseInt(b.ultra) : def.ultra,
            };
        }
    } catch (e) { /* usa def */ }
    return { ...def };
}

const getBoost = () => getConfigNums('ventas_boost', { general: 0, vip: 0, ultra: 0 });

// Cupo por FASE y tipo. Estructura: { "Preventa": {general,vip,ultra}, ... }
const CUPO_FASE_DEF = { general: 400, vip: 180, ultra: 40 };
async function getCuposFase(faseName) {
    try {
        const row = await getRow("SELECT value FROM config WHERE key = 'ventas_cupos_fase'");
        if (row) {
            const all = JSON.parse(row.value);
            const f = all[faseName];
            if (f) {
                return {
                    general: Number.isFinite(parseInt(f.general)) ? parseInt(f.general) : CUPO_FASE_DEF.general,
                    vip: Number.isFinite(parseInt(f.vip)) ? parseInt(f.vip) : CUPO_FASE_DEF.vip,
                    ultra: Number.isFinite(parseInt(f.ultra)) ? parseInt(f.ultra) : CUPO_FASE_DEF.ultra,
                };
            }
        }
    } catch (e) { /* usa def */ }
    return { ...CUPO_FASE_DEF };
}

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

// ── Cupos por categoría (para "disponibles") ──
const CUPOS = { general: 1500, vip: 700, ultra: 150 };

// Cache en memoria para no golpear la base del generador en cada visita
let ventasCache = { data: null, ts: 0 };
const VENTAS_TTL = 30000; // 30s

// GET /api/ventas — público: boletos vendidos / disponibles por categoría.
// "vendidos" = boletos generados NO anulados (status <> 'void').
router.get('/', async (req, res) => {
    const pool = getVentasPool();
    if (!pool) return res.json({ available: false });

    const now = Date.now();
    const fresh = req.query.fresh === '1';
    const faseName = (req.query.fase || '').toString().trim() || 'Preventa';
    const cacheKey = faseName;
    if (!fresh && ventasCache.data && ventasCache.key === cacheKey && now - ventasCache.ts < VENTAS_TTL) {
        return res.json(ventasCache.data);
    }

    try {
        const r = await pool.query(
            "SELECT type_name, COUNT(*)::int AS n FROM tickets WHERE status <> 'void' GROUP BY type_name"
        );

        let general = 0, vip = 0, ultra = 0;
        r.rows.forEach((row) => {
            const t = (row.type_name || '').toLowerCase();
            if (t.includes('ultra')) ultra += row.n;      // "Ultra vip"
            else if (t.includes('vip')) vip += row.n;     // "VIP"
            else general += row.n;                        // "Uady", "Externo"
        });

        // Compras extra (por tipo) + cupo de la FASE seleccionada (por tipo)
        const boost = await getBoost();
        const cupos = await getCuposFase(faseName);
        const mk = (real, extra, cap) => {
            const sold = real + extra;
            return { sold, real, boost: extra, cap, left: Math.max(0, cap - sold) };
        };
        const g = mk(general, boost.general, cupos.general);
        const vp = mk(vip, boost.vip, cupos.vip);
        const u = mk(ultra, boost.ultra, cupos.ultra);
        const capTotal = cupos.general + cupos.vip + cupos.ultra;

        const data = {
            available: true,
            fase: faseName,
            general: g,
            vip: vp,
            ultra: u,
            total: {
                sold: g.sold + vp.sold + u.sold,
                real: general + vip + ultra,
                boost: boost.general + boost.vip + boost.ultra,
                cap: capTotal,
                left: Math.max(0, capTotal - (g.sold + vp.sold + u.sold)),
            },
            updatedAt: new Date().toISOString(),
        };

        ventasCache = { data, ts: now, key: cacheKey };
        res.json(data);
    } catch (err) {
        console.error('Ventas count error:', err.message);
        // Si falla, devolvemos lo último cacheado (si hay) para no romper el FOMO
        if (ventasCache.data) return res.json(ventasCache.data);
        res.json({ available: false, error: err.message });
    }
});

// GET /api/ventas/inspect — admin: descubre el esquema (tablas + columnas + conteos).
router.get('/inspect', auth, async (req, res) => {
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
