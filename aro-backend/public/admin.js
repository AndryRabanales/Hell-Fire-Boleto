/* ============================================================
   HELL FIRE — Panel de administración
   Solo: ventas reales (generador) + clics de "Apartar" + historial.
   ============================================================ */

const API_URL = '';
let currentReservations = [];

// Orden cronológico de las fases (coincide con la página nueva)
const PHASE_ORDER = ['Preventa', 'Venta regular', 'Última llamada', 'Fase 4', 'Mero día'];
const orderOf = (name) => {
    const i = PHASE_ORDER.indexOf(name);
    return i === -1 ? 99 : i;
};

// Categoría a partir de la etiqueta del nivel
function catDe(label) {
    const t = (label || '').toLowerCase();
    if (t.includes('ultra')) return 'ultra';
    if (t.includes('vip')) return 'vip';
    return 'general';
}

/* ── Auth ── */
async function handleLogin() {
    const email = document.getElementById('login-email').value.toLowerCase().trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    if (!email || !password) {
        errorDiv.innerText = 'Email y contraseña requeridos';
        return;
    }

    try {
        btn.disabled = true;
        btn.innerText = 'Entrando…';
        errorDiv.innerText = '';

        const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Error al iniciar sesión');

        sessionStorage.setItem('aro_admin_token', data.token);
        sessionStorage.setItem('aro_admin_name', data.name);

        document.getElementById('admin-name').innerText = data.name;
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';

        loadDashboard();
        showToast('¡Bienvenido, ' + data.name + '!');
    } catch (err) {
        errorDiv.innerText = err.message;
    } finally {
        btn.disabled = false;
        btn.innerText = 'Entrar';
    }
}

function logout() {
    sessionStorage.removeItem('aro_admin_token');
    sessionStorage.removeItem('aro_admin_name');
    location.reload();
}

function apiHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + sessionStorage.getItem('aro_admin_token'),
    };
}

/* ── Dashboard ── */
async function loadDashboard() {
    await Promise.all([loadVentas(), loadVisits(), loadReservations(), loadBoostInputs()]);
    renderClicks();
}

// Rellena el ajuste (extra) y el editor de cupos por fase desde la config
async function loadBoostInputs() {
    try {
        const r = await fetch(`${API_URL}/api/config`);
        const c = await r.json();
        const b = c.ventas_boost || {};
        ['general', 'vip', 'ultra'].forEach((cat) => {
            const bi = document.getElementById(`boost-${cat}`);
            if (bi && document.activeElement !== bi) bi.value = b[cat] ?? 0;
        });
        renderCuposEditor(c.ventas_cupos_fase || {});
    } catch (e) { /* silencioso */ }
}

// Ventas reales del generador
async function loadVentas() {
    const badge = document.getElementById('ventas-estado');
    try {
        const fase = document.getElementById('fase-select')?.value || 'Preventa';
        let url = `${API_URL}/api/ventas?fase=` + encodeURIComponent(fase);
        if (window.__ventasFresh) url += '&fresh=1';
        const res = await fetch(url);
        const v = await res.json();

        if (!v || !v.available) {
            badge.textContent = 'Sin conexión al generador';
            badge.classList.add('is-off');
            return;
        }

        badge.textContent = 'Conectado ✓';
        badge.classList.remove('is-off');

        ['general', 'vip', 'ultra'].forEach((cat) => {
            const c = v[cat];
            if (!c) return;
            document.getElementById(`v-${cat}-sold`).textContent = c.sold;
            document.getElementById(`v-${cat}-left`).textContent = c.left;
            document.getElementById(`v-${cat}-cap`).textContent = c.cap;
            const pct = c.cap ? Math.min(100, Math.round((c.sold / c.cap) * 100)) : 0;
            document.getElementById(`v-${cat}-bar`).style.width = pct + '%';
            const det = document.getElementById(`v-${cat}-detail`);
            if (det) det.textContent = `reales ${c.real ?? c.sold} · extra ${c.boost ?? 0}`;
            // Rellena el input de ajuste (si el usuario no lo está editando)
            const inp = document.getElementById(`boost-${cat}`);
            if (inp && document.activeElement !== inp) inp.value = c.boost ?? 0;
        });

        document.getElementById('v-total-sold').textContent = v.total.sold;
        document.getElementById('v-total-left').textContent = v.total.left;
        if (v.updatedAt) {
            const d = new Date(v.updatedAt);
            document.getElementById('v-updated').textContent =
                'Actualizado ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
        }
    } catch (err) {
        badge.textContent = 'Error al leer ventas';
        badge.classList.add('is-off');
    }
}

// Guardar el ajuste manual (compras extra)
async function saveBoost() {
    const value = {
        general: parseInt(document.getElementById('boost-general').value) || 0,
        vip: parseInt(document.getElementById('boost-vip').value) || 0,
        ultra: parseInt(document.getElementById('boost-ultra').value) || 0,
    };
    try {
        const res = await fetch(`${API_URL}/api/config/ventas_boost`, {
            method: 'PUT',
            headers: apiHeaders(),
            body: JSON.stringify({ value }),
        });
        if (res.status === 401 || res.status === 403) return logout();
        if (!res.ok) throw new Error();
        showToast('Ajuste guardado');
        // Refresca las ventas saltando la caché para ver el efecto al instante
        await loadVentasFresh();
    } catch (err) {
        showToast('Error al guardar el ajuste', 'error');
    }
}

async function loadVentasFresh() {
    const orig = window.__ventasFresh;
    window.__ventasFresh = true;
    await loadVentas();
    window.__ventasFresh = orig;
}

// ── Cupos por fase y tipo ──
const PHASES = ['Preventa', 'Venta regular', 'Última llamada', 'Fase 4', 'Mero día'];
const TIPOS = [['general', 'General'], ['vip', 'VIP'], ['ultra', 'Ultra VIP']];

function renderCuposEditor(cuposFase) {
    const cont = document.getElementById('cupos-fase-editor');
    if (!cont) return;
    // No re-renderizar si el usuario está escribiendo en un input de cupo
    if (cont.contains(document.activeElement)) return;

    cont.innerHTML = PHASES.map((ph) => {
        const c = (cuposFase && cuposFase[ph]) || {};
        const inputs = TIPOS.map(([t, lbl]) => `
            <label class="cupo-field">
                <span>${lbl}</span>
                <input type="number" min="0" class="field field--sm cupo-input"
                    data-fase="${ph}" data-tipo="${t}" value="${c[t] ?? 0}">
            </label>`).join('');
        return `<div class="cupo-fase"><div class="cupo-fase__name">${ph}</div><div class="cupo-fase__row">${inputs}</div></div>`;
    }).join('');
}

async function saveCuposFase() {
    const value = {};
    PHASES.forEach((ph) => { value[ph] = { general: 0, vip: 0, ultra: 0 }; });
    document.querySelectorAll('.cupo-input').forEach((inp) => {
        const ph = inp.dataset.fase, t = inp.dataset.tipo;
        if (value[ph]) value[ph][t] = parseInt(inp.value) || 0;
    });
    try {
        const res = await fetch(`${API_URL}/api/config/ventas_cupos_fase`, {
            method: 'PUT',
            headers: apiHeaders(),
            body: JSON.stringify({ value }),
        });
        if (res.status === 401 || res.status === 403) return logout();
        if (!res.ok) throw new Error();
        showToast('Cupos por fase guardados');
        await loadVentasFresh();
    } catch (err) {
        showToast('Error al guardar los cupos', 'error');
    }
}

// Visitas a la página
async function loadVisits() {
    try {
        const res = await fetch(`${API_URL}/api/stats`, { headers: apiHeaders() });
        if (res.status === 401) return logout();
        const data = await res.json();
        document.getElementById('stat-visits').textContent = data.visits ?? 0;
    } catch (err) { /* silencioso */ }
}

// Clics de apartar (reservas)
async function loadReservations() {
    try {
        const search = document.getElementById('filter-search').value;
        let url = `${API_URL}/api/reservations?limit=500`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const res = await fetch(url, { headers: apiHeaders() });
        if (res.status === 401) return logout();
        const data = await res.json();

        currentReservations = data.reservations || [];
        renderReservationsTable();
        renderClicks();
    } catch (err) {
        showToast('Error cargando clics', 'error');
    }
}

function renderClicks() {
    const active = currentReservations.filter((r) => r.status !== 'cancelled');

    let totalQty = 0, totalRev = 0;
    active.forEach((r) => {
        totalQty += r.quantity;
        totalRev += r.quantity * r.price_each;
    });
    document.getElementById('stat-total-qty').textContent = totalQty;
    document.getElementById('stat-total-rev').textContent = '$' + totalRev.toFixed(0);

    // Por fase
    const byPhase = {};
    active.forEach((r) => {
        const f = r.fase || '—';
        byPhase[f] = (byPhase[f] || 0) + r.quantity;
    });
    const phaseBody = document.getElementById('phase-table-body');
    const phaseRows = Object.entries(byPhase).sort((a, b) => orderOf(a[0]) - orderOf(b[0]));
    phaseBody.innerHTML = phaseRows.length
        ? phaseRows.map(([f, n]) => `<tr><td><strong>${f}</strong></td><td>${n}</td></tr>`).join('')
        : '<tr><td colspan="2" class="muted">Aún no hay clics</td></tr>';

    // Por nivel y fase
    const combo = {};
    active.forEach((r) => {
        const key = `${r.ticket_type}|${r.fase || '—'}`;
        if (!combo[key]) combo[key] = { nivel: r.ticket_type, fase: r.fase || '—', n: 0 };
        combo[key].n += r.quantity;
    });
    const bBody = document.getElementById('breakdown-table-body');
    const rows = Object.values(combo).sort((a, b) =>
        a.nivel.localeCompare(b.nivel) || orderOf(a.fase) - orderOf(b.fase)
    );
    bBody.innerHTML = rows.length
        ? rows.map((c) => `
            <tr>
                <td><span class="pill pill--${catDe(c.nivel)}">${c.nivel}</span></td>
                <td>${c.fase}</td>
                <td>${c.n}</td>
            </tr>`).join('')
        : '<tr><td colspan="3" class="muted">Aún no hay clics</td></tr>';
}

/* ── Historial de clics ── */
function timeAgo(date) {
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return 'Hace un momento';
    if (s < 3600) return 'Hace ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'Hace ' + Math.floor(s / 3600) + ' h';
    return 'Hace ' + Math.floor(s / 86400) + ' d';
}

function renderReservationsTable() {
    const tbody = document.getElementById('reservations-table-body');
    if (currentReservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">Aún no hay clics registrados</td></tr>';
        return;
    }
    tbody.innerHTML = currentReservations.map((r) => {
        const d = new Date(r.created_at);
        const fecha = `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        return `
            <tr>
                <td class="muted">#${r.id}</td>
                <td><div>${timeAgo(r.created_at)}</div><div style="font-size:10px;color:var(--muted)">${fecha}</div></td>
                <td><span class="pill pill--${catDe(r.ticket_type)}">${r.ticket_type}</span></td>
                <td>${r.fase || '—'}</td>
                <td>$${r.price_each}</td>
                <td><button class="link-del" title="Eliminar" onclick="deleteReservation(${r.id})">🗑</button></td>
            </tr>`;
    }).join('');
}

async function deleteReservation(id) {
    if (!confirm('¿Eliminar este clic del registro?')) return;
    try {
        const res = await fetch(`${API_URL}/api/reservations/${id}`, { method: 'DELETE', headers: apiHeaders() });
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error();
        currentReservations = currentReservations.filter((x) => x.id !== id);
        renderReservationsTable();
        renderClicks();
        showToast('Registro eliminado');
    } catch (err) {
        showToast('Error al eliminar', 'error');
    }
}

/* ── Toast ── */
function showToast(msg) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

/* ── Init ── */
window.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('aro_admin_token')) {
        const name = sessionStorage.getItem('aro_admin_name');
        if (name) document.getElementById('admin-name').innerText = name;
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        loadDashboard();
    }
    // Refresca ventas reales cada 60s
    setInterval(() => {
        if (sessionStorage.getItem('aro_admin_token')) loadVentas();
    }, 60000);
});
