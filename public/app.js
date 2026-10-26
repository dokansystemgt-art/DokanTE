'use strict';
/* DOKAN Tickets — interfaz (SPA con rutas por hash) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const S = { user: null, cfg: null };

const svg = (inner, fill) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'}>${inner}</svg>`;
const I = {
  home: svg('<path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3z"/>', 1),
  ticket: svg('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z"/><path d="M9 9h6M9 15h6"/>'),
  doc: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  phone: svg('<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>'),
  id: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2M14 10h4M14 14h4"/>'),
  cal: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  pin: svg('<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>', 1),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6z"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c3 0 5 1.8 5 4.5V20h-4"/>', 1),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  send: svg('<path d="M2 21 23 12 2 3v7l15 2-15 2z"/>', 1),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  dash: svg('<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>'),
  scan: svg('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>'),
  cal2: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 14v4M10 16h4"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  share: svg('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>'),
  download: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
  cash: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v.01M18 14.5v.01"/>'),
  bank: svg('<path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  cog: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'),
  wa: svg('<path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 18.8z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-.8.8a3.5 3.5 0 0 1-1.8-1.8l.8-.8-1-2z"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  chev: svg('<path d="m6 9 6 6 6-6"/>'),
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
const fTime = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'p.m.' : 'a.m.'}`; };
const money = (n) => `Q${Number(n).toFixed(2)}`;
const fStamp = (ms) => new Date(ms).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
const STATUS = { solicitada: 'Pendiente de pago', por_validar: 'En revisión', pendiente_efectivo: 'Pendiente de pago en efectivo', aprobada: 'Pagada', rechazada: 'Rechazada', cancelada: 'Cancelada' };
const badge = (s) => `<span class="badge b-${s}">${STATUS[s] || s}</span>`;
const TSTATUS = { pendiente_pago: 'Pendiente de pago', valida: 'Válida', utilizada: 'Utilizada', cancelada: 'Cancelada', reembolsada: 'Reembolsada' };
const tBadge = (s) => `<span class="badge t-${s}">${TSTATUS[s] || s}</span>`;
const METHOD = { transferencia: 'Transferencia bancaria', deposito: 'Depósito a cuenta', efectivo: 'Efectivo (ya no disponible)' };
const homeFor = (u) => ({ ADMIN: '#/admin', TAQUILLA: '#/taquilla/escaner', PANEL: '#/panel' }[u.role] || '#/');
const roleName = (r) => ({ ADMIN: 'Administrador', USER: 'Usuario', TAQUILLA: 'Taquilla (escáner)', PANEL: 'Taquilla (panel)' }[r] || r);

let nav = 0; // contador de navegaciones: una consulta GET que termina tras cambiar de pantalla se descarta
async function api(path, { method = 'GET', body } = {}) {
  const my = nav;
  const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = {};
  try { data = await r.json(); } catch { /* vacío */ }
  if (method === 'GET' && my !== nav) throw Object.assign(new Error('pantalla anterior'), { stale: true });
  if (!r.ok) { const e = new Error(data.error || 'Error de conexión'); e.status = r.status; e.data = data; throw e; }
  return data;
}
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg; el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  $('#toasts').append(el); setTimeout(() => el.remove(), type === 'long' ? 9000 : 5500);
}
async function busy(btn, fn) {
  const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
}
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

// Ventana modal (formularios cortos, resultados). Se adapta a pantallas pequeñas como hoja inferior.
function modal({ title, body, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-bg';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-x aria-label="Cerrar">${I.x}</button></div><div class="modal-b">${body}</div></div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  $('[data-x]', wrap).onclick = close;
  document.body.append(wrap);
  return { el: wrap, close };
}

/* ---------- Shell ---------- */
function brand() { return '<div class="brand"><div class="logo"><b>D</b>OKAN</div><div class="logo-sub">Tickets &amp; Eventos</div></div>'; }
function navFor(u) {
  if (u.role === 'ADMIN') return [['#/admin', 'dash', 'Panel'], ['#/admin/solicitudes', 'doc', 'Pagos'], ['#/admin/boletos', 'ticket', 'Boletos'], ['#/admin/escaner', 'scan', 'Escáner'], ['#/admin/eventos', 'cal2', 'Eventos'], ['#/admin/competidores', 'trophy', 'Competidores'], ['#/admin/usuarios', 'users', 'Usuarios'], ['#/admin/reportes', 'chart', 'Reportes'], ['#/admin/ajustes', 'cog', 'Ajustes'], ['#/perfil', 'user', 'Perfil']];
  if (u.role === 'TAQUILLA') return [['#/taquilla/escaner', 'scan', 'Escáner'], ['#/perfil', 'user', 'Perfil']];
  if (u.role === 'PANEL') return [['#/panel', 'dash', 'Panel'], ['#/perfil', 'user', 'Perfil']];
  return [['#/', 'home', 'Inicio'], ['#/eventos', 'ticket', 'Entradas'], ['#/mis-solicitudes', 'doc', 'Mis compras'], ['#/perfil', 'user', 'Perfil']];
}
function shell(active, inner) {
  const items = navFor(S.user);
  app.innerHTML = `<div class="shell">
    <aside class="side">${brand()}
      <nav class="nav" aria-label="Menú principal">${items.map(([h, ic, t]) => `<a href="${h}" class="${active === h ? 'active' : ''}" ${active === h ? 'aria-current="page"' : ''}>${I[ic]}<span>${t}</span></a>`).join('')}</nav>
      <div class="tag">Tu acceso<br>a los mejores<br>eventos.<i></i></div>
    </aside>
    <div class="main">
      <div class="top"><div class="brand-m"><div class="logo"><b>D</b>OKAN</div></div><button class="userbtn" id="ubtn" aria-haspopup="true"><span class="uname"><span class="un">${esc(S.user.name)}</span><small>${roleName(S.user.role)}</small></span>${I.chev}<span class="avatar">${I.user}</span></button>
        <div class="menu hidden" id="umenu"><button data-go="#/perfil">Perfil y seguridad</button><button id="logout">Cerrar sesión</button></div></div>
      <div class="content" id="view">${inner}</div>
    </div></div>`;
  $('#ubtn').onclick = (e) => { e.stopPropagation(); $('#umenu').classList.toggle('hidden'); };
  document.onclick = () => $('#umenu')?.classList.add('hidden');
  $('#umenu [data-go]').onclick = () => go('#/perfil');
  $('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); S.user = null; S.cfg = null; go('#/login'); };
  $('.nav a.active')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  return $('#view');
}

/* ---------- Acceso ---------- */
function authLayout(inner) {
  // Banner: LOGIN_LOGO.PNG (respaldo: logo.png; si tampoco existe, se oculta sin dejar un ícono roto)
  app.innerHTML = `<div class="auth"><div class="hero" style="background-image:url(/img/poster.jpg)">
      <img class="hero-logo" src="/img/LOGIN_LOGO.PNG" alt="DOKAN" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='/img/logo.png'}else{this.remove()}">
      <div class="hero-t">Amateur Fight League<small>Sexta edición · 28 nov 2026</small></div></div>
    <div class="panel">${brand()}${inner}</div></div>`;
}
function field(icon, label, attrs, req = true) {
  return `<div class="field"><label>${label}${req ? ' <em>*</em>' : ''}</label><div class="input">${I[icon]}<input ${attrs}></div></div>`;
}
const selectField = (icon, label, name, opts, sel) => `<div class="field"><label>${label}</label><div class="input">${I[icon]}<select name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div></div>`;

function pageLogin() {
  authLayout(`<form id="f"><div><h1>Iniciar sesión</h1><p class="muted">Ingresa para solicitar tus entradas.</p></div>
    ${field('user', 'Correo electrónico o usuario', 'name="email" autocomplete="username" autocapitalize="none" required')}
    ${field('lock', 'Contraseña', 'name="password" type="password" autocomplete="current-password" required')}
    <button class="btn full">Entrar</button><div class="err" id="err" role="alert"></div>
    <p class="muted"><a href="#/olvide">¿Olvidaste tu contraseña?</a></p>
    <p class="muted">¿No tienes cuenta? <a href="#/registro">Crear cuenta</a></p></form>`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)); $('#err').textContent = '';
    try {
      const r = await busy($('#f .btn'), () => api('/api/login', { method: 'POST', body: fd }));
      await boot(); go(r.mustChange ? '#/cambiar-contrasena' : homeFor(S.user));
    } catch (er) { $('#err').textContent = er.message; }
  };
}
function pageRegister() {
  authLayout(`<form id="f"><div><h1>Crear cuenta</h1><p class="muted">Regístrate y entra de inmediato.</p></div>
    ${field('user', 'Nombre completo', 'name="name" placeholder="Ej. Juan Pérez García" autocomplete="name" required')}
    ${field('mail', 'Correo electrónico', 'name="email" type="email" placeholder="usuario@correo.com" autocomplete="email" autocapitalize="none" required')}
    ${field('phone', 'Teléfono (WhatsApp)', 'name="phone" type="tel" placeholder="5555-5555" autocomplete="tel" required')}
    ${field('lock', 'Contraseña', 'name="password" type="password" placeholder="Mínimo 8 caracteres, letras y números" autocomplete="new-password" required')}
    <button class="btn full">Crear cuenta</button><div class="err" id="err" role="alert"></div>
    <p class="muted">¿Ya tienes cuenta? <a href="#/login">Iniciar sesión</a></p></form>`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)); $('#err').textContent = '';
    try { await busy($('#f .btn'), () => api('/api/register', { method: 'POST', body: fd })); await boot(); toast('¡Cuenta creada! Bienvenido.', 'ok'); go('#/'); }
    catch (er) { $('#err').textContent = er.message; }
  };
}
function pageForgot() {
  authLayout(`<form id="f"><div><h1>Recuperar contraseña</h1><p class="muted">Te enviaremos un enlace para crear una contraseña nueva.</p></div>
    ${field('mail', 'Correo electrónico', 'name="email" type="email" autocomplete="email" autocapitalize="none" required')}
    <button class="btn full">Enviar enlace</button><div class="err" id="err" role="alert"></div>
    <p class="muted">Si no recibes el correo, pide al administrador que restablezca tu contraseña. · <a href="#/login">Volver</a></p></form>`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); $('#err').textContent = '';
    try { await busy($('#f .btn'), () => api('/api/forgot', { method: 'POST', body: { email: e.target.email.value } })); $('#f').innerHTML = '<h1>Revisa tu correo</h1><p class="muted">Si la cuenta existe, enviamos un enlace que vence en 1 hora.</p><a class="btn full" href="#/login">Volver a iniciar sesión</a>'; }
    catch (er) { $('#err').textContent = er.message; }
  };
}
function pageReset(q) {
  const p = new URLSearchParams(q);
  authLayout(`<form id="f"><div><h1>Nueva contraseña</h1><p class="muted">Crea una contraseña nueva para <b>${esc(p.get('email') || '')}</b>.</p></div>
    ${field('lock', 'Nueva contraseña', 'name="password" type="password" placeholder="Mínimo 8, letras y números" autocomplete="new-password" required')}
    <button class="btn full">Guardar contraseña</button><div class="err" id="err" role="alert"></div></form>`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); $('#err').textContent = '';
    try { await busy($('#f .btn'), () => api('/api/reset', { method: 'POST', body: { email: p.get('email'), token: p.get('token'), password: e.target.password.value } })); toast('Contraseña actualizada. Ya puedes ingresar.', 'ok'); go('#/login'); }
    catch (er) { $('#err').textContent = er.message; }
  };
}
// Cambio obligatorio en el primer ingreso (cuentas iniciales o restablecidas por el administrador)
function pageForceChange() {
  authLayout(`<form id="f"><div><h1>Cambia tu contraseña</h1><p class="muted">Por seguridad, antes de continuar debes crear una contraseña personal.</p></div>
    ${field('lock', 'Contraseña actual', 'name="current" type="password" autocomplete="current-password" required')}
    ${field('lock', 'Nueva contraseña', 'name="password" type="password" placeholder="Mínimo 8, letras y números" autocomplete="new-password" required')}
    <button class="btn full">Guardar y continuar</button><div class="err" id="err" role="alert"></div>
    <p class="muted"><button type="button" class="link" id="lo">Cerrar sesión</button></p></form>`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); $('#err').textContent = '';
    try { await busy($('#f .btn'), () => api('/api/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) })); await boot(); toast('Contraseña actualizada.', 'ok'); go(homeFor(S.user)); }
    catch (er) { $('#err').textContent = er.message; }
  };
  $('#lo').onclick = async () => { await api('/api/logout', { method: 'POST' }); S.user = null; go('#/login'); };
}

/* ---------- Compartir boletos (WhatsApp) ---------- */
// Se precargan las imágenes al mostrar el boleto: así, al pulsar "Compartir", el navegador todavía
// considera que hay un gesto del usuario y permite abrir el menú nativo con la imagen adjunta.
const fileCache = new Map();
async function loadTicketFile(t) {
  if (fileCache.has(t.url)) return fileCache.get(t.url);
  const blob = await (await fetch(t.url)).blob();
  const f = new File([blob], `Boleto-${t.number}-DOKAN.png`, { type: 'image/png' });
  fileCache.set(t.url, f); return f;
}
const prefetchTickets = (list) => list.forEach((t) => loadTicketFile(t).catch(() => {}));
const canShareFiles = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] })); } catch { return false; } };
// IMPORTANTE: abrir WhatsApp o el menú de compartir NO significa que el mensaje se haya enviado; la persona debe pulsar "Enviar".
async function shareTickets(tickets, text, phone) {
  try {
    const files = await Promise.all(tickets.map(loadTicketFile));
    if (canShareFiles() && navigator.canShare({ files })) {
      await navigator.share({ files, text, title: 'Boleto DOKAN' });
      toast('Se abrió el menú de compartir con la imagen del boleto. Elige WhatsApp y pulsa Enviar.', 'ok'); return;
    }
  } catch (e) { if (e.name === 'AbortError') return; /* sin permiso o sin soporte: se usa el respaldo */ }
  const links = tickets.map((t) => `${location.origin}${t.url}`).join('\n');
  window.open(`https://wa.me/${phone || ''}?text=${encodeURIComponent(`${text}\n\n${tickets.length > 1 ? 'Boletos:' : 'Boleto:'}\n${links}`)}`, '_blank', 'noopener');
  toast('Este navegador no permite adjuntar la imagen automáticamente. Se abrió WhatsApp con el enlace del boleto; también puedes descargar la imagen y adjuntarla. El mensaje no se envía hasta que pulses Enviar.', 'long');
}
function bindShare(root, order, { phone } = {}) {
  prefetchTickets(order.tickets.filter((t) => t.status === 'valida'));
  $$('[data-share]', root).forEach((b) => b.onclick = () => {
    const t = order.tickets.find((x) => String(x.id) === b.dataset.share); if (t) shareTickets([t], t.wa_text, phone);
  });
  $$('[data-share-all]', root).forEach((b) => b.onclick = () => shareTickets(order.tickets.filter((t) => t.status === 'valida'), order.wa_text_all, phone));
}
function ticketCards(o, { staff = false } = {}) {
  const valid = o.tickets.filter((t) => t.status === 'valida');
  return `<div class="tk-grid">${o.tickets.map((t) => `<div class="tk-card ${t.status !== 'valida' && t.status !== 'utilizada' ? 'dim' : ''}">
      <a href="${t.url}" target="_blank" rel="noopener"><img src="${t.url}" alt="Boleto ${t.number}" loading="lazy"></a>
      <div class="tk-meta"><div><b>#${t.number}</b> · ${esc(t.type_name)}${t.pkg_size > 1 ? ` ${t.seq}/${t.pkg_size}` : ''}</div><div class="muted small">${esc(t.holder)}</div>${tBadge(t.status)}</div>
      <div class="tk-acts"><a class="btn sm ghost" href="${t.url}" download="Boleto-${t.number}-DOKAN.png">${I.download} Descargar</a>
      ${t.status === 'valida' ? `<button class="btn sm wa" data-share="${t.id}">${I.wa} ${staff ? 'WhatsApp' : 'Compartir'}</button>` : ''}</div></div>`).join('')}</div>
    ${valid.length > 1 && o.wa_text_all ? `<button class="btn wa full" style="margin-top:14px" data-share-all>${I.wa} Compartir las ${valid.length} entradas</button>` : ''}`;
}
const pendingList = (o) => o.pending_tickets.length ? `<div class="pend-list"><h3>Entradas pendientes de pago</h3>${o.pending_tickets.map((t) => `<div class="pend"><span>${esc(t.type_name)}${t.pkg_size > 1 ? ` · entrada ${t.seq} de ${t.pkg_size}` : ''}</span><span class="muted small">${esc(t.holder)}</span>${tBadge('pendiente_pago')}</div>`).join('')}<p class="muted small">Recibirás los códigos QR cuando se confirme el pago.</p></div>` : '';

/* ---------- Comprador ---------- */
function eventCard(e) {
  return `<article class="ev"><div class="poster" style="background-image:url(${esc(e.poster)})"></div><div class="body">
    <h3>${esc(e.title)}<small>${esc(e.subtitle)}</small></h3>
    <div class="row-i">${I.cal}<div><b>${fDate(e.event_date)}</b><span>${fTime(e.event_time)}</span></div></div>
    <div class="row-i">${I.pin}<div><b>${esc(e.location)}</b></div></div>
    <div class="row-i">${I.users}<div><span>Organiza:</span><b>${esc(e.organizer)}</b></div></div>
    <div class="ev-foot"><div><span class="muted small">Entradas desde</span><div class="price">${money(e.from_price)}</div></div>
    <a class="btn" href="#/evento/${e.id}">Comprar entradas</a></div></div></article>`;
}
async function pageHome(withWelcome) {
  const v = shell(withWelcome ? '#/' : '#/eventos', '<div class="empty">Cargando…</div>');
  const { events } = await api('/api/events');
  v.innerHTML = `${withWelcome ? `<div class="welcome"><div class="avatar">${I.user}</div><div><h1>¡Bienvenido, ${esc(S.user.name)}!</h1><p class="muted">Gracias por ser parte de DOKAN. Aquí podrás comprar tus entradas para el evento.</p></div></div>` : '<h1 class="mb">Comprar entradas</h1>'}
    <h2 class="mb">Próximos eventos</h2>
    ${events.length ? `<div class="events">${events.map(eventCard).join('')}</div>` : '<div class="card empty">Aún no hay eventos disponibles.</div>'}`;
}
function bannerHTML(e) {
  return `<div class="banner"><img src="/img/banner.jpg" alt="${esc(e.title)}"></div>`;
}
const typeDesc = (t) => (t.per_unit > 1 ? `Paquete de ${t.per_unit} entradas` : '1 entrada');

const fmtPhone = (p) => `${String(p).slice(0, 4)}-${String(p).slice(4)}`;
const maxBirth = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); };
// Caja de "envía tu comprobante": sin comprobante no se autoriza el pago
function proofBox(cfg, msgFn, id = 'proofbtn') {
  return `<div class="note warn proof" style="margin-top:14px">${I.wa}<span><b>Envía tu comprobante de pago al número ${fmtPhone(cfg.proof.phone)}.</b><br>Sin comprobante no podemos autorizar tu pago.
    <a class="btn wa sm" id="${id}" target="_blank" rel="noopener" href="https://wa.me/${cfg.proof.wa}?text=${encodeURIComponent(msgFn())}" style="margin-top:10px">${I.wa} Enviar comprobante por WhatsApp</a></span></div>`;
}

async function pageEvent(id) {
  const v = shell('#/eventos', '<div class="empty">Cargando…</div>');
  const [{ event: e }, cfg] = await Promise.all([api('/api/events/' + id), api('/api/config')]);
  S.cfg = cfg;
  const types = cfg.ticketTypes, pay = cfg.pay, bank = cfg.bank;
  if (!types.length) { v.innerHTML = '<div class="card empty">La venta de entradas no está disponible por ahora.</div>'; return; }
  const st = { type: types[0].code, units: 1, method: pay.transferencia ? 'transferencia' : 'deposito', comp: null, hmode: 'self' };
  const cur = () => types.find((t) => t.code === st.type);
  const qtyTotal = () => st.units * cur().per_unit;
  const total = () => st.units * cur().price;
  const fitTotal = () => st.units * cur().fit;
  const form = () => $('#f');

  v.innerHTML = `${bannerHTML(e)}<div class="cols"><div>
    <form class="card" id="f" novalidate>
      <div class="wizard" id="wiz"><button type="button" class="wz on" data-s="1"><i>1</i><span>Entradas</span></button><span class="wz-line"></span><button type="button" class="wz" data-s="2"><i>2</i><span>Método de pago</span></button></div>
      <div id="pane1"><div class="step-head"><span class="step-n">1</span><div><h2>Tus datos</h2><p class="muted small">Completa la información para procesar tu solicitud. Solo mayores de 18 años pueden comprar.</p></div></div>
      <div class="form-grid">
        ${field('user', 'Nombre completo', `name="full_name" placeholder="Ej. Juan Pérez García" value="${esc(S.user.name)}" autocomplete="name" required`)}
        ${field('mail', 'Correo electrónico', `name="email" type="email" placeholder="Ej. usuario@correo.com" value="${esc(S.user.email)}" autocomplete="email" required`)}
        ${field('phone', 'Teléfono', `name="phone" type="tel" placeholder="Ej. 5555-5555" value="${esc(S.user.phone || '')}" autocomplete="tel" required`)}
        ${field('id', 'DPI', 'name="dpi" inputmode="numeric" placeholder="Ej. 1234 56789 0101" maxlength="16" required')}
        ${field('cal', 'Fecha de nacimiento', `name="birth" type="date" max="${maxBirth()}" required`)}
      </div><div class="err" id="agerr" role="alert"></div>

      <div class="step-head sp"><span class="step-n">2</span><h2>Tipo de entrada</h2></div>
      <div class="opts" id="types" role="radiogroup" aria-label="Tipo de entrada">${types.map((t) => `<label class="opt ${t.code === st.type ? 'on' : ''}"><input type="radio" name="ticket_type" value="${t.code}" ${t.code === st.type ? 'checked' : ''}>
        <span class="opt-ic">${I.ticket}</span><span class="opt-t"><b>${esc(t.name)}</b><span class="muted small">${typeDesc(t)}${t.per_unit > 1 ? ` · ${money(t.price / t.per_unit)} c/u` : ''}</span></span><span class="opt-p">${money(t.price)}</span></label>`).join('')}</div>
      <div class="qty-box"><div class="tk"><span class="ticket-ic">${I.ticket}</span><div><b id="qlabel">Cantidad</b><br><span class="muted small" id="qsub"></span></div></div>
        <div class="stepper"><button type="button" data-d="-1" aria-label="Menos">−</button><span id="q" aria-live="polite">1</span><button type="button" data-d="1" aria-label="Más">+</button></div></div>
      <div id="holders"></div>
      <div class="sum-mini"><span>Subtotal</span><b id="sub"></b></div>
      <div class="btn-row end"><button type="button" class="btn full" id="next">Continuar a método de pago →</button></div>
      </div>

      <div id="pane2" class="hidden"><div class="pane-sum" id="psum"></div>
      <div class="step-head"><span class="step-n">3</span><h2>Método de pago</h2></div>
      <div class="opts two" id="pays" role="radiogroup" aria-label="Método de pago">
        ${pay.transferencia ? `<label class="opt ${st.method === 'transferencia' ? 'on' : ''}"><input type="radio" name="payment_method" value="transferencia" ${st.method === 'transferencia' ? 'checked' : ''}><span class="opt-ic">${I.bank}</span><span class="opt-t"><b>Transferencia bancaria</b><span class="muted small">Con número de referencia</span></span></label>` : ''}
        ${pay.deposito ? `<label class="opt ${st.method === 'deposito' ? 'on' : ''}"><input type="radio" name="payment_method" value="deposito" ${st.method === 'deposito' ? 'checked' : ''}><span class="opt-ic">${I.cash}</span><span class="opt-t"><b>Depósito a cuenta</b><span class="muted small">Con número de boleta</span></span></label>` : ''}</div>
      <div id="paybox"></div>

      <div class="step-head sp"><span class="step-n">4</span><div><h2>Apoyar a un competidor</h2><p class="muted small">Opcional. Si tienes el código de un competidor, ingrésalo para apoyarlo con tu compra.</p></div></div>
      <div class="field"><div class="input">${I.trophy}<input id="ccode" type="text" placeholder="Ingresa el código del competidor" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Código del competidor (opcional)" style="text-transform:uppercase"><button type="button" class="icon-btn hidden" id="cclear" aria-label="Borrar código">${I.x}</button></div>
        <div id="cstate" class="small" role="status" style="min-height:22px;margin-top:6px"></div></div>

      <div class="total"><span>Total a pagar</span><div class="big-price" id="tot"></div></div>
      <div class="btn-row split"><button type="button" class="btn ghost" id="back">← Volver a entradas</button><button class="btn" id="submit">${I.send} Enviar solicitud</button></div><div class="err" id="err" role="alert"></div>
      </div></form></div>
    <aside class="card sum"><div class="poster" style="background-image:url(${esc(e.poster)})"></div>
      <div class="row-i">${I.cal}<div><b>${fDate(e.event_date)}</b><span>${fTime(e.event_time)}</span></div></div>
      <div class="row-i">${I.pin}<div><b>${esc(e.location)}</b></div></div>
      <div class="row-i">${I.users}<div><span>Organiza:</span><b>${esc(e.organizer)}</b></div></div><hr>
      <div id="sumlines"></div>
      <div class="note">${I.info}<span>Recibirás tus boletos con código QR cuando se confirme tu pago con el comprobante.</span></div></aside></div>`;

  const proofMsg = () => {
    const f = form(); const ref = f?.auth_number?.value?.trim();
    return `Hola, te envío el comprobante de mi pago (${METHOD[st.method]}) para ${e.title} ${e.subtitle}.\nNombre: ${f?.full_name?.value || S.user.name}\nMonto: ${money(total())}${ref ? `\nReferencia: ${ref}` : ''}`;
  };
  const refreshProofLink = () => { const a = $('#proofbtn'); if (a) a.href = `https://wa.me/${cfg.proof.wa}?text=${encodeURIComponent(proofMsg())}`; };

  function paintHolders() {
    const t = cur(); const box = $('#holders');
    if (t.per_unit < 2) { box.innerHTML = ''; return; }
    const names = Array.from({ length: qtyTotal() }, (_, i) => `<div class="field"><label>${st.units > 1 ? `Mesa ${Math.floor(i / t.per_unit) + 1} · ` : ''}Asistente ${(i % t.per_unit) + 1} <em>*</em></label><div class="input">${I.user}<input name="holder" placeholder="Nombre completo" maxlength="80" autocomplete="off" required minlength="3"></div></div>`).join('');
    box.innerHTML = `<div class="box"><b>${I.users} ${esc(t.name)}: incluye ${qtyTotal()} entradas individuales, cada una con su propio QR.</b>
      <div class="seg"><label class="${st.hmode === 'self' ? 'on' : ''}"><input type="radio" name="hmode" value="self" ${st.hmode === 'self' ? 'checked' : ''}> Todas a mi nombre</label><label class="${st.hmode === 'custom' ? 'on' : ''}"><input type="radio" name="hmode" value="custom" ${st.hmode === 'custom' ? 'checked' : ''}> Asignar nombres</label></div>
      ${st.hmode === 'self' ? `<label class="chk"><input type="checkbox" id="hconfirm" required> <span>Confirmo que las ${qtyTotal()} entradas saldrán a <b>mi nombre</b>.</span></label>` : `<div class="holder-grid">${names}</div>`}
      <div class="note warn" style="margin:0">${I.info}<span><b>Los nombres no se podrán cambiar</b> después de enviar la solicitud. Revísalos bien.</span></div></div>`;
    $$('[name=hmode]', box).forEach((r) => r.onchange = () => { st.hmode = r.value; paintHolders(); });
  }
  function paintBox() {
    const box = $('#paybox'); const dep = st.method === 'deposito';
    box.innerHTML = `<div class="bank">
        <div class="r"><span>Banco</span><b>${esc(bank?.name)}</b></div><div class="r"><span>Tipo de cuenta</span><b>${esc(bank?.type)}</b></div>
        <div class="r"><span>Número de cuenta</span><div><b>${esc(bank?.account)}</b><button type="button" class="copy" data-copy="${esc(bank?.account)}">Copiar</button></div></div>
        <div class="r"><span>A nombre de</span><b>${esc(bank?.holder)}</b></div>
        <div class="r"><span>Monto a ${dep ? 'depositar' : 'transferir'}</span><b class="amt">${money(total())}</b></div></div>
      ${field('id', dep ? 'Número de boleta / referencia del depósito' : 'Número de verificación / referencia de la transferencia', 'name="auth_number" placeholder="Ej. 123456789" autocomplete="off" required')}
      ${proofBox(cfg, proofMsg)}`;
    $$('[data-copy]', box).forEach((c) => c.onclick = () => { navigator.clipboard?.writeText(c.dataset.copy); toast('Copiado', 'ok'); });
    $('[name=auth_number]', box).oninput = refreshProofLink;
  }
  function paint() {
    const t = cur();
    $('#q').textContent = st.units;
    $('#qlabel').textContent = t.per_unit > 1 ? 'Mesas' : 'Cantidad';
    $('#qsub').textContent = t.per_unit > 1 ? `${st.units} × mesa de ${t.per_unit} = ${qtyTotal()} entradas` : `${money(t.price)} por entrada`;
    $('#tot').textContent = money(total());
    $('#sub').textContent = money(total());
    $('#psum').innerHTML = `<span>${st.units} × ${esc(cur().name)}${cur().per_unit > 1 ? ` (${qtyTotal()} entradas)` : ''}</span><b>${money(total())}</b>`;
    $('#sumlines').innerHTML = `<div class="line"><span>${st.units} × ${esc(t.name)}${t.per_unit > 1 ? ` (${t.per_unit} entradas)` : ''}</span><span>${money(total())}</span></div>
      <div class="muted small" style="margin:6px 0 12px">${qtyTotal()} entrada${qtyTotal() > 1 ? 's' : ''} en total</div>
      ${st.comp ? `<div class="muted small">Apoyas a: <b>${esc(st.comp.name)}</b> · FIT ${money(fitTotal())}</div>` : ''}
      <div class="muted small">Pago: <b>${METHOD[st.method]}</b></div>
      <div class="line" style="margin-top:12px"><span>Total</span><span style="font-size:20px">${money(total())}</span></div>`;
    $$('#types .opt').forEach((l) => l.classList.toggle('on', $('input', l).checked));
    $$('#pays .opt').forEach((l) => l.classList.toggle('on', $('input', l).checked));
    if ($('#paybox .amt')) $('#paybox .amt').textContent = money(total());
    refreshProofLink(); paintCode();
  }
  $$('[name=ticket_type]').forEach((r) => r.onchange = () => { st.type = r.value; st.units = Math.min(st.units, cur().max_units); paintHolders(); paint(); });
  $$('[name=payment_method]').forEach((r) => r.onchange = () => { st.method = r.value; paintBox(); paint(); });
  $$('[data-d]').forEach((b) => b.onclick = () => { st.units = Math.min(cur().max_units, Math.max(1, st.units + Number(b.dataset.d))); paintHolders(); paint(); });
  $('#f [name=dpi]').oninput = (ev) => { const d = ev.target.value.replace(/\D/g, '').slice(0, 13); ev.target.value = [d.slice(0, 4), d.slice(4, 9), d.slice(9)].filter(Boolean).join(' '); };
  $('#f [name=full_name]').oninput = refreshProofLink;

  // Mayoría de edad: se avisa apenas se marca la fecha (el servidor también lo valida)
  const birth = $('#f [name=birth]');
  const checkAge = () => { const minor = !!birth.value && birth.value > maxBirth(); $('#agerr').textContent = minor ? 'Debes ser mayor de edad (18 años cumplidos) para comprar entradas.' : ''; birth.setCustomValidity(minor ? 'Debes ser mayor de 18 años.' : ''); return !minor; };
  birth.onchange = birth.oninput = checkAge;

  // ----- Código del competidor (opcional) -----
  const cc = $('#ccode'); let ctimer = 0, cseq = 0, cmsg = '';
  function paintCode() {
    const s = $('#cstate');
    if (st.comp) s.innerHTML = `<span style="color:#6ee7a0">✓ Apoyas a <b>${esc(st.comp.name)}</b>.</span>`;
    else s.innerHTML = cmsg ? `<span style="color:#ff9b9b">${esc(cmsg)}</span>` : '';
  }
  cc.oninput = () => {
    cc.value = cc.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); $('#cclear').classList.toggle('hidden', !cc.value);
    st.comp = null; cmsg = ''; clearTimeout(ctimer); paint();
    if (cc.value.length < 3) return;
    const my = ++cseq;
    ctimer = setTimeout(async () => {
      try { const r = await api(`/api/events/${e.id}/competitor-code?code=${encodeURIComponent(cc.value)}`); if (my !== cseq) return; st.comp = { name: r.competitor.name, code: cc.value }; cmsg = ''; }
      catch (er) { if (my !== cseq) return; cmsg = er.message; }
      paint();
    }, 350);
  };
  $('#cclear').onclick = () => { cc.value = ''; cc.oninput(); cc.focus(); };

  // ----- Pasos: 1) Entradas  2) Método de pago -----
  let step = 1;
  const fEl = $('#f');
  function showStep(n) {
    step = n;
    $('#pane1').classList.toggle('hidden', n !== 1);
    $('#pane2').classList.toggle('hidden', n !== 2);
    $$('#wiz .wz').forEach((b) => { b.classList.toggle('on', Number(b.dataset.s) === n); b.classList.toggle('done', n === 2 && b.dataset.s === '1'); });
    $('#err').textContent = '';
    fEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function pane1Valid() {
    if (!checkAge()) { birth.focus(); return false; }
    for (const el of $$('#pane1 input[required]')) { if (!el.checkValidity()) { el.reportValidity(); return false; } }
    return true;
  }
  $('#next').onclick = () => { if (pane1Valid()) showStep(2); };
  $('#back').onclick = () => showStep(1);
  $$('#wiz .wz').forEach((b) => b.onclick = () => { if (b.dataset.s === '1') showStep(1); else if (pane1Valid()) showStep(2); });

  paintHolders(); paintBox(); paint();
  $('#f').onsubmit = async (ev) => {
    ev.preventDefault(); $('#err').textContent = '';
    if (step === 1) { if (pane1Valid()) showStep(2); return; }
    if (!pane1Valid()) { showStep(1); return; }
    if (!ev.target.reportValidity()) return;
    if (cc.value && !st.comp) { $('#err').textContent = 'El código del competidor no es válido. Corrígelo o bórralo para continuar sin apoyar.'; cc.focus(); return; }
    const fd = Object.fromEntries(new FormData(ev.target));
    const custom = cur().per_unit > 1 && st.hmode === 'custom';
    const holders = custom ? $$('[name=holder]').map((i) => i.value.trim()) : undefined;
    if (cur().per_unit > 1 && !confirm(custom ? `¿Confirmas los ${qtyTotal()} nombres? No se podrán cambiar después.` : `¿Confirmas que las ${qtyTotal()} entradas saldrán a nombre de ${fd.full_name}? No se podrá cambiar después.`)) return;
    const body = { event_id: e.id, full_name: fd.full_name, email: fd.email, phone: fd.phone, dpi: fd.dpi, birth: fd.birth, ticket_type: st.type, units: st.units, payment_method: st.method, auth_number: fd.auth_number, competitor_code: st.comp ? st.comp.code : '', holders, holders_self: cur().per_unit > 1 && !custom ? true : undefined };
    try {
      const r = await busy($('#submit'), () => api('/api/orders', { method: 'POST', body }));
      toast('Solicitud enviada. Ahora envía tu comprobante por WhatsApp para que podamos autorizarla.', 'long'); go('#/pago/' + r.id);
    } catch (er) { $('#err').textContent = er.message; }
  };
}

async function pagePay(id) {
  const v = shell('#/mis-solicitudes', '<div class="empty">Cargando…</div>');
  const [{ order: o }, cfg] = await Promise.all([api('/api/orders/' + id), api('/api/config')]);
  S.cfg = cfg; const b = cfg.bank;
  const head = `<div class="mb"><a href="#/mis-solicitudes">← Mis compras</a></div>
    <div class="card mb"><div class="between"><div><h2>Solicitud #${o.id} · ${esc(o.event.title)} ${esc(o.event.subtitle)}</h2>
      <p class="muted small">${o.units} × ${esc(o.type_name)}${o.per_unit > 1 ? ` (${o.qty} entradas)` : ''} · ${money(o.total)} · ${METHOD[o.payment_method]} · ${fDate(o.event.event_date)} · ${esc(o.event.location)}</p>
      ${o.competitor ? `<p class="small" style="margin-top:6px">${I.trophy.replace('<svg', '<svg class="inl"')} Apoyas a <b>${esc(o.competitor.name)}</b></p>` : ''}</div><div>${badge(o.status)}</div></div></div>`;
  const proofMsg = () => `Hola, te envío el comprobante de mi pago del pedido #${o.id} (${METHOD[o.payment_method]}).\nNombre: ${o.full_name}\nMonto: ${money(o.total)}${o.auth_number ? `\nReferencia: ${o.auth_number}` : ''}`;
  let main = '';
  if (o.status === 'aprobada') {
    main = `<div class="card"><h2>¡Pago confirmado! 🎉</h2><p class="muted">Tus boletos fueron enviados a <b>${esc(o.email)}</b>. También puedes compartirlos por WhatsApp desde aquí. Un boleto deja de mostrar su QR cuando se utiliza.</p>${ticketCards(o)}</div>`;
  } else if (o.status === 'cancelada') {
    main = '<div class="card empty">Esta solicitud fue cancelada.</div>';
  } else if (o.status === 'pendiente_efectivo') {
    main = '<div class="card empty">El pago en efectivo ya no se acepta. Cancela esta solicitud y realiza una nueva con transferencia o depósito.<br><br><button class="btn ghost" id="cancel">Cancelar solicitud</button></div>';
  } else {
    const review = o.status === 'por_validar';
    main = `<div class="cols"><div>
      ${o.status === 'rechazada' ? `<div class="card" style="border-color:var(--err)"><b>Tu pago no pudo ser validado.</b><p class="muted">${esc(o.reject_reason || '')}</p><p class="small">Verifica la referencia, envíala de nuevo y manda tu comprobante por WhatsApp.</p></div>` : ''}
      <div class="card">${proofBox(cfg, proofMsg).replace('style="margin-top:14px"', 'style="margin:0"')}
        <p class="muted small" style="margin-top:10px">Tus boletos se emiten cuando revisemos tu comprobante y confirmemos el pago.</p></div>
      <div class="card"><div class="step-head"><span class="step-n">1</span><div><h2>Datos de la cuenta</h2><p class="muted small">Si aún no pagas, ${o.payment_method === 'deposito' ? 'deposita' : 'transfiere'} el monto exacto.</p></div></div>
        <div class="bank"><div class="r"><span>Banco</span><b>${esc(b?.name)}</b></div><div class="r"><span>Tipo de cuenta</span><b>${esc(b?.type)}</b></div>
          <div class="r"><span>Número de cuenta</span><div><b>${esc(b?.account)}</b><button class="copy" data-copy="${esc(b?.account)}">Copiar</button></div></div>
          <div class="r"><span>A nombre de</span><b>${esc(b?.holder)}</b></div><div class="r"><span>Monto</span><b class="amt">${money(o.total)}</b></div>
          <div class="r"><span>Referencia / comentario</span><div><b>Orden #${o.id}</b></div></div></div></div>
      <form class="card" id="f"><div class="step-head"><span class="step-n">2</span><div><h2>Número de referencia del pago</h2><p class="muted small">Lo encuentras en tu comprobante.</p></div></div>
        ${review ? `<div class="note" style="margin:0 0 14px">${I.info}<span>Ya enviaste la referencia <b>${esc(o.auth_number)}</b> el ${fStamp(o.paid_at)}. Se está revisando; puedes corregirla si te equivocaste.</span></div>` : ''}
        ${field('id', 'Número de referencia', `name="auth_number" placeholder="Ej. 123456789" value="${esc(review ? o.auth_number : '')}" required`)}
        <button class="btn full" style="margin-top:16px">${I.send} ${review ? 'Actualizar referencia' : 'Enviar'}</button><div class="err" id="err" role="alert"></div></form>${pendingList(o)}</div>
      <aside class="card sum"><div class="poster" style="background-image:url(${esc(o.event.poster)})"></div>
        <div class="line"><span>${o.units} × ${esc(o.type_name)}</span><span style="font-size:20px">${money(o.total)}</span></div>
        <div class="note">${I.info}<span>Cuando se confirme tu pago recibirás tus boletos con código QR por <b>correo</b> y los verás aquí.</span></div></aside></div>`;
  }
  v.innerHTML = head + main;
  $$('[data-copy]', v).forEach((c) => c.onclick = () => { navigator.clipboard?.writeText(c.dataset.copy); toast('Copiado', 'ok'); });
  bindShare(v, o);
  $('#cancel')?.addEventListener('click', async () => { if (!confirm('¿Cancelar esta solicitud?')) return; try { await api('/api/orders/' + o.id, { method: 'DELETE' }); go('#/mis-solicitudes'); } catch (er) { toast(er.message, 'err'); } });
  $('#f')?.addEventListener('submit', async (ev) => {
    ev.preventDefault(); $('#err').textContent = '';
    try { await busy($('#f .btn'), () => api(`/api/orders/${o.id}/payment`, { method: 'POST', body: { auth_number: ev.target.auth_number.value } })); toast('Referencia enviada. No olvides mandar tu comprobante por WhatsApp.', 'ok'); pagePay(o.id); }
    catch (er) { $('#err').textContent = er.message; }
  });
}
async function pageMyOrders() {
  const v = shell('#/mis-solicitudes', '<div class="empty">Cargando…</div>');
  const { orders } = await api('/api/orders');
  v.innerHTML = `<h1 class="mb">Mis compras</h1>${orders.length ? `<div class="list">${orders.map((o) => `<div class="card order"><div>
      <h3>#${o.id} · ${esc(o.event.title)} ${esc(o.event.subtitle)} ${badge(o.status)}</h3>
      <div class="meta"><span>${o.units} × ${esc(o.type_name)}</span><span>${o.qty} entrada${o.qty > 1 ? 's' : ''}</span><span>${money(o.total)}</span><span>${METHOD[o.payment_method]}</span><span>${fDate(o.event.event_date)}</span><span>Creada ${fStamp(o.created_at)}</span></div>
      ${o.competitor ? `<div class="muted small" style="margin-top:6px">Apoyas a: <b>${esc(o.competitor.name)}</b></div>` : ''}
      ${o.status === 'rechazada' ? `<p class="small" style="color:#ff9b9b;margin-top:6px">${esc(o.reject_reason || '')}</p>` : ''}</div>
      <div class="acts">${o.status === 'aprobada' ? `<a class="btn sm ok" href="#/pago/${o.id}">Ver boletos</a>` : ['solicitada', 'rechazada', 'por_validar', 'pendiente_efectivo'].includes(o.status) ? `<a class="btn sm" href="#/pago/${o.id}">${o.status === 'por_validar' || o.status === 'pendiente_efectivo' ? 'Ver estado' : 'Pagar / reportar transferencia'}</a>` : ''}
      ${['solicitada', 'pendiente_efectivo'].includes(o.status) ? `<button class="btn sm ghost" data-cancel="${o.id}">Cancelar</button>` : ''}</div></div>`).join('')}</div>`
    : '<div class="card empty">Aún no tienes compras. <br><br><a class="btn" href="#/eventos">Comprar entradas</a></div>'}`;
  $$('[data-cancel]', v).forEach((b) => b.onclick = async () => {
    if (!confirm('¿Cancelar esta solicitud?')) return;
    try { await api('/api/orders/' + b.dataset.cancel, { method: 'DELETE' }); pageMyOrders(); } catch (er) { toast(er.message, 'err'); }
  });
}
function pageProfile() {
  const v = shell('#/perfil', '');
  v.innerHTML = `<h1 class="mb">Perfil y seguridad</h1><div class="cols cols-eq">
    <div class="card"><h2>Mis datos</h2><div class="bank"><div class="r"><span>Nombre</span><b>${esc(S.user.name)}</b></div><div class="r"><span>Correo</span><b class="brk">${esc(S.user.email)}</b></div><div class="r"><span>Rol</span><b>${roleName(S.user.role)}</b></div>${S.user.phone ? `<div class="r"><span>Teléfono</span><b>${esc(S.user.phone)}</b></div>` : ''}</div></div>
    <form class="card" id="f"><h2 style="margin-bottom:14px">Cambiar contraseña</h2><div class="stack">
      ${field('lock', 'Contraseña actual', 'name="current" type="password" autocomplete="current-password" required')}
      ${field('lock', 'Nueva contraseña', 'name="password" type="password" autocomplete="new-password" placeholder="Mínimo 8, letras y números" required')}
      <button class="btn">Guardar</button><div class="err" id="err" role="alert"></div></div></form></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); $('#err').textContent = '';
    try { await busy($('#f .btn'), () => api('/api/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) })); toast('Contraseña actualizada.', 'ok'); e.target.reset(); }
    catch (er) { $('#err').textContent = er.message; }
  };
}

/* ---------- Taquilla + Administración ---------- */
const isAdmin = () => S.user.role === 'ADMIN';
const pathPagos = () => '#/admin/solicitudes';
const pathBoletos = () => '#/admin/boletos';
const pathScan = () => (isAdmin() ? '#/admin/escaner' : '#/taquilla/escaner');
const WA_ST = { manual: 'pendiente de envío manual', enviado: 'enviado por API', simulado: 'simulado' };

// Actualización automática: vuelve a pintar la página solo cuando los datos del servidor cambian
let pollT = null;
function autoRefresh(url, rerender, ms = 12000) {
  clearInterval(pollT); let last = null;
  api(url).then((r) => { last = JSON.stringify(r); }).catch(() => {});
  pollT = setInterval(async () => {
    if (document.hidden || document.querySelector('.modal-bg') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.querySelector('details[open]')) return;
    try { const j = JSON.stringify(await api(url)); if (last !== null && j !== last) { last = j; rerender(); } else if (last === null) last = j; } catch { /* sin red: se reintenta */ }
  }, ms);
}

async function pageStaffHome() {
  const v = shell('#/admin', '<div class="empty">Cargando…</div>');
  const s = await api('/api/admin/stats');
  const stat = (b, t, hl) => `<div class="stat"><b ${hl ? 'style="color:var(--yellow)"' : ''}>${b}</b><span>${t}</span></div>`;
  v.innerHTML = `<h1 class="mb">Panel de administración <small class="muted live">● en vivo</small></h1><div class="stats">
    ${stat(s.eventos, 'Eventos registrados')}${stat(s.vendidas, 'Entradas vendidas (pagadas)')}${stat(s.pendientes, 'Entradas pendientes de pago', 1)}
    ${stat(s.por_validar, 'Pagos por autorizar', 1)}${stat(s.ingresados, 'Entradas utilizadas')}${stat(s.mesas_vendidas, 'Mesas de 5 vendidas')}
    ${stat(money(s.recaudado), 'Ingresos confirmados')}${stat(money(s.fit_total), 'FIT de competidores (pagado)')}</div>
    <div class="cols cols-eq"><div class="card"><h2 class="mb">Ingresos por evento</h2>${s.events.length ? `<div class="list tight">${s.events.map((e) => `<div class="row-kv"><div><b>${esc(e.title)} ${esc(e.subtitle || '')}</b><span class="muted small">${e.sold} vendidas · ${e.pending} pendientes · ${e.used} utilizadas</span></div><b class="amt">${money(e.revenue)}</b></div>`).join('')}</div>` : '<p class="muted">Sin eventos.</p>'}</div>
    <div class="card"><h2 class="mb">Apoyos por competidor (FIT)</h2>${s.supports.length ? `<div class="list tight">${s.supports.map((c) => `<div class="row-kv"><div><b>${esc(c.name)}</b><span class="muted small">${esc(c.code)} · ${c.tickets} entrada${c.tickets === 1 ? '' : 's'}</span></div><b class="amt">${money(c.fit)}</b></div>`).join('')}</div><p class="muted small" style="margin-top:8px">Solo pagos confirmados. Detalle completo en Reportes.</p>` : '<p class="muted">Aún no hay apoyos confirmados.</p>'}</div></div>
    <div class="btn-row" style="margin-top:18px"><a class="btn" href="#/admin/solicitudes">Revisar pagos${s.por_validar ? ` (${s.por_validar})` : ''}</a><a class="btn ghost" href="#/admin/escaner">Abrir escáner QR</a></div>`;
  autoRefresh('/api/admin/stats', pageStaffHome);
}

// Panel de solo lectura del perfil "Taquilla (panel)": únicamente entradas vendidas y utilizadas
async function pagePanelOnly() {
  const v = shell('#/panel', '<div class="empty">Cargando…</div>');
  const s = await api('/api/panel/stats');
  v.innerHTML = `<h1 class="mb">Panel de taquilla <small class="muted live">● en vivo</small></h1>
    <div class="stats stats3"><div class="stat"><b>${s.sold}</b><span>Entradas vendidas</span></div><div class="stat"><b style="color:#6ee7a0">${s.used}</b><span>Entradas utilizadas</span></div><div class="stat"><b style="color:var(--yellow)">${s.pending_entry}</b><span>Por ingresar</span></div></div>
    ${s.events.map((e) => `<div class="card"><h2>${esc(e.title)} ${esc(e.subtitle || '')}</h2><p class="muted small" style="margin-bottom:10px">${fDate(e.event_date)} · ${e.used} de ${e.sold} ya ingresaron</p>
      <div class="bar"><i style="width:${e.sold ? Math.round((e.used / e.sold) * 100) : 0}%"></i></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tipo de entrada</th><th>Vendidas</th><th>Utilizadas</th></tr></thead><tbody>${e.by_type.map((t) => `<tr><td data-l="Tipo">${esc(t.name)}</td><td data-l="Vendidas">${t.sold}</td><td data-l="Utilizadas">${t.used}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}`;
  autoRefresh('/api/panel/stats', pagePanelOnly, 8000);
}

let ordTab = 'por_validar', ordQ = '';
async function pageStaffOrders() {
  const v = shell(pathPagos(), '<div class="empty">Cargando…</div>');
  const tabs = [['por_validar', 'Por autorizar'], ['aprobada', 'Pagadas'], ['rechazada', 'Rechazadas'], ['cancelada', 'Canceladas'], ['solicitada', 'Sin pago'], ['todas', 'Todas']];
  const url = `/api/staff/orders?status=${encodeURIComponent(ordTab)}&q=${encodeURIComponent(ordQ)}`;
  const { orders } = await api(url);
  v.innerHTML = `<h1 class="mb">Compras y pagos <small class="muted live">● en vivo</small></h1>
    <form class="searchbar" id="sf">${I.search}<input type="search" name="q" value="${esc(ordQ)}" placeholder="Buscar por nombre, teléfono, correo, referencia o Nº de pedido/boleto" aria-label="Buscar compra"><button class="btn sm">Buscar</button></form>
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button class="tab ${ordTab === k ? 'active' : ''}" role="tab" data-tab="${k}">${t}</button>`).join('')}</div>
    ${orders.length ? `<div class="list">${orders.map((o) => `<div class="card order"><div>
      <h3>#${o.id} · ${esc(o.full_name)} ${badge(o.status)}</h3>
      <div class="meta"><span>${esc(o.event.title)} ${esc(o.event.subtitle)}</span><span><b>${o.units}</b> × ${esc(o.type_name)}${o.per_unit > 1 ? ` (${o.qty} entradas)` : ''}</span><span><b>${money(o.total)}</b></span><span>${METHOD[o.payment_method] || o.payment_method}</span>
        ${o.dpi ? `<span>DPI ${esc(o.dpi)}</span>` : ''}<span>Tel. ${esc(o.phone)}</span>${o.account_email ? `<span class="brk">${esc(o.account_email)}</span>` : ''}</div>
      ${o.competitor ? `<div class="muted small" style="margin-top:6px">Apoya a: <b>${esc(o.competitor.name)}</b></div>` : ''}
      ${o.auth_number ? `<div style="margin-top:8px">Referencia: <b class="amt">${esc(o.auth_number)}</b> <span class="muted small">· reportada ${fStamp(o.paid_at)}</span></div>` : '<div class="muted small" style="margin-top:8px">Aún no reporta referencia.</div>'}
      ${o.status === 'por_validar' ? `<div class="note warn" style="margin:10px 0 0">${I.wa}<span>No autorices sin haber recibido el <b>comprobante</b> en WhatsApp (${fmtPhone(S.cfg?.proof?.phone || '35962132')}).</span></div>` : ''}
      ${o.status === 'aprobada' ? `<div class="muted small" style="margin-top:6px">Confirmó: ${esc(o.approved_by || '—')} ${o.confirmed_at ? '· ' + fStamp(o.confirmed_at) : ''} · Correo: ${esc(o.email_status || '—')} · WhatsApp: ${esc(WA_ST[o.wa_status] || o.wa_status || '—')}</div>` : ''}
      ${o.status === 'rechazada' ? `<div class="small" style="color:#ff9b9b;margin-top:6px">${esc(o.reject_reason || '')}</div>` : ''}
      ${o.status === 'aprobada' ? `<details class="tk-det" data-oid="${o.id}"><summary>Ver boletos (${o.tickets.length})</summary>${ticketCards(o, { staff: true })}</details>` : ''}</div>
      <div class="acts">${o.status === 'por_validar' ? `<button class="btn sm ok" data-ok="${o.id}">Autorizar</button><button class="btn sm danger" data-no="${o.id}">Rechazar</button><a class="btn sm wa" target="_blank" rel="noopener" href="https://wa.me/${o.wa_phone}?text=${encodeURIComponent(`Hola ${o.full_name.split(' ')[0]}, te escribimos de DOKAN Tickets sobre tu pedido #${o.id}. Por favor envíanos tu comprobante de pago para poder autorizarlo.`)}">${I.wa} Pedir comprobante</a>` : ''}
      ${['pendiente_efectivo', 'solicitada'].includes(o.status) ? `<button class="btn sm ghost" data-cx="${o.id}">Cancelar</button>` : ''}</div></div>`).join('')}</div>` : '<div class="card empty">No hay compras en esta categoría.</div>'}`;
  $('#sf').onsubmit = (e) => { e.preventDefault(); ordQ = e.target.q.value.trim(); if (ordQ) ordTab = 'todas'; pageStaffOrders(); };
  $$('[data-tab]', v).forEach((b) => b.onclick = () => { ordTab = b.dataset.tab; pageStaffOrders(); });
  const byId = (id) => orders.find((o) => String(o.id) === String(id));
  $$('.tk-det', v).forEach((d) => { const o = byId(d.dataset.oid); bindShare(d, o, { phone: o.wa_phone }); });
  $$('[data-ok]', v).forEach((b) => b.onclick = () => {
    const o = byId(b.dataset.ok);
    const m = modal({ title: `Autorizar pago #${o.id}`, body: `<form id="af" class="stack"><div class="bank"><div class="r"><span>Comprador</span><b>${esc(o.full_name)}</b></div><div class="r"><span>Monto</span><b class="amt">${money(o.total)}</b></div><div class="r"><span>Referencia</span><b>${esc(o.auth_number || '—')}</b></div></div>
      <label class="chk"><input type="checkbox" name="proof" required> <span>Confirmo que <b>recibí el comprobante</b> por WhatsApp y que coincide con el monto y la referencia.</span></label>
      <button class="btn ok">Autorizar y emitir boletos</button><div class="err" id="aerr" role="alert"></div></form>` });
    $('#af', m.el).onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await busy($('#af .btn', m.el), () => api(`/api/staff/orders/${o.id}/approve`, { method: 'POST', body: { proof_received: e.target.proof.checked } })); m.close(); toast(`Pago confirmado. Correo: ${r.order.email_status} · WhatsApp: ${WA_ST[r.order.wa_status] || r.order.wa_status}`, 'ok'); ordTab = 'aprobada'; pageStaffOrders(); }
      catch (er) { $('#aerr', m.el).textContent = er.message; }
    };
  });
  $$('[data-no]', v).forEach((b) => b.onclick = () => {
    const m = modal({ title: 'Rechazar pago', body: `<form id="rf" class="stack"><div class="field"><label>Motivo (lo verá el cliente)</label><div class="input"><input name="r" value="No recibimos el comprobante o no coincide con la referencia." required></div></div><button class="btn danger">Rechazar</button><div class="err" id="rerr"></div></form>` });
    $('#rf', m.el).onsubmit = async (e) => { e.preventDefault(); try { await api(`/api/staff/orders/${b.dataset.no}/reject`, { method: 'POST', body: { reason: e.target.r.value } }); m.close(); toast('Solicitud rechazada.'); pageStaffOrders(); } catch (er) { $('#rerr', m.el).textContent = er.message; } };
  });
  $$('[data-cx]', v).forEach((b) => b.onclick = async () => {
    if (!confirm('¿Cancelar esta solicitud? No se emitirán boletos.')) return;
    try { await api(`/api/staff/orders/${b.dataset.cx}/cancel`, { method: 'POST', body: {} }); toast('Solicitud cancelada.'); pageStaffOrders(); } catch (er) { toast(er.message, 'err'); }
  });
  if (!ordQ) autoRefresh(url, pageStaffOrders);
}

let tkQ = '';
async function pageStaffTickets() {
  const v = shell(pathBoletos(), '<div class="empty">Cargando…</div>');
  const { tickets } = tkQ ? await api(`/api/staff/tickets?q=${encodeURIComponent(tkQ)}`) : { tickets: [] };
  v.innerHTML = `<h1 class="mb">Consultar boletos</h1>
    <form class="searchbar" id="sf">${I.search}<input type="search" name="q" value="${esc(tkQ)}" placeholder="Nº de boleto, Nº de pedido o nombre del titular" aria-label="Buscar boleto" autofocus><button class="btn sm">Buscar</button></form>
    ${tickets.length ? `<div class="list">${tickets.map((t) => `<div class="card order"><div><h3>#${t.number} · ${esc(t.type_name)}${t.pkg_size > 1 ? ` ${t.seq}/${t.pkg_size}` : ''} ${tBadge(t.status)}</h3>
      <div class="meta"><span>Titular: <b>${esc(t.holder)}</b></span><span>Comprador: ${esc(t.buyer)}</span><span>Pedido #${t.order_id}</span><span>${esc(t.event)}</span></div>
      ${t.status === 'utilizada' ? `<div class="small" style="margin-top:6px;color:#ffd36b">Ingresó ${fStamp(t.used_at)}${t.used_by ? ` · registró ${esc(t.used_by)}` : ''}</div>` : ''}</div>
      <div class="acts"><a class="btn sm ghost" target="_blank" rel="noopener" href="${t.url}">Ver imagen</a>${isAdmin() && t.status === 'valida' ? `<button class="btn sm danger" data-void="${t.id}" data-n="${t.number}">Anular</button>` : ''}</div></div>`).join('')}</div>`
      : `<div class="card empty">${tkQ ? 'No se encontraron boletos.' : 'Escribe un número o un nombre para buscar.'}</div>`}`;
  $('#sf').onsubmit = (e) => { e.preventDefault(); tkQ = e.target.q.value.trim(); pageStaffTickets(); };
  $$('[data-void]', v).forEach((b) => b.onclick = () => {
    const m = modal({ title: `Anular boleto #${b.dataset.n}`, body: `<form id="vf" class="stack"><p class="muted small">El boleto dejará de ser válido en el escáner. Esta acción queda registrada en la auditoría.</p>
      <div class="field"><label>Motivo</label><div class="input"><input name="reason" required minlength="3" maxlength="200"></div></div>
      <label class="chk"><input type="checkbox" name="refund"> Marcar como <b>reembolsado</b></label><button class="btn danger">Anular boleto</button><div class="err" id="verr"></div></form>` });
    $('#vf', m.el).onsubmit = async (e) => { e.preventDefault(); try { await api(`/api/admin/tickets/${b.dataset.void}/void`, { method: 'POST', body: { reason: e.target.reason.value, refund: e.target.refund.checked } }); m.close(); toast('Boleto anulado.', 'ok'); pageStaffTickets(); } catch (er) { $('#verr', m.el).textContent = er.message; } };
  });
}

/* ---------- Escáner QR ---------- */
let scanner = null, scanEvent = null, camId = '';
async function stopScanner() { if (scanner) { try { await scanner.stop(); } catch { /* ya detenido */ } try { scanner.clear(); } catch { /* sin vista */ } scanner = null; } }
// El lector se sirve desde el propio servidor (npm install html5-qrcode); los CDN son solo respaldo.
function loadQrLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  const urls = ['/vendor/html5-qrcode.min.js', 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js', 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'];
  return urls.reduce((p, u) => p.catch(() => new Promise((ok, no) => { const s = document.createElement('script'); s.src = u; s.onload = () => (window.Html5Qrcode ? ok() : no()); s.onerror = no; document.head.append(s); })), Promise.reject())
    .catch(() => { throw Object.assign(new Error('No se pudo cargar el lector de QR. Ejecuta "npm install" en el servidor o revisa tu conexión. Mientras tanto puedes validar escribiendo el número del boleto.'), { plain: true }); });
}
function camError(er) {
  const n = er?.name || '', m = String(er?.message || er);
  if (/NotAllowed|Permission|denied/i.test(n + m)) return 'Permiso de cámara denegado. Actívalo en el candado de la barra de direcciones (o en Ajustes del navegador) y vuelve a intentar.';
  if (/NotFound|no camera|Requested device not found/i.test(n + m)) return 'No se encontró ninguna cámara en este dispositivo.';
  if (/NotReadable|in use|Could not start/i.test(n + m)) return 'La cámara está siendo usada por otra aplicación. Ciérrala e intenta de nuevo.';
  return 'No se pudo iniciar la cámara: ' + m;
}
const RES_LABEL = { valida: 'Válida', ya_utilizada: 'Ya utilizada', ingreso_registrado: 'Ingreso registrado', invalida: 'No reconocido', evento_incorrecto: 'Otro evento', cancelada: 'Anulada', reembolsada: 'Reembolsada' };
async function pageScanner() {
  const v = shell(pathScan(), '');
  const { events } = await api('/api/staff/events');
  if (!events.length) { v.innerHTML = '<div class="card empty">No hay eventos para validar.</div>'; return; }
  if (!events.some((e) => e.id === scanEvent)) scanEvent = (events.find((e) => e.active) || events[0]).id;
  v.innerHTML = `<h1 class="mb">Escáner de boletos</h1>
    <div class="cols cols-scan"><div class="card">
      <div class="field"><label>Evento que estás validando</label><div class="input">${I.cal}<select id="ev">${events.map((e) => `<option value="${e.id}" ${e.id === scanEvent ? 'selected' : ''}>${esc(e.title)} ${esc(e.subtitle || '')} · ${fDate(e.event_date)}</option>`).join('')}</select></div></div>
      <div id="reader" aria-label="Vista de la cámara"></div>
      <div class="field" id="camrow" style="margin-top:12px"><label>Cámara</label><div class="input">${I.scan}<select id="cams"><option value="">Automática (trasera)</option></select></div></div>
      <div class="btn-row" style="margin-top:12px"><button class="btn" id="start">Iniciar cámara</button><button class="btn ghost" id="stop">Detener</button></div>
      <label class="chk" style="margin-top:12px"><input type="checkbox" id="auto"> Registrar el ingreso automáticamente al escanear un boleto válido</label>
      <div class="err" id="serr" role="alert"></div><div class="muted small">La cámara requiere HTTPS (o localhost) y tu permiso.</div>
      <div class="muted small" style="margin-top:14px">Los boletos se validan únicamente con su código QR.</div></div>
    <div id="res"><div class="card empty">El resultado del escaneo aparecerá aquí.</div></div></div>
    <div class="card" style="margin-top:18px"><h2 class="mb">Historial de escaneos ${isAdmin() ? '' : '<small class="muted">(solo los tuyos)</small>'}</h2><div id="hist"><div class="empty">Cargando…</div></div></div>`;
  const evSel = $('#ev'); evSel.onchange = () => { scanEvent = Number(evSel.value); lastText = ''; $('#res').innerHTML = '<div class="card empty">El resultado del escaneo aparecerá aquí.</div>'; loadHist(); };
  async function loadHist() {
    try {
      const { scans } = await api(`/api/staff/scans?event_id=${scanEvent}&limit=40`);
      $('#hist').innerHTML = scans.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha y hora</th><th>Resultado</th><th>Boleto</th><th>Titular</th><th>Registró</th></tr></thead><tbody>${scans.map((s) => `<tr><td data-l="Fecha y hora">${fStamp(s.at)}</td><td data-l="Resultado"><span class="badge r-${s.result}">${RES_LABEL[s.result] || s.result}</span></td><td data-l="Boleto">${s.number ? '#' + s.number + ' · ' + esc(s.type_name) : '—'}</td><td data-l="Titular">${esc(s.holder || '—')}</td><td data-l="Registró">${esc(s.user || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin escaneos todavía.</p>';
    } catch (er) { if (!er.stale) $('#hist').textContent = er.message; }
  }
  let lastText = '', lastAt = 0, working = false;
  const info = (t) => `<div class="muted small" style="margin-top:10px">BOLETO</div><div class="num">${esc(t.number)}</div>
    <dl><dt>Evento</dt><dd>${esc(t.event)}</dd><dt>Tipo</dt><dd><b>${esc(t.type_name)}${t.pkg_size > 1 ? ` · entrada ${t.seq} de ${t.pkg_size}` : ''}</b></dd><dt>Titular</dt><dd><b>${esc(t.name)}</b></dd>
    ${t.dpi ? `<dt>DPI</dt><dd>${esc(t.dpi)}</dd>` : ''}${t.birth ? `<dt>Nacimiento</dt><dd>${esc(t.birth)}</dd>` : ''}<dt>Pago</dt><dd>${esc(t.payment)}</dd><dt>Fecha</dt><dd>${esc(t.date)} · ${esc(t.time)}</dd><dt>Lugar</dt><dd>${esc(t.location)}</dd></dl>`;
  function show(r, raw) {
    const box = $('#res');
    if (r.state === 'ingreso_registrado') { box.innerHTML = `<div class="scan-res ok"><h2>✅ INGRESO REGISTRADO</h2>${info(r.ticket)}</div>`; navigator.vibrate?.(120); return; }
    if (r.state === 'ya_utilizada') {
      box.innerHTML = `<div class="scan-res warn" role="alert"><h2>⚠️ ENTRADA YA UTILIZADA</h2><p><b>No se permite un segundo ingreso.</b><br>Primer ingreso: ${fStamp(r.ticket.used_at)}${r.ticket.used_by ? ` · registró ${esc(r.ticket.used_by)}` : ''}</p>${info(r.ticket)}</div>`; navigator.vibrate?.([200, 100, 200]); return;
    }
    if (!r.valid) { box.innerHTML = `<div class="scan-res bad" role="alert"><h2>❌ ACCESO DENEGADO</h2><p>${esc(r.reason || 'Boleto no válido.')}</p></div>`; navigator.vibrate?.([300]); return; }
    box.innerHTML = `<div class="scan-res ok"><h2>✅ ENTRADA VÁLIDA</h2><p>La entrada puede utilizarse.</p>${info(r.ticket)}<button class="btn ok full" id="ci">Registrar ingreso</button></div>`;
    $('#ci').onclick = (ev) => checkin(raw, ev.currentTarget);
  }
  async function checkin(raw, btn) {
    try { const r = await (btn ? busy(btn, () => api('/api/staff/checkin', { method: 'POST', body: { code: raw, event_id: scanEvent } })) : api('/api/staff/checkin', { method: 'POST', body: { code: raw, event_id: scanEvent } })); show(r, raw); if (r.ok) toast('Ingreso registrado ✔', 'ok'); }
    catch (er) { toast(er.message, 'err'); }
    loadHist();
  }
  async function check(raw) {
    raw = String(raw || '').trim(); if (!raw || working) return;
    // Evita procesar muchas veces la misma lectura de la cámara
    if (raw === lastText && Date.now() - lastAt < 15000) return;
    lastText = raw; lastAt = Date.now(); working = true;
    try {
      const r = await api('/api/staff/scan', { method: 'POST', body: { code: raw, event_id: scanEvent } });
      if (r.valid && $('#auto').checked) await checkin(raw); else { show(r, raw); loadHist(); }
    } catch (er) { toast(er.message, 'err'); lastText = ''; } finally { working = false; }
  }
  $('#stop').onclick = stopScanner;
  $('#cams').onchange = (e) => { camId = e.target.value; if (scanner) $('#start').click(); };
  $('#start').onclick = async () => {
    const err = $('#serr'); err.textContent = '';
    if (!window.isSecureContext) { err.textContent = 'La cámara solo funciona con HTTPS (o localhost). Abre el sitio con https:// o escribe el número del boleto.'; return; }
    if (!navigator.mediaDevices?.getUserMedia) { err.textContent = 'Este navegador no permite acceder a la cámara.'; return; }
    const btn = $('#start'); btn.disabled = true;
    try {
      await loadQrLib();
      const cams = await Html5Qrcode.getCameras(); // aquí el navegador pide el permiso
      if (!cams.length) throw { name: 'NotFoundError' };
      const sel = $('#cams');
      if (sel.options.length <= 1) cams.forEach((c, i) => sel.add(new Option(c.label || `Cámara ${i + 1}`, c.id)));
      if (camId) sel.value = camId;
      await stopScanner();
      scanner = new Html5Qrcode('reader', { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
      const cfg = { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s }; } };
      const tries = [camId || { facingMode: 'environment' }, { facingMode: 'environment' }, cams[0].id];
      let last;
      for (const t of tries) { try { await scanner.start(t, cfg, (txt) => check(txt), () => {}); last = null; break; } catch (e2) { last = e2; if (/NotAllowed|Permission/i.test(e2?.name + e2)) break; } }
      if (last) throw last;
    } catch (er) { await stopScanner(); err.textContent = er.plain ? er.message : camError(er); }
    finally { btn.disabled = false; }
  };
  loadHist();
}

/* ---------- Solo administrador ---------- */
let editingEvent = null;
async function pageAdminEvents() {
  const v = shell('#/admin/eventos', '<div class="empty">Cargando…</div>');
  const { events } = await api('/api/admin/events');
  const ed = events.find((e) => e.id === editingEvent) || null;
  v.innerHTML = `<h1 class="mb">Eventos</h1><div class="cols cols-eq">
    <div class="list">${events.map((e) => `<div class="card order"><div><h3>${esc(e.title)} ${esc(e.subtitle)} ${e.active ? '<span class="badge b-aprobada">Activo</span>' : '<span class="badge b-cancelada">Oculto</span>'}</h3><div class="meta"><span>${fDate(e.event_date)} ${fTime(e.event_time)}</span><span>${esc(e.location)}</span></div></div>
      <div class="acts"><button class="btn sm ghost" data-ed="${e.id}">Editar</button><button class="btn sm ghost" data-tg="${e.id}">${e.active ? 'Ocultar' : 'Mostrar'}</button><button class="btn sm danger" data-del="${e.id}">Eliminar</button></div></div>`).join('') || '<div class="card empty">Sin eventos.</div>'}</div>
    <form class="card" id="f"><h2 class="mb">${ed ? 'Editar evento' : 'Nuevo evento'}</h2><div class="stack">
      ${field('ticket', 'Título', `name="title" placeholder="Amateur Fight League" value="${esc(ed?.title || '')}" required`)}
      ${field('ticket', 'Subtítulo', `name="subtitle" placeholder="Séptima Edición" value="${esc(ed?.subtitle || '')}"`, false)}
      ${field('cal', 'Fecha', `name="event_date" type="date" value="${esc(ed?.event_date || '')}" required`)}${field('cal', 'Hora', `name="event_time" type="time" value="${esc(ed?.event_time || '18:00')}" required`)}
      ${field('pin', 'Lugar', `name="location" value="${esc(ed?.location || '')}" required`)}${field('users', 'Organizador', `name="organizer" value="${esc(ed?.organizer || '')}" required`)}
      <div class="field"><label>Imagen del póster (opcional, horizontal)</label><div class="input"><input type="file" name="img" accept="image/png,image/jpeg,image/webp"></div></div>
      <p class="muted small">Los precios se configuran por tipo de entrada en <a href="#/admin/ajustes">Ajustes</a>.</p>
      <button class="btn">${ed ? 'Guardar cambios' : 'Crear evento'}</button>${ed ? '<button type="button" class="btn ghost" id="cancel">Cancelar edición</button>' : ''}<div class="err" id="err" role="alert"></div></div></form></div>`;
  $$('[data-tg]', v).forEach((b) => b.onclick = async () => { await api(`/api/admin/events/${b.dataset.tg}/toggle`, { method: 'POST' }); pageAdminEvents(); });
  $$('[data-ed]', v).forEach((b) => b.onclick = () => { editingEvent = Number(b.dataset.ed); pageAdminEvents(); scrollTo(0, 0); });
  $$('[data-del]', v).forEach((b) => b.onclick = async () => { if (!confirm('¿Eliminar este evento? Solo es posible si no tiene solicitudes.')) return; try { await api(`/api/admin/events/${b.dataset.del}`, { method: 'DELETE' }); toast('Evento eliminado.', 'ok'); pageAdminEvents(); } catch (er) { toast(er.message, 'err'); } });
  $('#cancel')?.addEventListener('click', () => { editingEvent = null; pageAdminEvents(); });
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); $('#err').textContent = '';
    const fd = Object.fromEntries(new FormData(e.target)); const file = e.target.img.files[0]; delete fd.img;
    if (file) { if (file.size > 5e6) { $('#err').textContent = 'La imagen supera 5 MB.'; return; } fd.image_data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }); }
    try { await busy($('#f .btn'), () => api(ed ? `/api/admin/events/${ed.id}` : '/api/admin/events', { method: 'POST', body: fd })); toast(ed ? 'Evento actualizado.' : 'Evento creado.', 'ok'); editingEvent = null; pageAdminEvents(); } catch (er) { $('#err').textContent = er.message; }
  };
}

let compEvent = null;
async function pageAdminCompetitors() {
  const v = shell('#/admin/competidores', '<div class="empty">Cargando…</div>');
  const { events } = await api('/api/admin/events');
  if (!events.length) { v.innerHTML = '<h1>Competidores</h1><div class="card empty">Primero crea un evento.</div>'; return; }
  if (!events.some((e) => e.id === compEvent)) compEvent = events[0].id;
  const { competitors } = await api('/api/admin/competitors?event_id=' + compEvent);
  v.innerHTML = `<h1 class="mb">Competidores y códigos</h1>
    <div class="field" style="max-width:520px;margin-bottom:16px"><label>Evento</label><div class="input">${I.cal}<select id="ev">${events.map((e) => `<option value="${e.id}" ${e.id === compEvent ? 'selected' : ''}>${esc(e.title)} ${esc(e.subtitle || '')}</option>`).join('')}</select></div></div>
    <div class="cols cols-eq"><div class="list">${competitors.map((c) => `<div class="card order"><div><h3>${esc(c.name)} ${c.active ? '' : '<span class="badge b-cancelada">Oculto</span>'}</h3><div class="meta"><span>Código: <b class="amt" style="font-size:16px">${esc(c.code || '—')}</b></span><span>${c.supports} apoyo${c.supports === 1 ? '' : 's'}</span></div></div>
      <div class="acts"><button class="btn sm ghost" data-tg="${c.id}">${c.active ? 'Desactivar' : 'Activar'}</button><button class="btn sm danger" data-del="${c.id}">Eliminar</button></div></div>`).join('') || '<div class="card empty">Este evento aún no tiene competidores.</div>'}</div>
    <div><form class="card" id="f"><h2 class="mb">Agregar competidor</h2><div class="stack">${field('user', 'Nombre', 'name="name" required')}${field('id', 'Código único (letras y números, 3 a 12)', 'name="code" maxlength="12" style="text-transform:uppercase" required')}<button class="btn">Agregar</button></div></form>
    <form class="card" id="bf"><h2 class="mb">Carga masiva</h2><p class="muted small" style="margin-bottom:10px">Uno por línea: <b>Nombre | CÓDIGO</b></p><div class="field"><textarea name="bulk" rows="6" placeholder="Ciprianos | CIP001&#10;Perika | PER002"></textarea></div><button class="btn" style="margin-top:12px">Cargar lista</button><div class="err" id="err" role="alert"></div></form>
    <p class="muted small">Solo los códigos de esta lista se aceptan en “Apoyar a un competidor” (mayúsculas o minúsculas).</p></div></div>`;
  $('#ev').onchange = (e) => { compEvent = Number(e.target.value); pageAdminCompetitors(); };
  const post = async (body, btn) => { try { const r = await busy(btn, () => api('/api/admin/competitors', { method: 'POST', body: { event_id: compEvent, ...body } })); toast(`${r.added} agregado(s)${r.skipped ? `, ${r.skipped} omitido(s) (código repetido o inválido)` : ''}.`, 'ok'); pageAdminCompetitors(); } catch (er) { $('#err').textContent = er.message; toast(er.message, 'err'); } };
  $('#f').onsubmit = (e) => { e.preventDefault(); post(Object.fromEntries(new FormData(e.target)), $('#f .btn')); };
  $('#bf').onsubmit = (e) => { e.preventDefault(); post({ bulk: e.target.bulk.value }, $('#bf .btn')); };
  $$('[data-tg]', v).forEach((b) => b.onclick = async () => { await api(`/api/admin/competitors/${b.dataset.tg}/toggle`, { method: 'POST' }); pageAdminCompetitors(); });
  $$('[data-del]', v).forEach((b) => b.onclick = async () => { if (!confirm('¿Eliminar este competidor?')) return; try { await api(`/api/admin/competitors/${b.dataset.del}`, { method: 'DELETE' }); pageAdminCompetitors(); } catch (er) { toast(er.message, 'err'); } });
}

async function pageAdminUsers() {
  const v = shell('#/admin/usuarios', '<div class="empty">Cargando…</div>');
  const { users } = await api('/api/admin/users');
  v.innerHTML = `<div class="between mb"><h1>Usuarios</h1><button class="btn" id="new">+ Nuevo usuario</button></div>
    <div class="list">${users.map((u) => `<div class="card order"><div><h3>${esc(u.name)} <span class="badge role-${u.role}">${roleName(u.role)}</span> ${u.status === 'activo' ? '' : '<span class="badge b-cancelada">Suspendido</span>'} ${u.must_change ? '<span class="badge b-por_validar">Debe cambiar contraseña</span>' : ''}</h3>
      <div class="meta"><span class="brk">${esc(u.email)}</span>${u.phone ? `<span>${esc(u.phone)}</span>` : ''}<span>Creado ${fStamp(u.created_at)}</span></div></div>
      <div class="acts"><button class="btn sm ghost" data-ed="${u.id}">Editar</button><button class="btn sm ghost" data-rp="${u.id}">Restablecer contraseña</button></div></div>`).join('')}</div>`;
  const show = (title, temp) => modal({ title, body: `<p>Entrega esta contraseña temporal al usuario. <b>Solo se muestra ahora</b>; deberá cambiarla al ingresar.</p><div class="tempcode">${esc(temp)}</div><button class="btn full" id="cp">Copiar</button>` });
  $('#new').onclick = () => {
    const m = modal({ title: 'Nuevo usuario', body: `<form id="nf" class="stack">${field('user', 'Nombre completo', 'name="name" required')}${field('mail', 'Correo electrónico', 'name="email" type="email" autocapitalize="none" required')}${field('phone', 'Teléfono', 'name="phone" type="tel"', false)}
      ${selectField('lock', 'Rol', 'role', [['USER', 'Usuario'], ['TAQUILLA', 'Taquilla (solo escáner)'], ['PANEL', 'Taquilla (solo panel)'], ['ADMIN', 'Administrador']], 'USER')}${field('lock', 'Contraseña inicial (vacío = generar)', 'name="password" autocomplete="new-password"', false)}
      <button class="btn">Crear usuario</button><div class="err" id="nerr"></div></form>` });
    $('#nf', m.el).onsubmit = async (e) => { e.preventDefault(); try { const r = await api('/api/admin/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); m.close(); const s = show('Usuario creado', r.temp_password); $('#cp', s.el).onclick = () => { navigator.clipboard?.writeText(r.temp_password); toast('Copiado', 'ok'); }; s.el.addEventListener('click', () => {}); pageAdminUsers(); } catch (er) { $('#nerr', m.el).textContent = er.message; } };
  };
  $$('[data-ed]', v).forEach((b) => b.onclick = () => {
    const u = users.find((x) => String(x.id) === b.dataset.ed);
    const m = modal({ title: 'Editar usuario', body: `<form id="ef" class="stack"><p class="muted small brk">${esc(u.email)}</p>${field('user', 'Nombre', `name="name" value="${esc(u.name)}" required`)}
      ${selectField('lock', 'Rol', 'role', [['USER', 'Usuario'], ['TAQUILLA', 'Taquilla (solo escáner)'], ['PANEL', 'Taquilla (solo panel)'], ['ADMIN', 'Administrador']], u.role)}${selectField('lock', 'Estado', 'status', [['activo', 'Activo'], ['suspendido', 'Suspendido']], u.status)}
      <button class="btn">Guardar</button><div class="err" id="eerr"></div></form>` });
    $('#ef', m.el).onsubmit = async (e) => { e.preventDefault(); try { await api(`/api/admin/users/${u.id}`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); m.close(); toast('Usuario actualizado.', 'ok'); pageAdminUsers(); } catch (er) { $('#eerr', m.el).textContent = er.message; } };
  });
  $$('[data-rp]', v).forEach((b) => b.onclick = async () => {
    if (!confirm('¿Restablecer la contraseña de este usuario? Se cerrarán sus sesiones.')) return;
    try { const r = await api(`/api/admin/users/${b.dataset.rp}/reset-password`, { method: 'POST' }); const s = show('Contraseña restablecida', r.temp_password); $('#cp', s.el).onclick = () => { navigator.clipboard?.writeText(r.temp_password); toast('Copiado', 'ok'); }; pageAdminUsers(); } catch (er) { toast(er.message, 'err'); }
  });
}

let repEvent = null, repTab = 'resumen';
async function pageAdminReports() {
  const v = shell('#/admin/reportes', '<div class="empty">Cargando…</div>');
  const { events } = await api('/api/admin/events');
  if (!events.length) { v.innerHTML = '<h1>Reportes</h1><div class="card empty">Sin eventos.</div>'; return; }
  if (!events.some((e) => e.id === repEvent)) repEvent = events[0].id;
  const tabs = [['resumen', 'Ventas'], ['apoyos', 'Apoyos'], ['pedidos', 'Compras y pagos'], ['escaneos', 'Escaneos'], ['auditoria', 'Auditoría']];
  const head = `<h1 class="mb">Reportes</h1><div class="field" style="max-width:520px;margin-bottom:14px"><label>Evento</label><div class="input">${I.cal}<select id="ev">${events.map((e) => `<option value="${e.id}" ${e.id === repEvent ? 'selected' : ''}>${esc(e.title)} ${esc(e.subtitle || '')}</option>`).join('')}</select></div></div>
    <div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${repTab === k ? 'active' : ''}" data-tab="${k}">${t}</button>`).join('')}</div><div id="rep"><div class="empty">Cargando…</div></div>`;
  v.innerHTML = head;
  $('#ev').onchange = (e) => { repEvent = Number(e.target.value); pageAdminReports(); };
  $$('[data-tab]', v).forEach((b) => b.onclick = () => { repTab = b.dataset.tab; pageAdminReports(); });
  const box = $('#rep'); const tbl = (cols, rows) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td data-l="${esc(cols[i])}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  try {
    if (repTab === 'resumen' || repTab === 'apoyos') {
      const r = await api('/api/admin/reports?event_id=' + repEvent);
      if (repTab === 'resumen') {
        const t = r.totals;
        box.innerHTML = `<div class="stats"><div class="stat"><b>${t.sold}</b><span>Entradas vendidas (pagadas)</span></div><div class="stat"><b style="color:var(--yellow)">${t.pending}</b><span>Pendientes de pago</span></div><div class="stat"><b>${t.used}</b><span>Utilizadas</span></div><div class="stat"><b>${t.available}</b><span>Válidas sin usar</span></div><div class="stat"><b>${money(t.amount)}</b><span>Ingresos confirmados</span></div></div>
          <div class="card"><h2 class="mb">Por categoría</h2>${tbl(['Categoría', 'Vendidas', 'Pendientes', 'Utilizadas', 'Disponibles', 'Anuladas', 'Mesas', 'Ingresos'], r.by_type.map((x) => [`<b>${esc(x.name)}</b>`, x.sold, x.pending, x.used, x.available, x.voided, x.packages == null ? '—' : `${x.packages} (${x.issued} entradas emitidas)`, money(x.amount)]))}
          <p class="muted small" style="margin-top:8px">“Pendientes” son entradas de compras aún sin pago confirmado; no cuentan como venta.</p></div>
          <div class="card"><h2 class="mb">Pagos por método y estado</h2>${r.payments.length ? tbl(['Método', 'Estado', 'Compras', 'Monto'], r.payments.map((p) => [METHOD[p.m] || p.m, STATUS[p.s] || p.s, p.n, money(p.a)])) : '<p class="muted">Sin compras.</p>'}</div>`;
      } else {
        box.innerHTML = `<div class="card"><h2 class="mb">Apoyos por competidor (FIT = ganancia por entrada, solo con apoyo)</h2>${r.supports.length ? tbl(['Competidor', 'Código', 'Compras', 'Entradas pagadas', 'FIT pagado', 'Entradas pendientes', 'FIT pendiente'], r.supports.map((s) => [`<b>${esc(s.name)}</b>`, esc(s.code || '—'), s.orders, s.confirmed_tickets, `<b>${money(s.confirmed_fit)}</b>`, s.pending_tickets, money(s.pending_fit)])) : '<p class="muted">Este evento no tiene competidores.</p>'}</div>`;
      }
    } else if (repTab === 'pedidos') {
      const { orders } = await api(`/api/staff/orders?status=todas&event_id=${repEvent}`);
      box.innerHTML = `<div class="card"><h2 class="mb">Compras y pagos (últimas 200)</h2>${orders.length ? tbl(['Pedido', 'Comprador', 'Entradas', 'Total', 'Método', 'Estado', 'Referencia', 'Confirmó'], orders.map((o) => [`#${o.id}`, esc(o.full_name), `${o.units} × ${esc(o.type_name)}`, money(o.total), METHOD[o.payment_method], badge(o.status), esc(o.auth_number || '—'), esc(o.approved_by || '—')])) : '<p class="muted">Sin compras.</p>'}</div>`;
    } else if (repTab === 'escaneos') {
      const { scans } = await api(`/api/staff/scans?event_id=${repEvent}&limit=200`);
      box.innerHTML = `<div class="card"><h2 class="mb">Historial de escaneos</h2>${scans.length ? tbl(['Fecha y hora', 'Resultado', 'Boleto', 'Titular', 'Usuario'], scans.map((s) => [fStamp(s.at), `<span class="badge r-${s.result}">${RES_LABEL[s.result] || s.result}</span>`, s.number ? `#${s.number} · ${esc(s.type_name)}` : '—', esc(s.holder || '—'), esc(s.user || '—')])) : '<p class="muted">Sin escaneos.</p>'}</div>`;
    } else {
      const { entries } = await api('/api/admin/audit?limit=200');
      box.innerHTML = `<div class="card"><h2 class="mb">Historial de auditoría</h2>${tbl(['Fecha y hora', 'Usuario', 'Acción', 'Registro', 'Detalle'], entries.map((a) => [fStamp(a.created_at), esc(a.user_email || '—'), `<b>${esc(a.action)}</b>`, esc([a.entity, a.entity_id].filter(Boolean).join(' #')), `<span class="small muted brk">${esc(a.detail || '')}</span>`]))}</div>`;
    }
  } catch (er) { box.innerHTML = `<div class="card empty">${esc(er.message)}</div>`; }
}

async function pageAdminSettings() {
  const v = shell('#/admin/ajustes', '<div class="empty">Cargando…</div>');
  const { types, pay } = await api('/api/admin/settings');
  v.innerHTML = `<h1 class="mb">Ajustes</h1><form id="f"><div class="card"><h2 class="mb">Tipos de entrada, precios y FIT</h2><p class="muted small" style="margin-bottom:12px">El FIT solo se genera cuando el comprador apoya a un competidor. Los cambios aplican solo a compras nuevas; las existentes conservan su precio y su FIT.</p>
    <div class="list">${types.map((t) => `<div class="set-row" data-code="${t.code}"><div><b>${esc(t.name)}</b><span class="muted small">${t.per_unit > 1 ? `Mesa de ${t.per_unit} entradas` : '1 entrada'}</span></div>
      <div class="field"><label>Precio (Q)</label><div class="input"><input name="price" type="number" step="0.01" min="1" value="${t.price}" required></div></div>
      <div class="field"><label>FIT (Q)</label><div class="input"><input name="fit" type="number" step="0.01" min="0" value="${t.fit}" required></div></div>
      <div class="field"><label>Máx. por compra</label><div class="input"><input name="max" type="number" min="1" max="50" value="${t.max_units}" required></div></div>
      <label class="chk"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> Disponible</label></div>`).join('')}</div></div>
    <div class="card"><h2 class="mb">Métodos de pago</h2><label class="chk"><input type="checkbox" name="transferencia" ${pay.transferencia ? 'checked' : ''}> Transferencia bancaria</label><label class="chk"><input type="checkbox" name="deposito" ${pay.deposito ? 'checked' : ''}> Depósito a cuenta</label>
      <p class="muted small" style="margin-top:8px">El pago en efectivo ya no se acepta. Los datos de la cuenta se definen en el archivo .env (BANK_*) y el número para comprobantes en PROOF_PHONE.</p></div>
    <button class="btn" style="margin-top:16px">Guardar ajustes</button><div class="err" id="err" role="alert"></div></form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); $('#err').textContent = '';
    const body = { types: $$('.set-row', e.target).map((r) => ({ code: r.dataset.code, price: $('[name=price]', r).value, fit: $('[name=fit]', r).value, max_units: $('[name=max]', r).value, active: $('[name=active]', r).checked })), pay: { transferencia: e.target.transferencia.checked, deposito: e.target.deposito.checked } };
    try { await busy($('#f .btn'), () => api('/api/admin/settings', { method: 'POST', body })); toast('Ajustes guardados.', 'ok'); } catch (er) { $('#err').textContent = er.message; }
  };
}

/* ---------- Router ---------- */
async function route() {
  nav++; clearInterval(pollT);
  await stopScanner();
  const raw = location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  try {
    if (!S.user) {
      if (p === '/registro') return pageRegister();
      if (p === '/olvide') return pageForgot();
      if (p === '/reset') return pageReset(q);
      return pageLogin();
    }
    if (S.user.must_change) return pageForceChange();
    if (['/login', '/registro', '/verificar', '/olvide', '/reset', '/cambiar-contrasena'].includes(p)) return go(homeFor(S.user));
    const role = S.user.role;
    if (p === '/perfil') return pageProfile();
    if (role === 'ADMIN') {
      const A = { '/admin': pageStaffHome, '/admin/solicitudes': pageStaffOrders, '/admin/boletos': pageStaffTickets, '/admin/escaner': pageScanner, '/admin/eventos': pageAdminEvents, '/admin/competidores': pageAdminCompetitors, '/admin/usuarios': pageAdminUsers, '/admin/reportes': pageAdminReports, '/admin/ajustes': pageAdminSettings };
      return A[p] ? await A[p]() : go('#/admin');
    }
    if (role === 'TAQUILLA') return p === '/taquilla/escaner' ? await pageScanner() : go('#/taquilla/escaner'); // la taquilla solo escanea
    if (role === 'PANEL') return p === '/panel' ? await pagePanelOnly() : go('#/panel'); // solo ve vendidas / utilizadas
    let m;
    if (p === '/') return await pageHome(true);
    if (p === '/eventos') return await pageHome(false);
    if ((m = p.match(/^\/evento\/(\d+)$/))) return await pageEvent(m[1]);
    if ((m = p.match(/^\/pago\/(\d+)$/))) return await pagePay(m[1]);
    if (p === '/mis-solicitudes') return await pageMyOrders();
    go('#/');
  } catch (e) {
    if (e.stale) return; // el usuario ya navegó a otra pantalla
    if (e.status === 401) { S.user = null; return pageLogin(); }
    if (e.data?.mustChangePassword) { await boot(); return pageForceChange(); }
    const v = $('#view') || app; v.innerHTML = `<div class="card empty">${esc(e.message)}<br><br><a class="btn" href="#/">Volver al inicio</a></div>`;
  }
}
async function boot() {
  const { user } = await api('/api/me'); S.user = user;
  if (user && !user.must_change && user.role !== 'PANEL') S.cfg = await api('/api/config');
}
window.addEventListener('unhandledrejection', (ev) => { if (ev.reason?.stale) ev.preventDefault(); }); // respuestas de una pantalla ya abandonada: se ignoran
window.addEventListener('hashchange', route);
boot().then(route).catch(() => route());
