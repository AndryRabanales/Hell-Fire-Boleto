// ============================================================
//  ON FIRE TICKET SALES — app.js (Dynamic CMS Edition)
// ============================================================

// ─── Dynamic API URL (Local vs Production) ──────────────
// Cuando subas el Backend a Railway, reemplaza la URL de abajo con la real.
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL
  ? 'http://localhost:3001'
  : ''; // Use relative path in production

/* ============================================================
   CONFIG — Defaults (overridden by API on load)
============================================================ */
let CONFIG = {
  event_info: {
    title: "HELL FIRE",
    subtitle: "Noche de terror & fiesta — Halloween 2026",
    date_text: "Pronto se revelará la fecha",
    show_timer: true,
    show_phase_alert: true,
    show_whatsapp: true,
    show_instagram: true,
    show_tiktok: true,
    whatsapp: "529999000000",
    instagram: "https://instagram.com",
    tiktok: "https://tiktok.com"
  },
  phases: [
    { id: "1", name: "Fase 1", endDate: "2026-03-20T23:59:59" },
    { id: "2", name: "Fase 2", endDate: "2026-03-28T23:59:59" },
    { id: "3", name: "Fase final", endDate: "2026-04-05T21:00:00" }
  ],
  tickets: [],
  rewards: [],
  faqs: []
};

/* ============================================================
   ICON SYSTEM (SVG en lugar de emojis)
============================================================ */
const ICONS = {
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  cap: '<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  sparkles: '<path d="M9.94 14.5A2 2 0 0 0 8.5 13.06l-4.14-1.07a.5.5 0 0 1 0-.98L8.5 9.94A2 2 0 0 0 9.94 8.5l1.06-4.14a.5.5 0 0 1 .98 0L13.06 8.5A2 2 0 0 0 14.5 9.94l4.14 1.07a.5.5 0 0 1 0 .98L14.5 13.06a2 2 0 0 0-1.44 1.44l-1.06 4.14a.5.5 0 0 1-.98 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  crown: '<path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 4.6a1 1 0 0 0 1.52.3l3.28-2.66a.5.5 0 0 1 .8.52l-2.1 8.24a1 1 0 0 1-.96.73H6.07a1 1 0 0 1-.96-.73L3.01 6.03a.5.5 0 0 1 .8-.52l3.28 2.66a1 1 0 0 0 1.52-.3z"/><path d="M5 20h14"/>',
  wine: '<path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4"/><path d="M15.4 6.5l-6.8 4"/>',
  pin: '<path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  map: '<path d="M9 6l-6 3v12l6-3 6 3 6-3V6l-6 3z"/><path d="M9 6v12"/><path d="M15 9v12"/>',
  instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  whatsapp: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>'
};

function svgIcon(name, opts = {}) {
  const s = opts.size || 24;
  const cls = opts.cls ? ` class="${opts.cls}"` : '';
  const sw = opts.strokeWidth || 1.6;
  return `<svg${cls} width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.flame}</svg>`;
}

// Mapea un boleto a su icono según id (con fallback a ticket genérico)
function iconForTicket(t) {
  const map = { students: 'cap', general: 'ticket', vip: 'sparkles', women: 'sparkles' };
  return svgIcon(map[t.id] || 'ticket', { size: 34 });
}

// Mapea un premio a su icono según el emoji guardado (con fallback a flama)
function iconForReward(r) {
  const map = { '🍾': 'wine', '🍀': 'gift', '⏰': 'clock', '📱': 'share', '🎁': 'gift' };
  return svgIcon(map[r.icon] || 'flame', { size: 26 });
}

/* ============================================================
   STATE
============================================================ */
const state = {};
let currentPhaseOb = null;
let selectedTicket = null;

function initState() {
  CONFIG.tickets.forEach(t => {
    state[t.id] = state[t.id] || {
      realLeft: t.realStock,
      displayLeft: t.fakeStart,
      total: t.fakeTotal,
      soldOut: t.realStock <= 0 || (t.fakeTotal > 0 && t.fakeStart <= 0),
    };
  });
}

/* ============================================================
   LOAD CONFIG FROM API
============================================================ */
async function loadConfigFromAPI() {
  try {
    const res = await fetch(`${API_URL}/api/config`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.event_info) CONFIG.event_info = data.event_info;
    if (data.phases) CONFIG.phases = data.phases;
    if (data.tickets) CONFIG.tickets = data.tickets;
    if (data.rewards) CONFIG.rewards = data.rewards;
    if (data.faqs) CONFIG.faqs = data.faqs;

    applyEventInfo();

  } catch (err) {
    console.warn('Could not load remote config, using defaults:', err.message);
  }
}

function applyEventInfo() {
  const info = CONFIG.event_info;
  // Hero Branding
  if (info.title) {
    const el = document.querySelector('.hero-title');
    if (el) {
      // Render con la última palabra en llamas (span .title-fire)
      const words = info.title.trim().split(/\s+/);
      if (words.length > 1) {
        const last = words.pop();
        el.innerHTML = `${words.join(' ')} <span class="title-fire">${last}</span>`;
      } else {
        el.innerHTML = `<span class="title-fire">${info.title}</span>`;
      }
    }
    document.title = `${info.title} — Boletos · Noche de Terror`;
  }
  if (info.subtitle) {
    const el = document.querySelector('.hero-subtitle');
    if (el) el.textContent = info.subtitle;
  }
  if (info.date_text) {
    const el = document.querySelector('.hero .hero-date'); // Just in case, or we use index-date
    if (el) el.textContent = info.date_text;
  }

  // Social Links
  const linkWa = document.getElementById('link-whatsapp');
  const linkIg = document.getElementById('link-instagram');

  if (linkWa) {
    linkWa.href = `https://wa.me/${info.whatsapp.replace(/\D/g, '')}`;
  }
  if (linkIg) {
    linkIg.href = info.instagram;
  }
}

/* ============================================================
   PHASE DETECTION
============================================================ */
function getCurrentPhase() {
  const now = new Date();

  // Sort phases chronologically just in case
  const sortedPhases = [...CONFIG.phases].sort((a, b) => new Date(a.endDate) - new Date(b.endDate));

  for (const p of sortedPhases) {
    if (now < new Date(p.endDate)) return p;
  }
  return sortedPhases[sortedPhases.length - 1]; // Return last phase if all ended
}

function getPhaseLabel(phase) {
  // Try to generate a nice label
  const sorted = [...CONFIG.phases].sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  const isFirst = sorted[0].id === phase.id;
  const isLast = sorted[sorted.length - 1].id === phase.id;

  const color = isFirst ? 'var(--success)' : isLast ? 'var(--danger)' : 'var(--fire)';
  const suffix = isLast ? ' — Precio final' : '';
  return `<span class="phase-dot" style="background:${color}"></span>${phase.name}${suffix}`;
}

function getPreviousPrice(ticket, currentPhaseId) {
  const sorted = [...CONFIG.phases].sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  const idx = sorted.findIndex(p => p.id === currentPhaseId);
  if (idx > 0) {
    const prevPhaseId = sorted[idx - 1].id;
    return ticket.prices[prevPhaseId];
  }
  return null;
}

/* ============================================================
   COUNTDOWN — Event
============================================================ */
function updateEventCountdown() {
  if (!CONFIG.event_info.show_timer) return;

  const sortedPhases = [...CONFIG.phases].sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  if (sortedPhases.length === 0) return;

  const eventDate = new Date(sortedPhases[sortedPhases.length - 1].endDate); // Approximate event date as last phase end
  const now = new Date();
  const diff = eventDate - now;

  if (diff <= 0) {
    ['cd-days', 'cd-hours', 'cd-mins', 'cd-secs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '00';
    });
    return;
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  document.getElementById('cd-days').textContent = String(days).padStart(2, '0');
  document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
  document.getElementById('cd-mins').textContent = String(mins).padStart(2, '0');
  document.getElementById('cd-secs').textContent = String(secs).padStart(2, '0');
}

/* ============================================================
   COUNTDOWN — Phase (price timer)
============================================================ */
function updatePhaseCountdown() {
  const currentPhase = getCurrentPhase();
  const nameEl = document.getElementById('current-phase-name');
  if (nameEl) nameEl.textContent = currentPhase.name;

  // Highlight active step in the list
  document.querySelectorAll('.phase-step').forEach(step => {
    step.classList.remove('active');
    if (step.id === `phase-step-${currentPhase.id}`) step.classList.add('active');
  });

  const phaseEnd = new Date(currentPhase.endDate);
  const diff = phaseEnd - new Date();

  if (diff <= 0) {
    ['cd-days', 'cd-hours', 'cd-mins', 'cd-secs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '00';
    });
    // Re-render if phase changed
    const newPhase = getCurrentPhase();
    if (newPhase.id !== currentPhase.id) renderAllCards();
    return;
  }

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const elDays = document.getElementById('cd-days');
  const elHours = document.getElementById('cd-hours');
  const elMins = document.getElementById('cd-mins');
  const elSecs = document.getElementById('cd-secs');

  if (elDays) elDays.textContent = String(days).padStart(2, '0');
  if (elHours) elHours.textContent = String(hours).padStart(2, '0');
  if (elMins) elMins.textContent = String(mins).padStart(2, '0');
  if (elSecs) elSecs.textContent = String(secs).padStart(2, '0');
}

/* ============================================================
   RENDER TICKETS DYNAMICALLY (Simplified)
============================================================ */
function renderAllCards() {
  const container = document.getElementById('tickets-grid');
  container.innerHTML = '';

  currentPhaseOb = getCurrentPhase();

  CONFIG.tickets.forEach(t => {
    const s = state[t.id];
    const price = t.prices[currentPhaseOb.id] || 0;

    const isAgotado = s.soldOut;
    const btnIcon = isAgotado ? '' : svgIcon(t.id === 'vip' ? 'crown' : 'ticket', { size: 18, cls: 'btn-ic' });
    const btnLabel = isAgotado ? 'AGOTADO' : (t.id === 'vip' ? `OBTENER VIP — $${price}` : `APARTAR — $${price}`);
    const btnText = `${btnIcon}<span>${btnLabel}</span>`;

    const soldCount = (t.fakeStart || 0) + (t.purchasedCount || 0);
    const totalCap = t.fakeTotal || 1000;
    const progress = Math.min(100, (soldCount / totalCap) * 100);

    const cardHTML = `
      <article class="ticket-card ${t.id === 'vip' ? 'card-vip' : 'card-standard'}" id="card-${t.id}">
        ${t.badge ? `<span class="card-badge ${t.badgeClass}">${t.badge}</span>` : ''}
        <span class="card-icon">${iconForTicket(t)}</span>
        <h3 class="card-title">${t.label}</h3>
        <p class="card-subtitle">${t.subtitle}</p>

        <div class="sales-counter">
          <div class="sales-bar-bg">
            <div class="sales-bar-fill" style="width: ${progress}%"></div>
          </div>
          <div class="sales-text">${svgIcon('flame', { size: 14 })} ${soldCount} / ${totalCap} vendidos</div>
        </div>

        <div class="price-block">
          <div class="price-current" id="price-current-${t.id}">$${price}</div>
          <span class="price-phase-label" id="phase-label-${t.id}">${getPhaseLabel(currentPhaseOb)}</span>
        </div>

        <button class="btn-buy ${isAgotado ? 'sold-out' : 'btn-pulsating'} ${t.id === 'vip' ? 'btn-vip' : 'btn-general'}" id="btn-${t.id}" onclick="openReserveModal('${t.id}')" ${isAgotado ? 'disabled' : ''}>
          ${btnText}
        </button>
        
        ${isAgotado ? `<div class="sold-out-overlay">🚫 AGOTADO</div>` : ''}
      </article>
    `;

    container.insertAdjacentHTML('beforeend', cardHTML);
  });
}

function updateScarcityBar(key) {
  // No-op in simplified version
}

/* ============================================================
   RENDER PHASE STEPS (Cronograma dinámico)
============================================================ */
function renderPhaseSteps() {
  const container = document.getElementById('phase-steps');
  if (!container) return;
  container.innerHTML = '';

  const sorted = [...CONFIG.phases].sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  sorted.forEach(p => {
    const end = new Date(p.endDate);
    const dateStr = `Hasta ${end.getDate()} ${months[end.getMonth()]}`;

    // Precios de esta fase por tipo de boleto
    const prices = CONFIG.tickets
      .map(t => t.prices?.[p.id] ? `${t.label} $${t.prices[p.id]}` : null)
      .filter(Boolean)
      .join(' | ');

    container.insertAdjacentHTML('beforeend', `
      <div class="phase-step" id="phase-step-${p.id}">
        <div class="step-dot"></div>
        <div class="step-content">
          <span class="step-name">${p.name}</span>
          <span class="step-date">${dateStr}</span>
          <span class="step-price">${prices || '—'}</span>
        </div>
      </div>
    `);
  });
}

/* ============================================================
   RENDER REWARDS
============================================================ */
function renderRewards() {
  const container = document.getElementById('rewards-grid');
  if (!container) return;
  container.innerHTML = '';

  if (!CONFIG.rewards || CONFIG.rewards.length === 0) {
    container.parentElement.style.display = 'none';
    return;
  }
  container.parentElement.style.display = 'block';

  // Add the section title dynamically if it was removed or for better control
  let titleEl = container.previousElementSibling;
  if (!titleEl || !titleEl.classList.contains('section-title')) {
    const title = document.createElement('h2');
    title.className = 'section-title';
    title.innerHTML = 'Premios y Promociones';
    container.parentNode.insertBefore(title, container);
  }

  CONFIG.rewards.forEach(r => {
    const card = `
      <div class="reward-card">
        <div class="reward-icon">${iconForReward(r)}</div>
        <div class="reward-info">
          <h4>${r.title}</h4>
          <p>${r.description}</p>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', card);
  });
}

/* ============================================================
   RENDER FAQS (Disabled)
============================================================ */
function renderFaqs() {
  // Removed per request for simplification
}

/* ============================================================
   APARTAR BOLETO
   NO pide datos: registra el clic (para las estadísticas) en segundo
   plano y redirige directo a WhatsApp con el texto listo para enviar.
============================================================ */
function openReserveModal(id) {
  const ticket = CONFIG.tickets.find(t => t.id === id);
  if (!ticket || !state[id] || state[id].soldOut) return;

  const qty = 1;

  // 1. Registrar el apartado (anónimo) para el dashboard — en segundo plano
  fetch(`${API_URL}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_type: id, quantity: qty }),
  })
    .then(r => (r.ok ? r.json() : null))
    .then(() => {
      const tIdx = CONFIG.tickets.findIndex(t => t.id === id);
      if (tIdx !== -1) {
        CONFIG.tickets[tIdx].purchasedCount = (CONFIG.tickets[tIdx].purchasedCount || 0) + 1;
      }
      renderAllCards();
    })
    .catch(() => { });

  // 2. Redirigir a WhatsApp con el texto (sin pedir nada al usuario)
  let waNumber = (CONFIG.event_info.whatsapp || '').replace(/\D/g, '');
  if (!waNumber || waNumber === '529999000000') waNumber = '529992691367';
  const msg = encodeURIComponent(`Hola, estoy interesado en comprar un boleto para ${ticket.label} (${qty}).`);
  window.open(`https://wa.me/${waNumber}?text=${msg}`, '_blank');
}

/* ============================================================
   SOCIAL PROOF TOASTS (Disabled)
============================================================ */
function showToast() {
  // Disabled per request for simplification
}

function scheduleNextToast() {
  // Disabled per request for simplification
}

/* ============================================================
   FAQ ACCORDION
============================================================ */
function toggleFaq(item) {
  // No longer used since FAQ section is removed
}

/* ============================================================
   ELEGANT CONFETTI (ON FIRE Edition)
============================================================ */
function startElegantConfetti() {
  const colors = ['#ff7a2e', '#ff8a3d', '#ffb27a', '#e8480d', '#d9282c', '#ff5a4e'];

  const frame = () => {
    // Elegant slow fall from top representing embers
    if (Math.random() < 0.08) {
      confetti({
        particleCount: 1,
        startVelocity: 0,
        ticks: 500,
        gravity: 0.4,
        origin: {
          x: Math.random(),
          y: -0.1
        },
        colors: [colors[Math.floor(Math.random() * colors.length)]],
        scalar: Math.random() * 0.7 + 0.5,
        drift: Math.random() * 2 - 1
      });
    }
    requestAnimationFrame(frame);
  };
  frame();
}

/* ============================================================
   INIT
============================================================ */
async function init() {
  // Contar la visita una sola vez por sesión de navegador
  if (!sessionStorage.getItem('hf_visited')) {
    sessionStorage.setItem('hf_visited', '1');
    fetch(`${API_URL}/api/stats/visit`, { method: 'POST' }).catch(() => { });
  }

  await loadConfigFromAPI();
  initState();
  renderAllCards();
  renderRewards();
  renderPhaseSteps();
  updatePhaseCountdown();
  setInterval(updatePhaseCountdown, 1000);

  // Start the fire embers animation
  startElegantConfetti();


  // setTimeout(() => { showToast(); scheduleNextToast(); }, 8000); // Skipped

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.animation = 'fadeSlideDown 0.5s ease both';
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  setTimeout(() => {
    document.querySelectorAll('.ticket-card').forEach(el => {
      el.style.opacity = '0';
      observer.observe(el);
    });
  }, 100);

  // ─── PostMessage Bridge for Admin Preview ───
  window.addEventListener('message', (event) => {
    const { type, data } = event.data;
    if (type === 'UPDATE_CONFIG') {
      if (data.event_info) CONFIG.event_info = { ...CONFIG.event_info, ...data.event_info };
      if (data.phases) CONFIG.phases = data.phases;
      if (data.tickets) {
        CONFIG.tickets = data.tickets;
        initState();
      }
      if (data.rewards) CONFIG.rewards = data.rewards;
      if (data.faqs) CONFIG.faqs = data.faqs;

      applyEventInfo();
      renderAllCards();
      renderRewards();
      renderPhaseSteps();
      updatePhaseCountdown();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
