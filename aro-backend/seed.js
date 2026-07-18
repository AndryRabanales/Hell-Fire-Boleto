/**
 * ARO Admin Seed Script
 * Crea/actualiza las cuentas de admin.
 * Las contraseñas se leen de variables de entorno (NO se guardan en el código).
 *
 * Variables esperadas (define las que quieras usar):
 *   ADMIN_ANDRY_PASSWORD
 *   ADMIN_OSMAR_PASSWORD
 *   ADMIN_RUSSEL_PASSWORD
 *
 * Uso: node seed.js   (o en Railway: node aro-backend/seed.js)
 */
const bcrypt = require('bcryptjs');
const { initDB, execute } = require('./db');
require('dotenv').config();

const ADMINS = [
    { name: 'Andry Rabanales', email: 'andry_halo2@aro.com', envVar: 'ADMIN_ANDRY_PASSWORD' },
    { name: 'Osmar Can', email: 'Osmar_Boy@aro.com', envVar: 'ADMIN_OSMAR_PASSWORD' },
    { name: 'Russel Bonilla', email: 'Russel_Bonilla@aro.com', envVar: 'ADMIN_RUSSEL_PASSWORD' },
].map(a => ({ ...a, password: process.env[a.envVar] }));

async function seed() {
    console.log('🌱 Seeding admin accounts...');

    try {
        await initDB();

        let created = 0;
        let skipped = 0;

        for (const admin of ADMINS) {
            // Sin contraseña en el entorno → no creamos la cuenta (nunca usamos una por defecto)
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
        if (skipped > 0) {
            console.log('   Define las variables de entorno faltantes y vuelve a correr el seed.');
        }
    } catch (err) {
        console.error('❌ Error fatal en seed:', err.message);
    }
    process.exit(0);
}

seed();
