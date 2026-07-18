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

  if (isFirst) return `🟢 ${phase.name}`;
  if (isLast) return `🔴 ${phase.name} — Precio final`;
  return `🟡 ${phase.name}`;
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
    const btnText = isAgotado ? '🚫 AGOTADO' : (t.id === 'vip' ? `👑 OBTENER VIP — $${price}` : `🎟️ APARTAR — $${price}`);

    const soldCount = (t.fakeStart || 0) + (t.purchasedCount || 0);
    const totalCap = t.fakeTotal || 1000;
    const progress = Math.min(100, (soldCount / totalCap) * 100);

    const cardHTML = `
      <article class="ticket-card ${t.id === 'vip' ? 'card-vip' : 'card-standard'}" id="card-${t.id}">
        ${t.badge ? `<span class="card-badge ${t.badgeClass}">${t.badge}</span>` : ''}
        <span class="card-emoji">${t.emoji}</span>
        <h3 class="card-title">${t.label}</h3>
        <p class="card-subtitle">${t.subtitle}</p>

        <div class="sales-counter">
          <div class="sales-bar-bg">
            <div class="sales-bar-fill" style="width: ${progress}%"></div>
          </div>
          <div class="sales-text">🔥 ${soldCount} / ${totalCap} vendidos</div>
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
    title.innerHTML = 'Premios y Promociones 🔥';
    container.parentNode.insertBefore(title, container);
  }

  CONFIG.rewards.forEach(r => {
    const card = `
      <div class="reward-card">
        <div class="reward-icon">${r.icon}</div>
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
   PURCHASE MODAL
============================================================ */
async function openReserveModal(id) {
  const ticket = CONFIG.tickets.find(t => t.id === id);
  if (!ticket) return;

  const currentPhase = getCurrentPhase();
  const price = ticket.prices[currentPhase.id] || 0;

  // 1. Fire increment API (background)
  // We don't necessarily need to await it to redirect, but we want it to happen
  fetch(`${API_URL}/api/config/click/${id}`, { method: 'POST' }).catch(err => console.error('Click sync error:', err));

  // 2. Update local state for immediate feedback
  if (state[id]) {
    state[id].displayLeft = Math.max(0, state[id].displayLeft - 1);
    // Note: soldCount in render is (fakeStart + purchasedCount)
    // So we should also update the local CONFIG.tickets to match what the user will see
    const tIdx = CONFIG.tickets.findIndex(tk => tk.id === id);
    if (tIdx !== -1) {
      CONFIG.tickets[tIdx].fakeStart += 1;
      // Check auto-expansion
      const totalSold = CONFIG.tickets[tIdx].fakeStart + (CONFIG.tickets[tIdx].purchasedCount || 0);
      if (totalSold >= CONFIG.tickets[tIdx].fakeTotal) {
        CONFIG.tickets[tIdx].fakeTotal += 50;
      }
    }
    renderAllCards();
  }

  // 3. Redirect to WhatsApp
  const info = CONFIG.event_info;
  const waNumber = info.whatsapp.replace(/\D/g, '');
  const message = encodeURIComponent(`Hola, estoy interesado en comprar un boleto para ${ticket.label} ($${price}).`);
  const waUrl = `https://wa.me/${waNumber}?text=${message}`;

  window.open(waUrl, '_blank');
}

// The following functions related to the modal are now effectively unused
// as openReserveModal redirects directly to WhatsApp.
// They are kept for cleanliness as per the instruction, but their UI calls
// (e.g., from renderAllCards) have been updated to openReserveModal.

function openModal(key) {
  if (state[key].soldOut) return;

  selectedTicket = key;
  currentPhaseOb = getCurrentPhase();

  const t = CONFIG.tickets.find(tk => tk.id === key);
  const price = t.prices[currentPhaseOb.id] || 0;

  document.getElementById('modal-title').textContent = `Apartar Boleto — ${t.label}`;
  document.getElementById('modal-emoji').textContent = t.emoji;
  document.getElementById('modal-category').textContent = t.label;
  document.getElementById('modal-price-display').textContent = `$${price}`;

  document.getElementById('modal-form').style.display = 'block';
  document.getElementById('modal-success').style.display = 'none';
  document.getElementById('input-instagram').value = '';
  document.getElementById('input-whatsapp').value = '';
  document.getElementById('input-qty').value = '1';

  document.getElementById('modal-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';

  setTimeout(() => document.getElementById('input-instagram').focus(), 100);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.body.style.overflow = '';
  selectedTicket = null;
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

async function confirmPurchase() {
  const instagram = document.getElementById('input-instagram').value.replace(/^@/, '').trim();
  const whatsapp = document.getElementById('input-whatsapp').value.trim();
  const qty = 1; // Always 1
  const btn = document.getElementById('btn-confirm');

  if (!instagram) {
    const el = document.getElementById('input-instagram');
    el.style.borderColor = 'var(--danger)';
    el.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.25)';
    setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 2000);
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    const res = await fetch(`${API_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_type: selectedTicket, instagram, whatsapp, quantity: qty }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error de servidor');

    // Update local stock display
    const key = selectedTicket;
    if (key && state[key] && !state[key].soldOut) {
      state[key].realLeft = Math.max(0, state[key].realLeft - qty);
      state[key].displayLeft = Math.max(0, state[key].displayLeft - qty);
      if (state[key].realLeft <= 0 || state[key].displayLeft <= 0) {
        state[key].soldOut = true;
        renderAllCards();
      }
    }

    // Show success
    document.getElementById('modal-form').style.display = 'none';
    document.getElementById('modal-success').style.display = 'block';

    // Clear inputs for next time
    document.getElementById('input-instagram').value = '';
    document.getElementById('input-whatsapp').value = '';

    setTimeout(() => closeModal(), 5000); // Give more time to read the success msg

  } catch (err) {
    alert('Hubo un error al guardar tu reserva. Por favor intenta de nuevo.\n' + err.message);
    btn.disabled = false;
    btn.textContent = '✅ APARTAR MI LUGAR';
  }
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
   KEYBOARD
============================================================ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

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
