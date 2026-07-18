// Node 18+ has global fetch

async function testLogin() {
    const url = 'https://aro-production-production.up.railway.app/api/auth/login';
    const email = 'admin@aro.com';
    const password = 'aro2025';

    console.log(`Testing login at: ${url}`);
    console.log(`Email: ${email}, Password: ${password}`);

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        console.log(`Status: ${resp.status}`);
        const data = await resp.json();
        console.log('Response:', data);
    } catch (err) {
        console.error('Test failed:', err.message);
    }
}

testLogin();
