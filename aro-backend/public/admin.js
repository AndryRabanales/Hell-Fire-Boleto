// ============================================================
// GLOBAL STATE & CONFIG
// ============================================================
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL ? 'http://localhost:3001' : '';

let currentReservations = [];
let dbConfig = {
    phases: [],
    tickets: [],
    rewards: [],
    event_info: {},
    metric_descriptions: { qty: '', rev: '', res: '' }
};

// ============================================================
// NAVIGATION & VIEW SWITCHING
// ============================================================
function switchView(viewId, btn) {
    document.querySelectorAll('.main-view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');

    if (viewId === 'data') loadDashboard();
    if (viewId === 'editor') refreshPreview();
}

function showTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
}

// ============================================================
// REAL-TIME PREVIEW SYNC
// ============================================================
function syncPreview() {
    const iframe = document.getElementById('preview-iframe');
    if (!iframe || !iframe.contentWindow) return;

    // Collect current state from form inputs
    const currentConfig = {
        event_info: {
            title: document.getElementById('edit-title').value,
            subtitle: document.getElementById('edit-subtitle').value,
            date_text: document.getElementById('edit-date-text').value,
            show_timer: document.getElementById('toggle-timer').checked,
            show_phase_alert: document.getElementById('toggle-phase-alert').checked,
            whatsapp: document.getElementById('edit-whatsapp').value,
            instagram: document.getElementById('edit-instagram').value,
            tiktok: document.getElementById('edit-tiktok').value,
            show_whatsapp: true, // Auto-enable if editing
            show_instagram: true,
            show_tiktok: true
        },
        // For simple sync, we can just send the whole dbConfig object for tickets/phases/faqs
        // since they are managed via arrays and renderers.
        tickets: dbConfig.tickets,
        phases: dbConfig.phases,
        rewards: dbConfig.rewards
    };

    iframe.contentWindow.postMessage({
        type: 'UPDATE_CONFIG',
        data: currentConfig
    }, '*');
}

function refreshPreview() {
    const iframe = document.getElementById('preview-iframe');
    iframe.src = 'index.html?t=' + Date.now();
    // After load, sync the current state
    iframe.onload = () => syncPreview();
}

// ============================================================
// LOAD CONFIG & INITIAL RENDER
// ============================================================
async function loadConfig() {
    try {
        const res = await fetch(`${API_URL}/api/config`);
        if (!res.ok) return;
        const data = await res.json();

        dbConfig.phases = data.phases || [];
        dbConfig.tickets = data.tickets || [];
        dbConfig.rewards = data.rewards || [];
        dbConfig.event_info = data.event_info || {};
        dbConfig.metric_descriptions = data.metric_descriptions || { qty: '', rev: '', res: '' };

        renderEditorSections();
    } catch (err) {
        showToast('Error cargando configuración', 'error');
    }
}

function renderEditorSections() {
    // Fill General Info
    const c = dbConfig.event_info;
    document.getElementById('edit-title').value = c.title || '';
    document.getElementById('edit-subtitle').value = c.subtitle || '';
    document.getElementById('edit-date-text').value = c.date_text || '';
    document.getElementById('toggle-timer').checked = c.show_timer;
    document.getElementById('toggle-phase-alert').checked = c.show_phase_alert;
    document.getElementById('edit-whatsapp').value = c.whatsapp || '';
    document.getElementById('edit-instagram').value = c.instagram || '';
    document.getElementById('edit-tiktok').value = c.tiktok || '';

    renderEditorTickets();
    renderEditorPhases();
    renderEditorRewards();
    renderMetricDescriptions();
}

function renderMetricDescriptions() {
    if (dbConfig.metric_descriptions) {
        if (document.getElementById('desc-qty')) document.getElementById('desc-qty').value = dbConfig.metric_descriptions.qty || '';
        if (document.getElementById('desc-rev')) document.getElementById('desc-rev').value = dbConfig.metric_descriptions.rev || '';
        if (document.getElementById('desc-res')) document.getElementById('desc-res').value = dbConfig.metric_descriptions.res || '';
    }
}

function toggleFlip(el) {
    if (el.classList.contains('editing')) return; // Don't flip back if editing? Or just let it flip.
    el.classList.toggle('flipped');
}

async function saveMetricDescription(metricKey) {
    const newVal = document.getElementById(`desc-${metricKey}`).value;
    dbConfig.metric_descriptions[metricKey] = newVal;

    try {
        const resp = await saveConfigField('metric_descriptions', dbConfig.metric_descriptions);
        if (resp.ok) {
            showToast(`Descripción de ${metricKey} guardada`, 'success');
            // Remove flipped class after save if desired, or keep it.
            // document.getElementById(`card-${metricKey}`).classList.remove('flipped');
        } else {
            throw new Error();
        }
    } catch (err) {
        showToast('Error al guardar descripción', 'error');
    }
}

// ============================================================
// TICKET RENDERER (Editor)
// ============================================================
function renderEditorTickets() {
    const container = document.getElementById('editor-tickets-list');
    container.innerHTML = '';

    dbConfig.tickets.forEach((t, idx) => {
        const item = document.createElement('div');
        item.className = 'editor-card-item';
        item.style = 'background:rgba(0,0,0,0.2); padding:15px; border-radius:12px; margin-bottom:12px; border:1px solid var(--border);';
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700;">${t.emoji} ${t.label}</span>
                <div style="display:flex; gap:8px;">
                    <button class="btn-secondary" style="padding:4px 8px; font-size:12px;" onclick="openTicketModal(${idx})">✏️</button>
                    <button class="btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteTicket(${idx})">🗑️</button>
                </div>
            </div>
            <p style="font-size:11px; color:var(--muted); margin-top:5px;">Stock: ${t.realStock} | Falso: ${t.fakeStart}/${t.fakeTotal}</p>
        `;
        container.appendChild(item);
    });
}

let editingTicketIdx = null;

function openTicketModal(idx = null) {
    editingTicketIdx = idx;
    const t = idx !== null ? dbConfig.tickets[idx] : {
        id: 'new-' + Date.now(),
        label: '',
        emoji: '🎟️',
        realStock: 100,
        fakeStart: 70,
        fakeTotal: 100,
        prices: {}
    };

    document.getElementById('ticket-modal-title').innerText = idx !== null ? 'Editar Boleto' : 'Nuevo Boleto';
    const body = document.getElementById('ticket-modal-body');

    let pricesHtml = '';
    dbConfig.phases.forEach(p => {
        pricesHtml += `
            <div style="margin-bottom:8px;">
                <label style="font-size:11px; color:var(--muted)">Precio en ${p.name}</label>
                <input type="number" class="editor-input" value="${t.prices[p.id] || 0}" oninput="updateModalTicketPrice('${p.id}', this.value)">
            </div>
        `;
    });

    body.innerHTML = `
        <div class="editor-form-group">
            <label>Nombre / Categoría</label>
            <input type="text" id="modal-t-label" class="editor-input" value="${t.label}" placeholder="Ej: General">
        </div>
        <div class="editor-form-group">
            <label>Emoji</label>
            <input type="text" id="modal-t-emoji" class="editor-input" value="${t.emoji}" placeholder="🎟️">
        </div>
            <div style="flex:1">
                <label>Stock Real</label>
                <input type="number" id="modal-t-stock" class="editor-input" value="${t.realStock}">
            </div>
            <div style="flex:1">
                <label>Punto Inicio (Falso)</label>
                <input type="number" id="modal-t-fakestart" class="editor-input" value="${t.fakeStart}">
            </div>
            <div style="flex:1">
                <label>Total Vista (Falso)</label>
                <input type="number" id="modal-t-faketotal" class="editor-input" value="${t.fakeTotal}">
            </div>
        </div>
        <div style="margin-top:15px;">
            <label style="font-weight:600; display:block; margin-bottom:10px;">Precios por Fase</label>
            <div id="modal-prices-container">
                ${pricesHtml}
            </div>
        </div>
    `;

    document.getElementById('ticket-modal').style.display = 'flex';
}

function updateModalTicketPrice(phaseId, val) {
    // This will be handled in saveTicketModal by reading all inputs or we can keep a temp object
}

function closeTicketModal() {
    document.getElementById('ticket-modal').style.display = 'none';
}

function saveTicketModal() {
    const label = document.getElementById('modal-t-label').value;
    const emoji = document.getElementById('modal-t-emoji').value;
    const realStock = parseInt(document.getElementById('modal-t-stock').value);
    const fakeStart = parseInt(document.getElementById('modal-t-fakestart').value);
    const fakeTotal = parseInt(document.getElementById('modal-t-faketotal').value);

    const prices = {};
    const priceInputs = document.querySelectorAll('#modal-prices-container input');
    dbConfig.phases.forEach((p, i) => {
        prices[p.id] = parseInt(priceInputs[i].value) || 0;
    });

    const ticketData = {
        id: editingTicketIdx !== null ? dbConfig.tickets[editingTicketIdx].id : 'tkt-' + Date.now(),
        label,
        emoji,
        realStock,
        fakeStart,
        fakeTotal,
        prices
    };

    if (editingTicketIdx !== null) {
        dbConfig.tickets[editingTicketIdx] = ticketData;
    } else {
        dbConfig.tickets.push(ticketData);
    }

    closeTicketModal();
    renderEditorTickets();
    syncPreview();
}

function deleteTicket(idx) {
    if (confirm('¿Seguro que quieres borrar este boleto?')) {
        dbConfig.tickets.splice(idx, 1);
        renderEditorTickets();
        syncPreview();
    }
}

// ================= ===========================================
// DATA PERSISTENCE
// ============================================================
async function saveVisualChanges() {
    // Collect final state
    dbConfig.event_info = {
        title: document.getElementById('edit-title').value,
        subtitle: document.getElementById('edit-subtitle').value,
        date_text: document.getElementById('edit-date-text').value,
        show_timer: document.getElementById('toggle-timer').checked,
        show_phase_alert: document.getElementById('toggle-phase-alert').checked,
        whatsapp: document.getElementById('edit-whatsapp').value,
        instagram: document.getElementById('edit-instagram').value,
        tiktok: document.getElementById('edit-tiktok').value,
        show_whatsapp: true,
        show_instagram: true,
        show_tiktok: true
    };

    try {
        // Save all major segments
        await Promise.all([
            saveConfigField('event_info', dbConfig.event_info),
            saveConfigField('tickets', dbConfig.tickets),
            saveConfigField('phases', dbConfig.phases),
            saveConfigField('rewards', dbConfig.rewards)
        ]);
        showToast('🚀 Sitio actualizado y guardado correctamente', 'success');
    } catch (err) {
        showToast('Error al guardar cambios permanentes', 'error');
    }
}

async function saveConfigField(key, value) {
    return fetch(`${API_URL}/api/config/${key}`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ value })
    });
}

// ============================================================
// PHASE & FAQ RENDERERS (Simplificados para el nuevo panel)
// ============================================================
function renderEditorPhases() {
    const container = document.getElementById('editor-phases-list');
    container.innerHTML = '';
    dbConfig.phases.forEach((p, idx) => {
        const item = document.createElement('div');
        item.style = 'margin-bottom:12px; display:flex; gap:8px;';
        item.innerHTML = `
            <input type="text" class="editor-input" value="${p.name}" oninput="updatePhase(${idx}, 'name', this.value)" style="flex:1;">
            <input type="datetime-local" class="editor-input" value="${new Date(p.endDate).toISOString().slice(0, 16)}" oninput="updatePhase(${idx}, 'endDate', this.value)" style="flex:1.2;">
            <button class="btn-danger" onclick="removePhaseRow(${idx})">🗑️</button>
        `;
        container.appendChild(item);
    });
}

function updatePhase(idx, field, val) {
    if (field === 'endDate') val = new Date(val).toISOString();
    dbConfig.phases[idx][field] = val;
    syncPreview();
}

function addPhaseRow() {
    const newId = (dbConfig.phases.length + 1).toString();
    dbConfig.phases.push({
        id: newId,
        name: 'Nueva Fase',
        endDate: new Date(Date.now() + 86400000 * 7).toISOString()
    });
    renderEditorPhases();
    syncPreview();
}

function removePhaseRow(idx) {
    dbConfig.phases.splice(idx, 1);
    renderEditorPhases();
    syncPreview();
}

function renderEditorRewards() {
    const container = document.getElementById('editor-rewards-list');
    if (!container) return;
    container.innerHTML = '';
    dbConfig.rewards.forEach((r, idx) => {
        const item = document.createElement('div');
        item.style = 'background:rgba(0,0,0,0.1); padding:10px; border-radius:10px; margin-bottom:12px; border:1px solid var(--border);';
        item.innerHTML = `
            <div style="display:flex; gap:5px; margin-bottom:8px;">
               <input type="text" class="editor-input" value="${r.icon}" placeholder="Icon" oninput="updateReward(${idx}, 'icon', this.value)" style="width:40px; text-align:center;">
               <input type="text" class="editor-input" value="${r.title}" placeholder="Título" oninput="updateReward(${idx}, 'title', this.value)" style="flex:1;">
            </div>
            <textarea class="editor-input" placeholder="Descripción" oninput="updateReward(${idx}, 'description', this.value)" rows="2">${r.description}</textarea>
            <button class="btn-danger" onclick="removeRewardRow(${idx})" style="width:100%; margin-top:8px; padding:4px;">Eliminar</button>
        `;
        container.appendChild(item);
    });
}

function updateReward(idx, field, val) {
    dbConfig.rewards[idx][field] = val;
    syncPreview();
}

function addRewardRow() {
    dbConfig.rewards.push({
        id: Date.now().toString(),
        icon: '🎁',
        title: 'Nueva Promoción',
        description: 'Detalles aquí...'
    });
    renderEditorRewards();
    syncPreview();
}

function removeRewardRow(idx) {
    dbConfig.rewards.splice(idx, 1);
    renderEditorRewards();
    syncPreview();
}

// ... Reutilizo lógica de dashboard y reservas del código anterior (integración) ...
// (Para brevedad del chunk, asumo que las funciones del dashboard se preservan o se inyectan correctamente)

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
    // Always re-fetch to ensure we have the latest stats
    await loadReservations();
    renderDashboardStats();
}

function renderDashboardStats() {
    let totalQty = 0;
    let totalRev = 0;
    const breakDown = {};

    dbConfig.tickets.forEach(t => breakDown[t.label] = { sold: 0, rev: 0 });

    currentReservations.forEach(r => {
        if (r.status !== 'cancelled') {
            totalQty += r.quantity;
            totalRev += r.quantity * r.price_each;
            if (!breakDown[r.ticket_type]) breakDown[r.ticket_type] = { sold: 0, rev: 0 };
            breakDown[r.ticket_type].sold += r.quantity;
            breakDown[r.ticket_type].rev += r.quantity * r.price_each;
        }
    });

    document.getElementById('stat-total-qty').textContent = totalQty;
    document.getElementById('stat-total-res').textContent = currentReservations.length;
    document.getElementById('stat-total-rev').textContent = `$${totalRev.toFixed(0)}`;

    const tbody = document.getElementById('stats-table-body');
    tbody.innerHTML = '';

    if (Object.keys(breakDown).length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay datos aún</td></tr>';
        return;
    }

    for (const [tType, val] of Object.entries(breakDown)) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${tType}</strong></td>
            <td><span class="status-badge status-confirmed">Activo</span></td>
            <td>Online</td>
            <td>${val.sold} uds.</td>
            <td style="color:var(--green)">$${val.rev.toFixed(0)}</td>
        `;
        tbody.appendChild(tr);
    }
}

// ============================================================
// RESERVATIONS
// ============================================================
async function loadReservations() {
    try {
        const status = document.getElementById('filter-status').value;
        const search = document.getElementById('filter-search').value;

        let url = `${API_URL}/api/reservations?limit=500`;
        if (status) url += `&status=${status}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const res = await fetch(url, { headers: apiHeaders() });
        if (res.status === 401) return logout();
        const data = await res.json();

        currentReservations = data.reservations || [];
        renderReservationsTable();

        if (document.getElementById('view-data').classList.contains('active')) {
            renderDashboardStats();
        }
    } catch (err) {
        showToast('Error cargando reservas', 'error');
    }
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' años';
    interval = seconds / 2592000;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' meses';
    interval = seconds / 86400;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' días';
    interval = seconds / 3600;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' horas';
    interval = seconds / 60;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' mins';
    return 'Hace unos segundos';
}

function renderReservationsTable() {
    const tbody = document.getElementById('reservations-table-body');
    tbody.innerHTML = '';

    if (currentReservations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center">No hay reservas encontradas</td></tr>`;
        return;
    }

    currentReservations.forEach(r => {
        const d = new Date(r.created_at);
        const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        const relativeTime = timeAgo(r.created_at);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color:var(--text-muted)">#${r.id}</td>
            <td>
                <div style="font-weight:600;">${relativeTime}</div>
                <div style="font-size:10px; color:var(--text-muted)">${dateStr}</div>
            </td>
            <td><strong>@${r.instagram}</strong></td>
            <td>${r.whatsapp ? `<a href="https://wa.me/${String(r.whatsapp).replace(/\D/g, '')}" target="_blank" style="color:var(--green); text-decoration:none;">📱 ${r.whatsapp}</a>` : '-'}</td>
            <td>${r.ticket_type}</td>
            <td><span class="badge-normal" style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2);">${r.fase || '-'}</span></td>
            <td>${r.quantity}</td>
            <td style="color:var(--green)">$${r.price_each}</td>
            <td>
                <select class="status-select status-${r.status}" onchange="updateReservationStatus(${r.id}, this)">
                  <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                  <option value="confirmed" ${r.status === 'confirmed' ? 'selected' : ''}>Confirmado</option>
                  <option value="cancelled" ${r.status === 'cancelled' ? 'selected' : ''}>Cancelado</option>
                </select>
            </td>
            <td>
                <input type="text" class="input-light" value="${r.notes || ''}" placeholder="Añadir nota..." onblur="updateReservationNotes(${r.id}, this.value)" style="padding:4px 8px; font-size:12px;">
            </td>
            <td>
                <button class="btn-danger" style="padding:4px 8px; font-size:12px" onclick="deleteReservation(${r.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================
// AUTHENTICATION
// ============================================================
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
        btn.innerText = 'Entrando...';
        errorDiv.innerText = '';

        const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await resp.json();

        if (!resp.ok) {
            throw new Error(data.error || 'Error al iniciar sesión');
        }

        sessionStorage.setItem('aro_admin_token', data.token);
        sessionStorage.setItem('aro_admin_name', data.name);

        document.getElementById('admin-name').innerText = data.name;
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';

        loadConfig();
        loadReservations();
        showToast('¡Bienvenido, ' + data.name + '!');
    } catch (err) {
        errorDiv.innerText = err.message;
    } finally {
        btn.disabled = false;
        btn.innerText = 'Entrar al Panel';
    }
}

// Auth / Shared Tools
function logout() {
    authToken = null;
    sessionStorage.removeItem('aro_admin_token');
    location.reload();
}

function apiHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('aro_admin_token')}`
    };
}

function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'} ${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// INIT
window.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('aro_admin_token')) {
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        loadConfig();
        loadReservations();
    }
});
