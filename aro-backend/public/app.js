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
      // Fase 1: activa hasta que arranca la Fase 2 (2 sep 00:00)
      name: 'Fase 1',
      end: '2026-09-02T00:00:00-06:00',
      date: 'Hasta 1 Sep',
      prices: { uady: 150, ext: 175, vip: 350, ultra: 900 },
    },
    {
      // Fase 2: 2 sep — arranca Fase 3 el 17 sep 00:00
      name: 'Fase 2',
      end: '2026-09-17T00:00:00-06:00',
      date: 'Hasta 16 Sep',
      prices: { uady: 200, ext: 225, vip: 425, ultra: 950 },
    },
    {
      // Fase 3: 17 sep — arranca Fase 4 el 17 oct 00:00
      name: 'Fase 3',
      end: '2026-10-17T00:00:00-06:00',
      date: 'Hasta 16 Oct',
      prices: { uady: 275, ext: 300, vip: 520, ultra: 1000 },
    },
    {
      // Fase 4 (última): 17 oct — cierra ventas el 31 oct a las 8pm (mero día)
      name: 'Fase 4',
      end: '2026-10-31T20:00:00-06:00',
      date: 'Cierra 31 Oct · 8pm',
      prices: { uady: 330, ext: 355, vip: 575, ultra: 1100 },
    },
  ],

  // Niveles de boleto. Los precios llegan sincronizados del generador (/api/precios).
  tiers: [
    {
      id: 'general',
      label: 'General',
      color: '#d9282c',
      btnBg: '#d9282c',
      incluye: 'Incluye',
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
      priceKey: 'vip',
      incluye: 'Incluye todo lo del General, más',
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
      priceKey: 'ultra',
      incluye: 'Incluye todo lo del General y del VIP, más',
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
    {
      id: 'backstage',
      label: 'Backstage',
      color: '#b23bd6',
      btnBg: 'linear-gradient(135deg, #b23bd6, #7a1fa0)',
      priceKey: 'backstage',
      incluye: 'La experiencia máxima, más',
      perks: [
        'Acceso a zona Backstage',
        'Detrás del escenario con los DJ',
        'Todo lo del Ultra VIP incluido',
        'Área privada exclusiva',
        'Atención personalizada',
      ],
    },
  ],
};

/* ── Estado sincronizado de precios (viene de /api/precios) ── */
let SYNC = null;

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

/* ── Estado de fase/precios (sincronizado o de respaldo) ── */

function catDeTier(id) {
  return id === 'ultravip' ? 'ultra' : (id === 'vip' ? 'vip' : (id === 'backstage' ? 'ultra' : 'general'));
}

// Devuelve el estado actual unificado (desde SYNC del generador o CONFIG de respaldo)
function estadoFase() {
  if (SYNC && SYNC.available) {
    return {
      nombre: SYNC.faseActual || ('Fase ' + SYNC.faseNum),
      num: SYNC.faseNum,
      total: SYNC.faseTotal,
      targetMs: new Date(SYNC.proximaFecha).getTime(),
      esUltima: !!SYNC.esUltima,
      precios: SYNC.precios || {},
      flash: SYNC.flash || { active: false },
      fases: SYNC.fases || null,
      synced: true,
    };
  }
  const ph = faseActiva(Date.now());
  const idx = CONFIG.phases.indexOf(ph) + 1;
  return {
    nombre: ph.name,
    num: idx,
    total: CONFIG.phases.length,
    targetMs: new Date(ph.end).getTime(),
    esUltima: idx === CONFIG.phases.length,
    precios: { uady: ph.prices.uady, externo: ph.prices.ext, vip: ph.prices.vip, ultra: ph.prices.ultra },
    flash: (SYNC && SYNC.flash) || { active: false },
    fases: null,
    synced: false,
  };
}

/* ── Ventas reales (FOMO) ── */
async function cargarVentas() {
  try {
    const fase = estadoFase().nombre;
    const res = await fetch('/api/ventas?fase=' + encodeURIComponent(fase));
    const v = await res.json();
    if (!v || !v.available) return;
    document.querySelectorAll('.tier__stock').forEach((el) => {
      const c = v[el.getAttribute('data-cat')];
      if (!c) return;
      const pct = c.cap ? Math.min(100, Math.round((c.sold / c.cap) * 100)) : 0;
      el.innerHTML =
        '<div class="tier__stock-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="tier__stock-txt">' +
          '<span class="tier__stock-sold">' + c.sold + ' vendidos</span>' +
          '<span class="tier__stock-left">' + c.left + ' disponibles</span>' +
        '</div>';
      el.classList.add('is-shown');
    });
  } catch (e) { /* silencioso */ }
}

/* ── Precios por nivel (con soporte de venta flash) ── */
function precioTier(tk, precios, flash) {
  const flashOn = flash && flash.active;
  if (tk.id === 'general') {
    const uN = precios.uady, eN = precios.externo;
    if (flashOn && flash.uady && flash.externo) {
      return {
        html: '<span class="tier__precio-old">$' + uN + ' · $' + eN + '</span>' +
              '<span class="tier__precio-flash">Uady $' + flash.uady + ' · Ext $' + flash.externo + '</span>',
        wa: 'Uady $' + flash.uady + ' / Externo $' + flash.externo,
        monto: flash.externo,
      };
    }
    return { html: 'Uady $' + uN + ' · Externo $' + eN, wa: '$' + uN + ' / $' + eN, monto: eN };
  }
  const k = tk.priceKey;
  const n = precios[k];
  if (flashOn && flash[k]) {
    return {
      html: '<span class="tier__precio-old">$' + n + '</span><span class="tier__precio-flash">$' + flash[k] + '</span>',
      wa: '$' + flash[k], monto: flash[k],
    };
  }
  return { html: '$' + n, wa: '$' + n, monto: n };
}

/* ── Boletos ── */
function pintarBoletos() {
  const est = estadoFase();
  const cont = document.getElementById('tiers');
  cont.innerHTML = '';

  CONFIG.tiers.forEach((tk) => {
    // Saltar niveles sin precio (p.ej. Backstage cuando no hay sync)
    const tienePrecio = tk.id === 'general' ? est.precios.uady != null : est.precios[tk.priceKey] != null;
    if (!tienePrecio) return;

    const pr = precioTier(tk, est.precios, est.flash);

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
        '<span class="tier__precio" style="color:' + tk.color + '">' + pr.html + '</span>' +
      '</div>' +
      '<div class="tier__incluye">' + tk.incluye + '</div>' +
      '<div class="tier__perks">' + perks + '</div>' +
      '<div class="tier__stock" data-cat="' + catDeTier(tk.id) + '"></div>' +
      '<button class="tier__btn" style="background:' + tk.btnBg + '">Apartar ' + tk.label + ' →</button>';

    wrap.querySelector('.tier__btn').addEventListener('click', () => {
      registrarApartado(tk.label, pr.monto, est.nombre);
      abrirWhatsApp(tk.label, pr.wa);
    });

    cont.appendChild(wrap);
  });

  cargarVentas();
}

/* ── Banner de venta flash ── */
function pintarFlash() {
  const el = document.getElementById('flash-banner');
  if (!el) return;
  const est = estadoFase();
  const f = est.flash;
  if (!f || !f.active) { el.style.display = 'none'; el.innerHTML = ''; return; }

  const p = est.precios;
  let maxDesc = 0;
  [['uady', 'uady'], ['externo', 'externo'], ['vip', 'vip'], ['ultra', 'ultra'], ['backstage', 'backstage']]
    .forEach(([nk, fk]) => { if (p[nk] != null && f[fk]) maxDesc = Math.max(maxDesc, p[nk] - f[fk]); });

  el.style.display = 'block';
  el.innerHTML =
    '<span class="flash-banner__tag">⚡ ' + (f.label || 'VENTA FLASH') + '</span>' +
    '<span class="flash-banner__desc">' +
      (maxDesc > 0 ? 'Hasta $' + maxDesc + ' de descuento · solo mientras dure' : 'Precios de oferta · solo mientras dure') +
    '</span>';
}

/* ── Línea de tiempo de fases ── */
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function fmtFecha(iso) {
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return '';
  return 'Desde ' + d.getDate() + ' ' + MESES[d.getMonth()];
}

function pintarFases() {
  const est = estadoFase();
  const cont = document.getElementById('timeline');
  cont.innerHTML = '';

  let lista;
  if (est.fases) {
    lista = est.fases.map((f) => ({ name: f.name, date: fmtFecha(f.starts_on), uady: f.uady, ext: f.externo, vip: f.vip }));
  } else {
    lista = CONFIG.phases.map((p) => ({ name: p.name, date: p.date, uady: p.prices.uady, ext: p.prices.ext, vip: p.prices.vip }));
  }

  const activeIdx = lista.findIndex((ph) => ph.name === est.nombre);
  lista.forEach((ph, i) => {
    const esActiva = i === activeIdx;
    const pasada = activeIdx >= 0 && i < activeIdx;

    const el = document.createElement('div');
    el.className = 'fase';
    el.setAttribute('data-reveal', '');
    el.style.opacity = pasada ? '.42' : '1';

    const puntoBg = esActiva ? '#d9282c' : (pasada ? 'rgba(246,241,231,.3)' : '#b8891f');
    const puntoGlow = esActiva ? '0 0 12px rgba(217,40,44,.7)' : 'none';
    const precios = 'UADY $' + ph.uady + ' · Ext $' + ph.ext + ' · VIP $' + ph.vip;

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

/* ── Etiqueta de fase + nota ── */
function actualizarFaseLabel() {
  const est = estadoFase();
  const lbl = document.getElementById('phase-label');
  if (lbl) lbl.textContent = 'Fase ' + est.num + ' de ' + est.total + ' · ' + (est.esUltima ? 'cierra en' : 'termina en');

  const nota = document.getElementById('fase-nota');
  if (nota) {
    const cierre = est.esUltima
      ? 'Es la <b>última fase</b>: las ventas cierran el 31 de octubre a las 8pm.'
      : 'Cuando termina el cronómetro (o se agota el cupo), el precio sube.';
    nota.innerHTML =
      '<span class="fase-nota__tag">Fase ' + est.num + ' de ' + est.total + '</span>' +
      '<span class="fase-nota__txt">Vendemos en <b>' + est.total + ' fases</b> y cada una sube de precio. ' + cierre + '</span>';
  }
}

/* ── Render completo ── */
let faseNombreActual = null;
function renderTodo() {
  pintarBoletos();
  pintarFases();
  pintarFlash();
  actualizarFaseLabel();
  faseNombreActual = estadoFase().nombre;
  revelar();
}

/* ── Sincroniza precios/flash del generador ── */
async function cargarPrecios(fresh) {
  try {
    const res = await fetch('/api/ventas/precios' + (fresh ? '?fresh=1' : ''));
    const data = await res.json();
    SYNC = data || null;
    renderTodo();
  } catch (e) {
    SYNC = null;
    renderTodo();
  }
}

/* ── Cronómetro ── */
function tick() {
  const est = estadoFase();

  // Si cambió la fase (por fecha), re-sincroniza precios
  if (faseNombreActual && est.nombre !== faseNombreActual) {
    cargarPrecios(true);
  }

  const diff = Math.max(0, est.targetMs - Date.now());
  const d = pad(Math.floor(diff / 86400000));
  const h = pad(Math.floor(diff / 3600000) % 24);
  const m = pad(Math.floor(diff / 60000) % 60);
  const s = pad(Math.floor(diff / 1000) % 60);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('cd-d', d); set('cd-h', h); set('cd-m', m); set('cd-s', s);
  set('big-d', d); set('big-h', h); set('big-m', m); set('big-s', s);
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

  // Pinta de inmediato con datos de respaldo, luego sincroniza con el generador
  renderTodo();
  cargarPrecios();
  // Re-sincroniza precios y flash cada 20s (para reflejar la flash al instante)
  setInterval(() => cargarPrecios(true), 20000);

  tick();
  setInterval(tick, 1000);

  arrancarVideos();

  revelar();
  window.addEventListener('scroll', revelar, { passive: true });
  window.addEventListener('resize', revelar);
  setTimeout(revelar, 240);
});
