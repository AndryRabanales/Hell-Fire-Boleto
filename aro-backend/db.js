const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
require('dotenv').config();

const isProd = !!process.env.DATABASE_URL;

let pgPool = null;
let sqliteDb = null;

async function initDB() {
  if (isProd) {
    const dbUrl = process.env.DATABASE_URL;
    const maskedUrl = dbUrl ? dbUrl.replace(/:[^@:]+@/, ':****@') : 'NONE';
    console.log(`🔗 Attempting to connect to PostgreSQL at: ${maskedUrl}`);

    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });

    // Create tables in Postgres
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        ticket_type VARCHAR(255) NOT NULL,
        instagram VARCHAR(255) NOT NULL,
        whatsapp VARCHAR(255),
        fase VARCHAR(255),
        quantity INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        price_each REAL NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='whatsapp') THEN
          ALTER TABLE reservations ADD COLUMN whatsapp VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservations' AND column_name='fase') THEN
          ALTER TABLE reservations ADD COLUMN fase VARCHAR(255);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    console.log('🔗 Connecting to local SQLite fallback...');
    sqliteDb = await open({
      filename: './database.sqlite',
      driver: sqlite3.Database
    });

    // Create tables in SQLite
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_type TEXT NOT NULL,
        instagram TEXT NOT NULL,
        whatsapp TEXT,
        fase TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        price_each REAL NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add columns if they do not exist in SQLite
    try { await sqliteDb.exec("ALTER TABLE reservations ADD COLUMN whatsapp TEXT;"); } catch (e) { }
    try { await sqliteDb.exec("ALTER TABLE reservations ADD COLUMN fase TEXT;"); } catch (e) { }
  }

  // Common seed config
  const initConfig = [
    ['phases', `[
      { "id": "1", "name": "Preventa", "endDate": "2026-04-03T00:00:00" },
      { "id": "2", "name": "Venta regular", "endDate": "2026-04-19T00:00:00" },
      { "id": "3", "name": "Última llamada", "endDate": "2026-04-25T00:00:00" },
      { "id": "4", "name": "Mero día", "endDate": "2026-04-26T00:00:00" }
    ]`],
    ['tickets', `[
      { "id": "students", "label": "UADY", "emoji": "🎓", "subtitle": "Credencial UADY vigente requerida", "realStock": 700, "fakeTotal": 700, "fakeStart": 30, "prices": { "1": 150, "2": 180, "3": 200, "4": 250 }, "badge": "PREVENTA", "badgeClass": "badge-normal" },
      { "id": "general", "label": "Externos", "emoji": "🎉", "subtitle": "Acceso completo al evento", "realStock": 700, "fakeTotal": 700, "fakeStart": 42, "prices": { "1": 180, "2": 200, "3": 250, "4": 300 }, "badge": "MÁS POPULAR", "badgeClass": "badge-popular" },
      { "id": "vip", "label": "VIP", "emoji": "✨", "subtitle": "Experiencia premium sin igual", "realStock": 200, "fakeTotal": 200, "fakeStart": 6, "prices": { "1": 300, "2": 350, "3": 400, "4": 500 }, "badge": "EXCLUSIVO", "badgeClass": "badge-exclusive" }
    ]`],
    ['faqs', `[
      { "id": "faq1", "question": "¿Cómo pago mi boleto?", "answer": "Aceptamos transferencia bancaria, CoDi y OXXO Pay. Al confirmar tu compra recibirás por WhatsApp los datos de pago." },
      { "id": "faq2", "question": "¿Me dan mi boleto físico o digital?", "answer": "Tu boleto es 100% digital (QR único). Lo recibirás por WhatsApp y correo." }
    ]`],
    ['event_info', `{
      "title": "HELL FIRE",
        "subtitle": "Noche de terror & fiesta — Halloween 2026",
          "date_text": "Sábado 31 de Octubre",
            "whatsapp": "529992691367",
              "instagram": "https://instagram.com",
                "tiktok": "https://tiktok.com",
                  "show_timer": true,
                    "show_phase_alert": true,
                      "show_whatsapp": true,
                        "show_instagram": true,
                          "show_tiktok": true
    } `],
    ['rewards', `[
      { "id": "1", "icon": "🍾", "title": "Botelletazo Gratis", "description": "En la compra de 10 boletos, ¡te regalamos una botella!" },
      { "id": "2", "icon": "🍀", "title": "Sorteo Especial", "description": "10 personas que aparten y paguen hoy participan por una botella." },
      { "id": "3", "icon": "⏰", "title": "Acceso Botella", "description": "Se permite el ingreso de tu propia botella antes de las 11:00 PM." },
      { "id": "4", "icon": "📱", "title": "Descuento Social", "description": "Comparte en tus historias de IG y obtén un 10% OFF." }
    ]`],
    ['visits', '0']
  ];

  for (const [key, value] of initConfig) {
    if (isProd) {
      await pgPool.query('INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
    } else {
      await sqliteDb.run('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  // ── Cuentas de admin (se crean/actualizan solas al iniciar) ──
  // El "email" es solo el usuario de login. Las contraseñas salen de variables
  // de entorno; si no están definidas se usa un fallback (cámbialo en producción).
  const bcrypt = require('bcryptjs');
  const ADMIN_ACCOUNTS = [
    { name: 'General', email: 'admin@hellfire.com', password: process.env.GENERAL_ADMIN_PASSWORD || 'HellFire2026' },
    { name: 'Andry', email: 'andry@hellfire.com', password: process.env.ANDRY_ADMIN_PASSWORD || 'Andry2026' },
    { name: 'Osmar', email: 'osmar@hellfire.com', password: process.env.OSMAR_ADMIN_PASSWORD || 'Osmar2026' },
  ];

  const missingPass = ADMIN_ACCOUNTS.filter(a =>
    (a.name === 'General' && !process.env.GENERAL_ADMIN_PASSWORD) ||
    (a.name === 'Andry' && !process.env.ANDRY_ADMIN_PASSWORD) ||
    (a.name === 'Osmar' && !process.env.OSMAR_ADMIN_PASSWORD)
  );
  if (missingPass.length) {
    console.warn(`⚠️  Usando contraseñas por defecto para: ${missingPass.map(a => a.name).join(', ')} (defínelas en variables de entorno para producción).`);
  }

  for (const acc of ADMIN_ACCOUNTS) {
    const hash = bcrypt.hashSync(acc.password, 10);
    if (isProd) {
      await pgPool.query(
        'INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash',
        [acc.name, acc.email, hash]
      );
    } else {
      const existing = await sqliteDb.get('SELECT id FROM admins WHERE email = ?', [acc.email]);
      if (existing) {
        await sqliteDb.run('UPDATE admins SET name = ?, password_hash = ? WHERE email = ?', [acc.name, hash, acc.email]);
      } else {
        await sqliteDb.run('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)', [acc.name, acc.email, hash]);
      }
    }
  }

  console.log(isProd ? '✅ PostgreSQL Database ready' : '✅ SQLite Database initialized successfully');
}

/**
 * Universal Query wrapper (returns array of rows)
 * ALWAYS use Postgres syntax $1, $2, etc. in your queries!
 */
async function query(sql, params = []) {
  if (isProd) {
    const { rows } = await pgPool.query(sql, params);
    return rows;
  } else {
    // Convert $1, $2 -> ? for SQLite
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    return await sqliteDb.all(sqliteSql, params);
  }
}

/**
 * Universal Get wrapper (returns single row object)
 */
async function getRow(sql, params = []) {
  if (isProd) {
    const { rows } = await pgPool.query(sql, params);
    return rows[0] || null;
  } else {
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    return await sqliteDb.get(sqliteSql, params);
  }
}

/**
 * Universal Execute wrapper (for Inserts, Updates, Deletes)
 * Returns the auto-increment ID if it was an insert (varies slightly by DB, so we use RETURNING id in pg, and lastID in sqlite)
 */
async function execute(sql, params = []) {
  if (isProd) {
    const { rows, rowCount } = await pgPool.query(sql, params);
    // If it's an INSERT with RETURNING, the first row will contain the data
    return rows[0] ? rows[0] : { changes: rowCount };
  } else {
    // If the query contains RETURNING id (Postgres specific), remove it for SQLite
    let sqliteSql = sql.replace(/\$\d+/g, '?');

    // SQLite 3.35+ supports RETURNING, but for backward compatibility with older node-sqlite3 versions
    // that might wrap sql.run which doesn't return rows, we do a simple check.
    if (sqliteSql.toUpperCase().includes('RETURNING')) {
      return await sqliteDb.get(sqliteSql, params);
    }

    const result = await sqliteDb.run(sqliteSql, params);
    return { id: result.lastID, changes: result.changes };
  }
}

module.exports = { initDB, query, getRow, execute };
