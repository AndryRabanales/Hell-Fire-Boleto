/* ============================================================
   HELL FIRE — lógica de la página
   Contenido editable en CONFIG. Integrado con el backend:
   - registra cada "Apartar" en /api/reservations (para el dashboard)
   - cuenta la visita en /api/stats/visit (una vez por sesión)
   - al apartar redirige a WhatsApp con el mensaje pre-escrito
   ============================================================ */

const CONFIG = {
  // WhatsApp al que llegan los apartados (formato internacional, sin +)
  whatsapp: '529992691367',
  instagram: 'https://instagram.com/Andry_Rabanales',

  // Fases de venta. La activa es la primera cuyo "end" aún no pasó.
  // Cambia las fechas y los precios aquí y toda la página se actualiza.
  phases: [
    {
      name: 'Preventa',
      end: '2026-09-15T23:59:59-06:00',
      date: 'Hasta 15 Sep',
      prices: { uady: 150, ext: 175, vip: 350, ultra: 900 },
    },
    {
      name: 'Venta regular',
      end: '2026-10-10T23:59:59-06:00',
      date: 'Hasta 10 Oct',
      prices: { uady: 180, ext: 200, vip: 400, ultra: 900 },
    },
    {
      name: 'Última llamada',
      end: '2026-10-30T23:59:59-06:00',
      date: 'Hasta 30 Oct',
      prices: { uady: 200, ext: 250, vip: 450, ultra: 900 },
    },
    {
      name: 'Mero día',
      end: '2026-10-31T23:59:59-06:00',
      date: '31 Oct',
      prices: { uady: 250, ext: 300, vip: 500, ultra: 900 },
    },
  ],

  // Niveles de boleto. "price" recibe los precios de la fase activa.
  tiers: [
    {
      id: 'general',
      label: 'General',
      color: '#d9282c',
      btnBg: '#d9282c',
      incluye: 'Incluye',
      price: (p) => 'Uady $' + p.uady + ' · Externo $' + p.ext,
      waPrice: (p) => '$' + p.uady + ' / $' + p.ext,
      montoDashboard: (p) => p.ext, // valor representativo para el dashboard
      perks: [
        'Barra libre toda la noche',
        'Aguas locas',
        'Pistolas de shots',
        'Pista de baile & DJ',
        'Beneficios de patrocinadores',
        'Fiesta de disfraces',
      ],
    },
    {
      id: 'vip',
      label: 'VIP',
      color: '#b8891f',
      btnBg: 'linear-gradient(135deg, #b8891f, #8a6210)',
      incluye: 'Incluye todo lo del General, más',
      price: (p) => '$' + p.vip,
      waPrice: (p) => '$' + p.vip,
      montoDashboard: (p) => p.vip,
      perks: [
        'Prioridad en la fila — sin cola',
        'Pulsera VIP toda la noche',
        'Shot de bienvenida',
        'Segunda barra, solo VIP',
        'Botellas exclusivas',
        'Coca-Cola sin límite',
      ],
    },
    {
      id: 'ultravip',
      label: 'Ultra VIP',
      color: '#17b3a6',
      btnBg: 'linear-gradient(135deg, #17b3a6, #0e7d74)',
      incluye: 'Incluye todo lo del General y del VIP, más',
      price: (p) => '$' + p.ultra,
      waPrice: (p) => '$' + p.ultra,
      montoDashboard: (p) => p.ultra,
      perks: [
        'Zona única Ultra VIP',
        'Pulsera Ultra VIP',
        'Tercera barra exclusiva',
        'Botellas top de la noche',
        'Margaritas y palomas',
        'Azulitos',
        'Micheladas',
      ],
    },
  ],
};

/* ── Utilidades ── */

const pad = (n) => String(n).padStart(2, '0');

function faseActiva(now) {
  for (const ph of CONFIG.phases) {
    if (now < new Date(ph.end).getTime()) return ph;
  }
  return CONFIG.phases[CONFIG.phases.length - 1];
}

// Registra el apartado en el backend (para el panel de admin) y abre WhatsApp.
function registrarApartado(label, monto, faseNombre) {
  try {
    fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_type: label,
        fase: faseNombre,
        price_each: monto,
        quantity: 1,
      }),
    }).catch(() => {});
  } catch (e) { /* sin conexión: no bloquear el WhatsApp */ }
}

function abrirWhatsApp(label, precioTexto) {
  const msg = 'Hola, quiero apartar mi boleto ' + label + ' (' + precioTexto + ') para HELL FIRE 🎃';
  window.open('https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(msg), '_blank');
}

/* ── Boletos ── */

function pintarBoletos(phase) {
  const cont = document.getElementById('tiers');
  cont.innerHTML = '';

  CONFIG.tiers.forEach((tk) => {
    const precio = tk.price(phase.prices);

    const wrap = document.createElement('div');
    wrap.className = 'tier';
    wrap.setAttribute('data-reveal', '');

    const perks = tk.perks.map((pk) => (
      '<div class="tier__perk">' +
        '<span class="tier__check" style="color:' + tk.color + '">✓</span>' +
        '<span class="tier__perk-texto">' + pk + '</span>' +
      '</div>'
    )).join('');

    wrap.innerHTML =
      '<div class="tier__head">' +
        '<span class="tier__rombo" style="background:' + tk.color + '"></span>' +
        '<span class="tier__nombre" style="color:' + tk.color + '">' + tk.label + '</span>' +
        '<span class="tier__punteado"></span>' +
        '<span class="tier__precio" style="color:' + tk.color + '">' + precio + '</span>' +
      '</div>' +
      '<div class="tier__incluye">' + tk.incluye + '</div>' +
      '<div class="tier__perks">' + perks + '</div>' +
      '<button class="tier__btn" style="background:' + tk.btnBg + '">Apartar ' + tk.label + ' →</button>';

    wrap.querySelector('.tier__btn').addEventListener('click', () => {
      // 1. registrar el apartado para el dashboard (segundo plano)
      registrarApartado(tk.label, tk.montoDashboard(phase.prices), faseActual ? faseActual.name : phase.name);
      // 2. abrir WhatsApp con el mensaje
      abrirWhatsApp(tk.label, tk.waPrice(phase.prices));
    });

    cont.appendChild(wrap);
  });
}

/* ── Línea de tiempo de fases ── */

function pintarFases(phase) {
  const cont = document.getElementById('timeline');
  const activeIdx = CONFIG.phases.indexOf(phase);
  cont.innerHTML = '';

  CONFIG.phases.forEach((ph, i) => {
    const esActiva = i === activeIdx;
    const pasada = i < activeIdx;

    const el = document.createElement('div');
    el.className = 'fase';
    el.setAttribute('data-reveal', '');
    el.style.opacity = pasada ? '.42' : '1';

    const puntoBg = esActiva ? '#d9282c' : (pasada ? 'rgba(246,241,231,.3)' : '#b8891f');
    const puntoGlow = esActiva ? '0 0 12px rgba(217,40,44,.7)' : 'none';
    const precios = 'UADY $' + ph.prices.uady + ' · Ext $' + ph.prices.ext + ' · VIP $' + ph.prices.vip;

    el.innerHTML =
      '<div class="fase__punto" style="background:' + puntoBg + ';box-shadow:' + puntoGlow + '"></div>' +
      '<div class="fase__row">' +
        '<span class="fase__nombre' + (esActiva ? ' fase__nombre--activa' : '') + '">' + ph.name + '</span>' +
        '<span class="fase__fecha">' + ph.date + '</span>' +
      '</div>' +
      '<div class="fase__precios">' + precios + '</div>';

    cont.appendChild(el);
  });
}

/* ── Cronómetro ── */

let faseActual = null;

function tick() {
  const now = Date.now();
  const phase = faseActiva(now);

  // Si cambió la fase, se repintan boletos y línea de tiempo.
  if (!faseActual || faseActual.name !== phase.name) {
    faseActual = phase;
    pintarBoletos(phase);
    pintarFases(phase);
    document.getElementById('phase-label').textContent = phase.name + ' termina en';
    revelar();
  }

  const diff = Math.max(0, new Date(phase.end).getTime() - now);
  const d = pad(Math.floor(diff / 86400000));
  const h = pad(Math.floor(diff / 3600000) % 24);
  const m = pad(Math.floor(diff / 60000) % 60);
  const s = pad(Math.floor(diff / 1000) % 60);

  document.getElementById('cd-d').textContent = d;
  document.getElementById('cd-h').textContent = h;
  document.getElementById('cd-m').textContent = m;
  document.getElementById('cd-s').textContent = s;

  document.getElementById('big-d').textContent = d;
  document.getElementById('big-h').textContent = h;
  document.getElementById('big-m').textContent = m;
  document.getElementById('big-s').textContent = s;
}

/* ── Revelado al hacer scroll (idempotente) ── */

function revelar() {
  document.querySelectorAll('[data-reveal]').forEach((el, i) => {
    if (el.hasAttribute('data-shown')) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
      el.style.transitionDelay = ((i % 4) * 0.07) + 's';
      el.setAttribute('data-shown', '1');
    }
  });
}

/* ── Videos: forzar silencio + bucle + reproducción ── */

function arrancarVideos() {
  document.querySelectorAll('video').forEach((v) => {
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.play().catch(() => {});
    v.addEventListener('ended', () => {
      v.currentTime = 0;
      v.play().catch(() => {});
    });
  });
}

/* ── Conteo de visitas (una vez por sesión) ── */

function contarVisita() {
  try {
    if (!sessionStorage.getItem('hf_visited')) {
      sessionStorage.setItem('hf_visited', '1');
      fetch('/api/stats/visit', { method: 'POST' }).catch(() => {});
    }
  } catch (e) { /* sessionStorage no disponible */ }
}

/* ── Arranque ── */

document.addEventListener('DOMContentLoaded', () => {
  contarVisita();

  tick();
  setInterval(tick, 1000);

  arrancarVideos();

  revelar();
  window.addEventListener('scroll', revelar, { passive: true });
  window.addEventListener('resize', revelar);
  setTimeout(revelar, 240);
});
