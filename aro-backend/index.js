const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDB } = require('./db');
const authRoutes = require('./routes/auth');
const reservationsRoutes = require('./routes/reservations');
const configRoutes = require('./routes/config');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Static Files (Admin CMS Panel & Frontend) ─────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/config', configRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Ruta de API no encontrada' }));

// ── Start ──────────────────────────────────────────────────
async function start() {
    console.log(`📡 Starting ARO Server (Port: ${PORT})...`);
    try {
        await initDB();
        console.log('✅ Database connection established.');

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 ARO API & Server running on http://0.0.0.0:${PORT}`);
            console.log(`🔗 Health check: http://0.0.0.0:${PORT}/health`);
        });
    } catch (err) {
        console.error('CRITICAL: Failed to start server!');
        console.error('Reason:', err.message);
        if (err.stack) console.error('Stack:', err.stack);

        // Don't exit immediately so Railway logs can capture the error
        setTimeout(() => {
            process.exit(1);
        }, 5000);
    }
}

start();
