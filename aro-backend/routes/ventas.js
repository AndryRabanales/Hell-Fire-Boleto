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

const CATS = ['general', 'vip', 'ultra', 'backstage'];

// Lee un objeto {general,vip,ultra,backstage} de una clave de config, con valores por defecto
async function getConfigNums(key, def) {
    const out = {};
    try {
        const row = await getRow('SELECT value FROM config WHERE key = $1', [key]);
        const b = row ? JSON.parse(row.value) : {};
        CATS.forEach((c) => { out[c] = Number.isFinite(parseInt(b[c])) ? parseInt(b[c]) : def[c]; });
        return out;
    } catch (e) { /* usa def */ }
    return { ...def };
}

const getBoost = () => getConfigNums('ventas_boost', { general: 0, vip: 0, ultra: 0, backstage: 0 });

// Cupo TOTAL por tipo (ya no por fase). Estructura: {general,vip,ultra,backstage}
const CUPO_DEF = { general: 1000, vip: 600, ultra: 400, backstage: 60 };
const getCupos = () => getConfigNums('ventas_cupos', CUPO_DEF);

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

// ── Venta flash (montos en NUESTRA config; el ON/OFF lo controla el admin) ──
async function getFlash() {
    const def = { active: false, uady: 0, externo: 0, vip: 0, ultra: 0, backstage: 0, label: '' };
    try {
        const row = await getRow("SELECT value FROM config WHERE key = 'flash'");
        if (row) {
            const f = JSON.parse(row.value);
            return {
                active: !!f.active,
                uady: parseInt(f.uady) || 0,
                externo: parseInt(f.externo) || 0,
                vip: parseInt(f.vip) || 0,
                ultra: parseInt(f.ultra) || 0,
                backstage: parseInt(f.backstage) || 0,
                label: f.label || '',
            };
        }
    } catch (e) { /* usa def */ }
    return def;
}

// Mapea el nombre de tipo del generador a nuestra clave
function mapKeyTipo(n) {
    n = (n || '').toLowerCase();
    if (n.includes('ultra')) return 'ultra';
    if (n.includes('backstage')) return 'backstage';
    if (n.includes('vip')) return 'vip';
    if (n.includes('uady')) return 'uady';
    return 'externo';
}

const EVENTO_CIERRE = '2026-10-31T20:00:00-06:00';
let preciosCache = { data: null, ts: 0 };
const PRECIOS_TTL = 25000;

// GET /api/precios — precios ACTUALES sincronizados del generador + flash
router.get('/precios', async (req, res) => {
    const now = Date.now();
    const fresh = req.query.fresh === '1';
    if (!fresh && preciosCache.data && now - preciosCache.ts < PRECIOS_TTL) {
        // el flash puede cambiar en cualquier momento: relee solo el flash
        const flash = await getFlash();
        return res.json({ ...preciosCache.data, flash });
    }

    const flash = await getFlash();
    const pool = getVentasPool();
    if (!pool) return res.json({ available: false, flash });

    try {
        const types = await pool.query('SELECT id, name FROM ticket_types WHERE active = 1');
        const phases = await pool.query(
            'SELECT id, type_id, name, price_cents, starts_on::text AS starts_on FROM price_phases'
        );

        // Fecha de hoy en hora Mérida (UTC-6)
        const today = new Date(now - 6 * 3600 * 1000).toISOString().slice(0, 10);
        const nameOf = {};
        types.rows.forEach((t) => { nameOf[t.id] = t.name; });

        // Precios actuales por tipo (fase activa = último starts_on <= hoy)
        const byType = {};
        phases.rows.forEach((r) => { (byType[r.type_id] = byType[r.type_id] || []).push(r); });

        const precios = {};
        let faseActual = null;
        Object.keys(byType).forEach((tid) => {
            const past = byType[tid]
                .filter((r) => r.starts_on <= today)
                .sort((a, b) => (a.starts_on < b.starts_on ? 1 : a.starts_on > b.starts_on ? -1 : b.id - a.id));
            const active = past[0];
            if (active) {
                precios[mapKeyTipo(nameOf[tid])] = Math.round(active.price_cents / 100);
                if (!faseActual) faseActual = active.name;
            }
        });

        // Info de fase para el cronómetro
        const nums = phases.rows.map((r) => parseInt(String(r.name).replace(/\D/g, '')) || 0);
        const faseTotal = Math.max(...nums, 0) || 4;
        const faseNum = parseInt(String(faseActual || '').replace(/\D/g, '')) || 1;
        const futuras = [...new Set(phases.rows.map((r) => r.starts_on).filter((d) => d > today))].sort();
        const proximaFecha = futuras[0] || null;
        const esUltima = !proximaFecha;

        // Línea de tiempo completa (todas las fases, precios por tipo)
        const faseMap = {};
        phases.rows.forEach((r) => {
            const fn = r.name;
            faseMap[fn] = faseMap[fn] || { name: fn, starts_on: r.starts_on };
            faseMap[fn][mapKeyTipo(nameOf[r.type_id])] = Math.round(r.price_cents / 100);
        });
        const numFase = (s) => parseInt(String(s).replace(/\D/g, '')) || 0;
        const fases = Object.values(faseMap).sort((a, b) =>
            a.starts_on < b.starts_on ? -1 : a.starts_on > b.starts_on ? 1 : numFase(a.name) - numFase(b.name)
        );

        const data = {
            available: Object.keys(precios).length > 0,
            faseActual, faseNum, faseTotal,
            proximaFecha: proximaFecha ? proximaFecha + 'T00:00:00-06:00' : EVENTO_CIERRE,
            esUltima,
            precios,
            fases,
        };

        // Estado del interruptor flash del generador (referencia)
        try {
            const fm = await pool.query("SELECT value FROM settings WHERE key = 'flash_manual'");
            data.generadorFlash = !!(fm.rows[0] && String(fm.rows[0].value).trim() === '1');
        } catch (e) { data.generadorFlash = false; }

        preciosCache = { data, ts: now };
        res.json({ ...data, flash });
    } catch (e) {
        console.error('Precios error:', e.message);
        res.json({ available: false, flash, error: e.message });
    }
});

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

        let general = 0, vip = 0, ultra = 0, backstage = 0;
        r.rows.forEach((row) => {
            const t = (row.type_name || '').toLowerCase();
            if (t.includes('ultra')) ultra += row.n;          // "Ultra vip"
            else if (t.includes('backstage')) backstage += row.n; // "Backstage"
            else if (t.includes('vip')) vip += row.n;         // "VIP"
            else general += row.n;                            // "Uady", "Externo"
        });
        const reales = { general, vip, ultra, backstage };

        // Compras extra (por tipo) + cupo TOTAL por tipo
        const boost = await getBoost();
        const cupos = await getCupos();
        const mk = (real, extra, cap) => {
            const sold = real + extra;
            return { sold, real, boost: extra, cap, left: Math.max(0, cap - sold) };
        };

        const data = { available: true, fase: faseName, updatedAt: new Date().toISOString() };
        let tSold = 0, tReal = 0, tBoost = 0, tCap = 0;
        CATS.forEach((c) => {
            data[c] = mk(reales[c], boost[c], cupos[c]);
            tSold += data[c].sold; tReal += reales[c]; tBoost += boost[c]; tCap += cupos[c];
        });
        data.total = { sold: tSold, real: tReal, boost: tBoost, cap: tCap, left: Math.max(0, tCap - tSold) };

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
