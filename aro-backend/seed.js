/**
 * ARO Admin Seed Script (OPCIONAL)
 *
 * Ya no es necesario: las 3 cuentas de admin se crean solas al iniciar el
 * servidor (ver db.js). Este script solo sirve si quieres forzar la
 * creación/actualización manualmente.
 *
 * Las contraseñas se leen de variables de entorno:
 *   GENERAL_ADMIN_PASSWORD, ANDRY_ADMIN_PASSWORD, OSMAR_ADMIN_PASSWORD
 *
 * Uso: node seed.js   (o en Railway: node aro-backend/seed.js)
 */
const bcrypt = require('bcryptjs');
const { initDB, execute } = require('./db');
require('dotenv').config();

const ADMINS = [
    { name: 'General', email: 'admin@hellfire.com', envVar: 'GENERAL_ADMIN_PASSWORD' },
    { name: 'Andry', email: 'andry@hellfire.com', envVar: 'ANDRY_ADMIN_PASSWORD' },
    { name: 'Osmar', email: 'osmar@hellfire.com', envVar: 'OSMAR_ADMIN_PASSWORD' },
].map(a => ({ ...a, password: process.env[a.envVar] }));

async function seed() {
    console.log('🌱 Seeding admin accounts...');

    try {
        await initDB();

        let created = 0;
        let skipped = 0;

        for (const admin of ADMINS) {
            if (!admin.password) {
                console.warn(`⏭️  Omitido ${admin.email} — falta la variable de entorno ${admin.envVar}`);
                skipped++;
                continue;
            }

            const hash = await bcrypt.hash(admin.password, 12);

            const sql = process.env.DATABASE_URL
                ? `INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)
                   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`
                : `INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)`;

            try {
                await execute(sql, [admin.name, admin.email, hash]);
                console.log(`✅ Admin gestionado: ${admin.email}`);
                created++;
            } catch (err) {
                if (err.message.includes('UNIQUE')) {
                    console.log(`ℹ️ Admin ya existe: ${admin.email}`);
                } else {
                    console.error(`❌ Error con ${admin.email}:`, err.message);
                }
            }
        }

        console.log(`\n✨ Seed completado. Gestionados: ${created} · Omitidos: ${skipped}`);
    } catch (err) {
        console.error('❌ Error fatal en seed:', err.message);
    }
    process.exit(0);
}

seed();
