const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getRow } = require('../db');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    try {
        const cleanEmail = email.toLowerCase().trim();
        const cleanPassword = password; // Passwords shouldn't be trimmed usually, but let's check

        console.log(`🔐 Login attempt for: [${cleanEmail}]`);
        console.log(`📏 Password length: ${cleanPassword.length}`);

        const admin = await getRow('SELECT * FROM admins WHERE email = $1', [cleanEmail]);

        if (!admin) {
            console.warn(`❌ No admin found with email: ${cleanEmail}`);
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const valid = await bcrypt.compare(cleanPassword, admin.password_hash);
        console.log(`🔍 Password match: ${valid}`);

        if (!valid) {
            console.warn(`❌ Invalid password for: ${cleanEmail}`);
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const token = jwt.sign(
            { id: admin.id, email: admin.email, name: admin.name },
            process.env.JWT_SECRET || 'fallback_secret_for_local_testing',
            { expiresIn: '12h' }
        );

        res.json({ token, name: admin.name, email: admin.email });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// GET /api/auth/me — verify token
router.get('/me', require('../middleware/auth'), (req, res) => {
    res.json({ id: req.admin.id, email: req.admin.email, name: req.admin.name });
});

module.exports = router;
