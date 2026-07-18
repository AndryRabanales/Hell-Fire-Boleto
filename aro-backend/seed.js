/**
 * ARO Admin Seed Script
 * Run once to create the 3 admin accounts in SQLite.
 * Usage: node seed.js
 */
const bcrypt = require('bcryptjs');
const { initDB, execute } = require('./db');
require('dotenv').config();

const ADMINS = [
    { name: 'Andry Rabanales', email: 'andry_halo2@aro.com', password: 'Rabanales1123' },
    { name: 'Osmar Can', email: 'Osmar_Boy@aro.com', password: 'Gomiboy69' },
    { name: 'Russel Bonilla', email: 'Russel_Bonilla@aro.com', password: 'Bonilla321' },
];

async function seed() {
    console.log('🌱 Seeding admin accounts...');

    try {
        await initDB();

        for (const admin of ADMINS) {
            const hash = await bcrypt.hash(admin.password, 12);
            // Using a standard INSERT that works with both (Postgres prefers ON CONFLICT)
            // But since this is a seed, we can just try to insert and catch or use universal logic

            const sql = process.env.DATABASE_URL
                ? `INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3) 
                   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`
                : `INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)`;

            try {
                await execute(sql, [admin.name, admin.email, hash]);
                console.log(`✅ Admin gestionado: ${admin.email}`);
            } catch (err) {
                if (err.message.includes('UNIQUE')) {
                    console.log(`ℹ️ Admin ya existe: ${admin.email}`);
                } else {
                    console.error(`❌ Error con ${admin.email}:`, err.message);
                }
            }
        }

        console.log('\n✨ Seed completado con éxito.');
    } catch (err) {
        console.error('❌ Error fatal en seed:', err.message);
    }
    process.exit(0);
}

seed();
