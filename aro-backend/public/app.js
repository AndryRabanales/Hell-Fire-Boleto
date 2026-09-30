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

/* ── Muestra una imagen con fade suave al cargar (evita el salto/negro) ── */
function mostrarImg(img, src) {
  if (!img) return;
  if (img.getAttribute('src') !== src) {
    img.classList.remove('is-loaded');
    img.onload = () => img.classList.add('is-loaded');
    img.src = src;
  }
  if (img.complete && img.naturalWidth) img.classList.add('is-loaded');
}

/* ── Promo (cartel · viene del generador vía SYNC) ── */
function pintarPromo() {
  const sec = document.getElementById('promo-cartel');
  if (!sec) return;
  const p = SYNC && SYNC.promo;
  const activa = p && p.active && p.img;
  if (!activa) { sec.style.display = 'none'; return; }

  mostrarImg(document.getElementById('promo-img'), p.img);

  const tit = document.getElementById('promo-titulo');
  if (tit) tit.textContent = p.nombre || 'Promoción';

  const btn = document.getElementById('promo-btn');
  if (btn) {
    btn.onclick = () => {
      const nombre = p.nombre || 'Promoción';
      registrarApartado(nombre, 0, estadoFase().nombre);
      const msg = 'Hola, me interesa la promoción "' + nombre + '" de HELL FIRE 🎃';
      window.open('https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(msg), '_blank');
    };
  }

  sec.style.display = '';
  revelar();
}

/* ── Flyer de venta flash (cartel · viene del generador vía SYNC) ── */
function pintarFlashFlyer() {
  const sec = document.getElementById('flash-cartel');
  if (!sec) return;
  const src = SYNC && SYNC.flashImagen;
  if (!src) { sec.style.display = 'none'; return; }
  mostrarImg(document.getElementById('flash-cartel-img'), src);
  sec.style.display = '';
  revelar();
}

/* ── Estado de fase/precios (sincronizado o de respaldo) ── */

function catDeTier(id) {
  return id === 'ultravip' ? 'ultra' : (id === 'vip' ? 'vip' : (id === 'backstage' ? 'backstage' : 'general'));
}

// Une el flash: activo si lo prendes en el admin O si tu generador tiene flash ON.
// Los precios flash salen de la config del admin (el generador no expone montos flash).
function mergeFlash(sync) {
  const f = (sync && sync.flash) || {};
  const genOn = !!(sync && sync.generadorFlash);
  return { ...f, active: !!f.active || genOn };
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
      flash: mergeFlash(SYNC),
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
    flash: mergeFlash(SYNC),
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
    // Flash por precio independiente: aplica al que tenga monto flash; el otro queda normal.
    const uF = flashOn && flash.uady ? flash.uady : null;
    const eF = flashOn && flash.externo ? flash.externo : null;
    if (uF || eF) {
      const uShow = uF || uN, eShow = eF || eN;
      return {
        html: '<span class="tier__precio-old">$' + uN + ' · $' + eN + '</span>' +
              '<span class="tier__precio-flash">Uady $' + uShow + ' · Ext $' + eShow + '</span>',
        wa: 'Uady $' + uShow + ' / Externo $' + eShow,
        monto: eShow,
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

/* ============================================================
   RENDER — diseño editorial (Cronómetro · Promo · Venta Flash ·
   Qué incluye/Cupos · Ubicación)
   ============================================================ */

let faseNombreActual = null;

// Descripción corta de cada tipo (sección "Qué incluye")
const DESCRIP = {
  general:   'Barra libre, aguas locas, pistolas de shots y DJ en vivo.',
  vip:       'Todo lo del general + prioridad en la fila, segunda barra y Coca-Cola sin límite.',
  ultravip:  'Todo lo del VIP + zona única, tercera barra, margaritas, palomas, azulitos y micheladas.',
  backstage: 'Todo lo del Ultra VIP + junto a la cabina del DJ y la mejor botella de la fiesta.',
};

// Cupo simulado por categoría (solo si el generador no da números reales)
const CUPO_SIM = { general: 500, vip: 500, ultra: 500, backstage: 500 };
const VENDIDOS_SIM = 144;

function tiersVisibles(est) {
  return CONFIG.tiers.filter((tk) =>
    tk.id === 'general' ? est.precios.uady != null : est.precios[tk.priceKey] != null);
}

// Precio en texto (sin HTML de tachado), para botones e info cuando NO hay flash
function textoPrecio(tk, est) {
  const p = est.precios;
  if (tk.id === 'general') return 'Uady $' + p.uady + ' · Ext $' + p.externo;
  const n = p[tk.priceKey];
  return n != null ? ('$' + n) : '';
}

/* ── Sección Venta Flash: textos + flyer condicionales ── */
function pintarFlashSeccion() {
  const est = estadoFase();
  const flashOn = !!(est.flash && est.flash.active);
  const src = SYNC && SYNC.flashImagen;

  const frame = document.getElementById('flash-frame');
  const kicker = document.getElementById('flash-kicker');
  const titulo = document.getElementById('flash-titulo');
  const heading = document.getElementById('flash-heading');
  const nota = document.getElementById('flash-precios-nota');

  if (flashOn) {
    if (kicker) kicker.textContent = 'Venta flash activa';
    if (titulo) titulo.innerHTML = 'Venta <span class="fuego">flash</span>';
    if (heading) heading.innerHTML = 'Aparta tu boleto de la <span class="fuego">venta flash</span>';
    if (nota) nota.style.display = '';
    if (frame && src) { mostrarImg(document.getElementById('flash-cartel-img'), src); frame.style.display = ''; }
    else if (frame) frame.style.display = 'none';
  } else {
    if (kicker) kicker.textContent = 'Aparta tu boleto';
    if (titulo) titulo.textContent = 'Boletos';
    if (heading) heading.textContent = 'Aparta tu boleto';
    if (nota) nota.style.display = 'none';
    if (frame) frame.style.display = 'none';
  }
}

/* ── Grid de botones (Apartar por tipo) ── */
function pintarBotones() {
  const cont = document.getElementById('tiers-grid');
  if (!cont) return;
  const est = estadoFase();
  const flashOn = !!(est.flash && est.flash.active);
  cont.innerHTML = '';

  tiersVisibles(est).forEach((tk) => {
    const pr = precioTier(tk, est.precios, est.flash);
    const b = document.createElement('button');
    b.className = 'btn-tier btn-tier--' + tk.id;
    b.innerHTML =
      '<span class="btn-tier__nombre">' + tk.label + '</span>' +
      (flashOn ? '' : '<span class="btn-tier__precio">' + textoPrecio(tk, est) + '</span>') +
      '<span class="btn-tier__cta">Apartar <span>&rarr;</span></span>';
    b.addEventListener('click', () => {
      registrarApartado(tk.label, pr.monto, est.nombre);
      abrirWhatsApp(tk.label, pr.wa);
    });
    cont.appendChild(b);
  });
}

/* ── Sección "Qué incluye" + cupos por tipo ── */
function pintarInfoTipos() {
  const cont = document.getElementById('tiers-info');
  if (!cont) return;
  const est = estadoFase();
  const flashOn = !!(est.flash && est.flash.active);
  cont.innerHTML = '';

  tiersVisibles(est).forEach((tk) => {
    const div = document.createElement('div');
    div.className = 'tipo tipo--' + tk.id;
    div.setAttribute('data-cat', catDeTier(tk.id));
    div.innerHTML =
      '<div class="tipo__nombre">' + tk.label + '</div>' +
      '<div class="tipo__desc">' + (DESCRIP[tk.id] || '') + '</div>' +
      (flashOn ? '' : '<div class="tipo__precio">' + textoPrecio(tk, est) + '</div>') +
      '<div class="cupo">' +
        '<div class="cupo__top"><span>Boletos comprados</span>' +
          '<span class="cupo__n"><b>0</b> / 0</span></div>' +
        '<div class="cupo__bar"><i></i></div>' +
        '<div class="cupo__quedan">Quedan &mdash; lugares</div>' +
      '</div>';
    cont.appendChild(div);
  });
  cargarCupos();
}

/* ── Rellena los cupos con ventas REALES + extra (del generador vía /api/ventas) ── */
async function cargarCupos() {
  let v = null;
  try {
    const est = estadoFase();
    const res = await fetch('/api/ventas?fase=' + encodeURIComponent(est.nombre));
    const j = await res.json();
    if (j && j.available) v = j;
  } catch (e) { /* si no hay datos, usa la simulación de respaldo */ }

  document.querySelectorAll('#tiers-info .tipo').forEach((div) => {
    const cat = div.getAttribute('data-cat');
    let sold, cap;
    if (v && v[cat]) { sold = v[cat].sold; cap = v[cat].cap; }   // reales + extra, sobre el cupo
    else { cap = CUPO_SIM[cat] || 500; sold = VENDIDOS_SIM; }
    const left = Math.max(0, cap - sold);
    const pct = cap ? Math.min(100, Math.round((sold / cap) * 100)) : 0;
    const nEl = div.querySelector('.cupo__n');
    const bar = div.querySelector('.cupo__bar i');
    const q = div.querySelector('.cupo__quedan');
    if (nEl) nEl.innerHTML = '<b>' + sold + '</b> / ' + cap;
    if (bar) bar.style.width = pct + '%';
    if (q) q.textContent = 'Quedan ' + left + ' lugares';
  });
}

/* ── Cronómetro: fase, etiqueta y barra de progreso ── */
function actualizarFaseLabel() {
  const est = estadoFase();
  const fn = document.getElementById('fase-num');
  if (fn) fn.textContent = 'Fase ' + est.num + ' de ' + est.total;
  const lbl = document.getElementById('phase-label');
  if (lbl) lbl.textContent = est.esUltima ? 'Cierra en' : 'Termina en';
  const prog = document.getElementById('fase-progress');
  if (prog) prog.style.width = Math.round((est.num / est.total) * 100) + '%';
}

/* ── Render completo ── */
function renderTodo() {
  pintarPromo();
  pintarFlashSeccion();
  pintarBotones();
  pintarInfoTipos();
  actualizarFaseLabel();
  faseNombreActual = estadoFase().nombre;
}

/* ── Sincroniza precios/flash/promo del generador ── */
async function cargarPrecios(fresh) {
  try {
    const res = await fetch('/api/ventas/precios' + (fresh ? '?fresh=1' : ''));
    SYNC = await res.json();
  } catch (e) { SYNC = null; }
  renderTodo();
}

/* ── Cronómetro (cada segundo) ── */
function tick() {
  const est = estadoFase();
  if (faseNombreActual && est.nombre !== faseNombreActual) cargarPrecios(true);
  const diff = Math.max(0, est.targetMs - Date.now());
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('cd-d', pad(Math.floor(diff / 86400000)));
  set('cd-h', pad(Math.floor(diff / 3600000) % 24));
  set('cd-m', pad(Math.floor(diff / 60000) % 60));
  set('cd-s', pad(Math.floor(diff / 1000) % 60));
}

/* ── revelar(): la usan pintarPromo/pintarFlashFlyer heredados (no-op) ── */
function revelar() {}

/* ── Conteo de visita (una vez por sesión) ── */
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
  renderTodo();
  cargarPrecios();
  setInterval(() => cargarPrecios(true), 20000);
  tick();
  setInterval(tick, 1000);
});
