'use strict';
/* DOKAN Tickets & Eventos — servidor (versión Turso / libSQL)
 * Node >= 20. Dependencias: @libsql/client, sharp, qrcode, nodemailer (+ html5-qrcode para el escáner del navegador).
 * Base de datos: Turso si hay TURSO_DATABASE_URL; si no, archivo local data/dokan.db (desarrollo).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;

// ---------- .env ----------
(function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();
const env = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);

const CFG = {
  port: Number(env('PORT', '3000')),
  publicUrl: env('PUBLIC_URL', `http://localhost:${env('PORT', '3000')}`).replace(/\/+$/, ''),
  adminUser: env('ADMIN_USER', 'admin'),
  adminPass: env('ADMIN_PASS', 'Dokan123'),
  cc: env('DEFAULT_COUNTRY_CODE', '502'),
  bank: {
    name: env('BANK_NAME', 'Banco (configura BANK_NAME)'),
    type: env('BANK_ACCOUNT_TYPE', 'Monetaria'),
    account: env('BANK_ACCOUNT', '0000000-0'),
    holder: env('BANK_HOLDER', 'Nombre del titular'),
  },
  wa: env('WHATSAPP_PROVIDER', 'none').toLowerCase(),
  proofPhone: env('PROOF_PHONE', '35962132'), // número al que se envía el comprobante de pago por WhatsApp
};

const { renderTicket, fmtDMY, fmtTime } = require('./lib/ticket');
const { waMessage } = require('./lib/messages');
const roster = require('./lib/roster');
const { createDb } = require('./lib/db');

// ---------- Datos ----------
const DATA = env('DATA_DIR') ? path.resolve(env('DATA_DIR')) : path.join(ROOT, 'data');
const TICKETS_DIR = path.join(DATA, 'tickets');
fs.mkdirSync(TICKETS_DIR, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'public', 'uploads'), { recursive: true });

const REMOTE = !!env('TURSO_DATABASE_URL');
const db = createDb(REMOTE
  ? { url: env('TURSO_DATABASE_URL'), authToken: env('TURSO_AUTH_TOKEN') }
  : { url: 'file:' + path.join(DATA, 'dokan.db') });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', verified INTEGER NOT NULL DEFAULT 0,
  code_hash TEXT, code_expires INTEGER, code_attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, subtitle TEXT, event_date TEXT NOT NULL, event_time TEXT NOT NULL,
  location TEXT NOT NULL, organizer TEXT NOT NULL, price REAL NOT NULL, poster TEXT, active INTEGER NOT NULL DEFAULT 1,
  next_number INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, event_id INTEGER NOT NULL,
  full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, dpi TEXT NOT NULL, birth TEXT NOT NULL,
  qty INTEGER NOT NULL, total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'solicitada',
  auth_number TEXT, reject_reason TEXT, email_status TEXT, wa_status TEXT, wa_link TEXT,
  created_at INTEGER NOT NULL, paid_at INTEGER, decided_at INTEGER);
CREATE TABLE IF NOT EXISTS tickets(
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, event_id INTEGER NOT NULL, number INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE, holder_name TEXT NOT NULL, holder_birth TEXT NOT NULL, holder_dpi TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0, used_at INTEGER, created_at INTEGER NOT NULL);
`;

const now = () => Date.now();

// ---------- Migraciones (idempotentes: se pueden ejecutar en cada arranque sin perder datos) ----------
const colExists = async (t, c) => (await db.prepare(`PRAGMA table_info(${t})`).all()).some((x) => x.name === c);
const addCol = async (t, c, def) => { if (!(await colExists(t, c))) await db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
async function seedRoster(eventId) {
  for (const c of roster) {
    const byCode = await db.prepare('SELECT id FROM competitors WHERE event_id = ? AND code = ? COLLATE NOCASE').get(eventId, c.code);
    if (byCode) { await db.prepare('UPDATE competitors SET name = ? WHERE id = ?').run(c.name, byCode.id); continue; }
    const byName = await db.prepare('SELECT id FROM competitors WHERE event_id = ? AND name = ? COLLATE NOCASE AND code IS NULL').get(eventId, c.name);
    if (byName) await db.prepare('UPDATE competitors SET code = ? WHERE id = ?').run(c.code, byName.id);
    else await db.prepare('INSERT INTO competitors(event_id,name,code,created_at) VALUES(?,?,?,?)').run(eventId, c.name, c.code, now());
  }
}
async function migrate() {
  if (!REMOTE) await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await db.exec(SCHEMA);

  // Usuarios: roles ADMIN / USER / TAQUILLA / PANEL, estado de cuenta, cambio de contraseña obligatorio, recuperación
  await addCol('users', 'status', "TEXT NOT NULL DEFAULT 'activo'");
  await addCol('users', 'must_change', 'INTEGER NOT NULL DEFAULT 0');
  await addCol('users', 'reset_hash', 'TEXT');
  await addCol('users', 'reset_expires', 'INTEGER');
  await db.exec(`UPDATE users SET role='ADMIN' WHERE role='admin'; UPDATE users SET role='USER' WHERE role='user';
           UPDATE users SET verified=1 WHERE verified=0;`); // la verificación por correo ya no se exige

  await db.exec(`
  CREATE TABLE IF NOT EXISTS ticket_types(
    code TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, per_unit INTEGER NOT NULL DEFAULT 1,
    max_units INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS competitors(
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER NOT NULL, name TEXT NOT NULL, academy TEXT,
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS ux_competitor_event_name ON competitors(event_id, name COLLATE NOCASE);
  CREATE TABLE IF NOT EXISTS supports(
    id INTEGER PRIMARY KEY AUTOINCREMENT, competitor_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL UNIQUE, event_id INTEGER NOT NULL, tickets_count INTEGER NOT NULL, amount REAL NOT NULL,
    created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS scans(
    id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER, event_id INTEGER, user_id INTEGER NOT NULL,
    result TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_log(
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_email TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT,
    detail TEXT, ip TEXT, created_at INTEGER NOT NULL);
  `);

  // Pedidos: tipo de entrada, unidades, método de pago, titulares y quién confirmó el pago
  await addCol('orders', 'ticket_type', "TEXT NOT NULL DEFAULT 'GENERAL'");
  await addCol('orders', 'units', 'INTEGER');
  await addCol('orders', 'unit_price', 'REAL');
  await addCol('orders', 'payment_method', "TEXT NOT NULL DEFAULT 'transferencia'");
  await addCol('orders', 'holders_json', 'TEXT');
  await addCol('orders', 'approved_by', 'INTEGER');
  await addCol('orders', 'confirmed_at', 'INTEGER');
  await db.exec(`UPDATE orders SET units=qty WHERE units IS NULL;
           UPDATE orders SET unit_price = CASE WHEN qty>0 THEN total*1.0/qty ELSE 0 END WHERE unit_price IS NULL;`);

  // Entradas: tipo, precio asignado, estado, posición dentro del paquete, quién ingresó / anuló
  await addCol('tickets', 'ticket_type', "TEXT NOT NULL DEFAULT 'GENERAL'");
  await addCol('tickets', 'price', 'REAL');
  await addCol('tickets', 'status', "TEXT NOT NULL DEFAULT 'valida'");
  await addCol('tickets', 'pkg_seq', 'INTEGER NOT NULL DEFAULT 1');
  await addCol('tickets', 'pkg_size', 'INTEGER NOT NULL DEFAULT 1');
  await addCol('tickets', 'used_by', 'INTEGER');
  await addCol('tickets', 'voided_by', 'INTEGER');
  await addCol('tickets', 'voided_at', 'INTEGER');
  await addCol('tickets', 'void_reason', 'TEXT');
  await db.exec(`UPDATE tickets SET status='utilizada' WHERE used=1 AND status='valida';
           UPDATE tickets SET price=(SELECT CASE WHEN o.qty>0 THEN o.total*1.0/o.qty ELSE 0 END FROM orders o WHERE o.id=tickets.order_id) WHERE price IS NULL;
           CREATE INDEX IF NOT EXISTS ix_tickets_order ON tickets(order_id);
           CREATE INDEX IF NOT EXISTS ix_tickets_event ON tickets(event_id, status);
           CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status, event_id);
           CREATE INDEX IF NOT EXISTS ix_scans_created ON scans(created_at);
           CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_log(created_at);`);

  // Catálogo (INSERT OR IGNORE: nunca pisa precios que el administrador ya haya cambiado)
  const ins = db.prepare('INSERT OR IGNORE INTO ticket_types(code,name,price,per_unit,max_units,sort) VALUES(?,?,?,?,?,?)');
  await ins.run('GENERAL', 'General', 125, 1, 10, 1);
  await ins.run('VIP', 'Sillas VIP', 175, 1, 10, 2);
  await ins.run('RINGSIDE', 'RINGSIDE', 900, 5, 2, 3);
  const set = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  await set.run('pay_transferencia', '1'); await set.run('pay_deposito', '1');
  // Efectivo ya no se acepta
  await db.prepare("INSERT INTO settings(key,value) VALUES('pay_efectivo','0') ON CONFLICT(key) DO UPDATE SET value='0'").run();

  // Competidores con código único; FIT por tipo de entrada (solo aplica cuando se apoya a un competidor)
  await addCol('competitors', 'code', 'TEXT');
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_comp_code ON competitors(event_id, code COLLATE NOCASE)');
  await addCol('ticket_types', 'fit', 'REAL NOT NULL DEFAULT 0');
  await addCol('supports', 'fit_amount', 'REAL NOT NULL DEFAULT 0');
  if (!(await db.prepare("SELECT 1 FROM settings WHERE key='fit_seeded'").get())) {
    await db.exec("UPDATE ticket_types SET fit=25 WHERE code='GENERAL'; UPDATE ticket_types SET fit=45 WHERE code='VIP'; UPDATE ticket_types SET fit=200 WHERE code='RINGSIDE'; INSERT INTO settings(key,value) VALUES('fit_seeded','1');");
  }
  await db.exec("UPDATE ticket_types SET name='Mesa 5 personas' WHERE code='RINGSIDE' AND name='RINGSIDE'");
  for (const e of await db.prepare('SELECT id FROM events').all()) await seedRoster(e.id);
}

const rand = (n) => crypto.randomBytes(n).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw) => { const salt = rand(16); return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`; };
const checkPw = (pw, stored) => {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const x = crypto.scryptSync(pw, salt, 64);
  const y = Buffer.from(h, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const ROLES = ['ADMIN', 'USER', 'TAQUILLA', 'PANEL'];

async function audit(user, action, entity, entityId, detail, ip) {
  try {
    await db.prepare('INSERT INTO audit_log(user_id,user_email,action,entity,entity_id,detail,ip,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(user?.id ?? null, user?.email ?? null, action, entity ?? null, entityId != null ? String(entityId) : null,
        detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1000) : null, ip ?? null, now());
  } catch (e) { console.error('[auditoría]', e.message); }
}

// ---------- Semillas ----------
// Las credenciales NO están en el código: se leen del .env (SEED_*). Solo se crean si la cuenta no existe;
// nunca se restablece la contraseña de una cuenta existente.
async function seedUsers() {
  const defs = [
    ['ADMIN', 'Administrador', 1], ['USER', 'Usuario Giancarlo', 0], ['TAQUILLA', 'Taquilla', 1], ['PANEL', 'Taquilla (panel)', 1],
  ];
  for (const [role, defName, mustChange] of defs) {
    const email = env(`SEED_${role}_EMAIL`).toLowerCase(), pw = env(`SEED_${role}_PASSWORD`);
    if (!email || !pw) continue;
    if (await db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) continue;
    await db.prepare('INSERT INTO users(name,email,phone,password_hash,role,verified,must_change,created_at) VALUES(?,?,?,?,?,1,?,?)')
      .run(env(`SEED_${role}_NAME`, defName), email, '', hashPw(pw), role, env('SEED_FORCE_PW_CHANGE', '1') === '0' ? 0 : mustChange, now());
    console.log(`[seed] Cuenta ${role} creada: ${email}`);
  }
  // Compatibilidad: administrador heredado solo si no existe ningún ADMIN y no se configuró SEED_ADMIN_*
  if (!(await db.prepare("SELECT 1 FROM users WHERE role = 'ADMIN'").get())) {
    await db.prepare("INSERT INTO users(name,email,phone,password_hash,role,verified,created_at) VALUES(?,?,?,?,'ADMIN',1,?)")
      .run('Administrador', CFG.adminUser.toLowerCase(), '', hashPw(CFG.adminPass), now());
    console.log(`[seed] Usuario admin creado: ${CFG.adminUser}`);
  }
  if (!(await db.prepare('SELECT 1 FROM events').get())) {
    await db.prepare('INSERT INTO events(title,subtitle,event_date,event_time,location,organizer,price,poster) VALUES(?,?,?,?,?,?,?,?)')
      .run('Amateur Fight League', 'Sexta Edición', '2026-11-28', '18:00', 'Antigua Guatemala', 'Sensei Raul Mazariegos', 125, '/img/poster.jpg');
    console.log('[seed] Evento de ejemplo creado');
  }
  // Todos los eventos tienen su lista de competidores con códigos (idempotente)
  for (const e of await db.prepare('SELECT id FROM events').all()) await seedRoster(e.id);
}

// ---------- Correo ----------
let mailer = null;
function getMailer() {
  if (mailer !== null) return mailer;
  if (!env('SMTP_HOST')) return (mailer = false);
  try {
    const nodemailer = require('nodemailer');
    const port = Number(env('SMTP_PORT', '465'));
    mailer = nodemailer.createTransport({
      host: env('SMTP_HOST'), port, secure: port === 465,
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
    });
  } catch (e) { console.error('[correo] nodemailer no disponible:', e.message); mailer = false; }
  return mailer;
}
async function sendMail({ to, subject, text, html, attachments }) {
  const m = getMailer();
  if (!m) {
    const line = `[correo simulado] Para: ${to} | Asunto: ${subject}\n${text}\n${(attachments || []).map((a) => `  adjunto: ${a.filename}`).join('\n')}\n---\n`;
    console.log(line);
    try { fs.appendFileSync(path.join(DATA, 'outbox.log'), `${new Date().toISOString()} ${line}`); } catch { /* disco de solo lectura */ }
    return { ok: true, simulated: true };
  }
  try {
    await m.sendMail({ from: env('SMTP_FROM', env('SMTP_USER')), to, subject, text, html, attachments });
    return { ok: true };
  } catch (e) { console.error('[correo] error:', e.message); return { ok: false, error: e.message }; }
}

// ---------- WhatsApp ----------
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 8) d = CFG.cc + d;
  return d;
}
// Con proveedor twilio/meta el mensaje + imagen se envían desde el servidor. Con "none" NO se envía nada:
// solo se devuelve un enlace wa.me para que una persona lo abra y lo envíe (mode 'manual').
async function sendWhatsApp(phone, text, mediaUrl) {
  const to = normPhone(phone);
  const link = `https://wa.me/${to}?text=${encodeURIComponent(`${text}${mediaUrl ? `\n${mediaUrl}` : ''}`)}`;
  try {
    if (CFG.wa === 'twilio' && env('TWILIO_SID')) {
      const body = new URLSearchParams({ To: `whatsapp:+${to}`, From: env('TWILIO_FROM'), Body: text });
      if (mediaUrl) body.append('MediaUrl', mediaUrl);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env('TWILIO_SID')}/Messages.json`, {
        method: 'POST', body,
        headers: { Authorization: 'Basic ' + Buffer.from(`${env('TWILIO_SID')}:${env('TWILIO_TOKEN')}`).toString('base64') },
      });
      if (!r.ok) throw new Error(`Twilio ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return { ok: true, mode: 'twilio', link };
    }
    if (CFG.wa === 'meta' && env('META_TOKEN')) {
      const payload = mediaUrl
        ? { messaging_product: 'whatsapp', to, type: 'image', image: { link: mediaUrl, caption: text } }
        : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
      const r = await fetch(`https://graph.facebook.com/v20.0/${env('META_PHONE_ID')}/messages`, {
        method: 'POST', body: JSON.stringify(payload),
        headers: { Authorization: `Bearer ${env('META_TOKEN')}`, 'Content-Type': 'application/json' },
      });
      if (!r.ok) throw new Error(`Meta ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return { ok: true, mode: 'meta', link };
    }
  } catch (e) { console.error('[whatsapp] error:', e.message); return { ok: false, mode: CFG.wa, error: e.message, link }; }
  return { ok: true, mode: 'manual', link };
}

// ---------- Utilidades HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()', 'X-Frame-Options': 'SAMEORIGIN',
};
const send = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS });
  res.end(body);
};
class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const bad = (msg, extra) => new HttpError(400, msg, extra);

function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Solicitud demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(bad('JSON inválido')); }
    });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
async function setSession(res, userId) {
  const token = rand(32);
  await db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(token, userId, now() + 7 * 864e5);
  const secure = CFG.publicUrl.startsWith('https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 86400}${secure}`);
}
async function getUser(req) {
  const t = parseCookies(req).sid;
  if (!t) return null;
  // Una sola consulta: sesión + usuario
  const u = await db.prepare(`SELECT u.id,u.name,u.email,u.phone,u.role,u.status,u.must_change, s.expires
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(t);
  if (!u || u.expires < now() || u.status !== 'activo') return null;
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, must_change: !!u.must_change };
}
// Límite simple de intentos por clave
const hits = new Map();
function throttle(key, max, windowMs) {
  const t = now(); const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) throw new HttpError(429, 'Demasiados intentos, espera unos minutos.');
  arr.push(t); hits.set(key, arr);
}

// ---------- Validaciones ----------
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 120;
const cleanStr = (s, max = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 1920 && d.getTime() < Date.now();
}
function isAdult(birth) {
  const [y, m, d] = birth.split('-').map(Number), t = new Date();
  let age = t.getFullYear() - y;
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) age--;
  return age >= 18;
}
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const strongPw = (pw) => pw.length >= 8 && pw.length <= 100 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
const PW_MSG = 'La contraseña debe tener 8+ caracteres con letras y números.';

// ---------- Catálogo y ajustes (en memoria; se recarga cada pocos segundos y al guardar ajustes) ----------
let TYPES = [], PAY = { transferencia: true, deposito: true }, cacheAt = 0;
async function refreshCatalog() {
  TYPES = await db.prepare('SELECT * FROM ticket_types ORDER BY sort').all();
  const rows = await db.prepare("SELECT key, value FROM settings WHERE key IN ('pay_transferencia','pay_deposito')").all();
  const g = (k) => rows.find((r) => r.key === k)?.value === '1';
  PAY = { transferencia: g('pay_transferencia'), deposito: g('pay_deposito') };
  cacheAt = now();
}
const ticketTypes = () => TYPES;
const typeOf = (code) => TYPES.find((t) => t.code === String(code || ''));
const typeName = (code) => typeOf(code)?.name || code;
const payMethods = () => PAY;
const PENDING = ['solicitada', 'por_validar', 'pendiente_efectivo'];
const parseHolders = (json) => { try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a.map((x) => cleanStr(x, 80)) : []; } catch { return []; } };

// ---------- Emisión de boletos ----------
const ticketFile = (code) => path.join(TICKETS_DIR, `${code}.png`);
const ticketNumber = (n) => String(n).padStart(3, '0');

async function renderTicketRow(t, ev) {
  const png = await renderTicket({
    number: ticketNumber(t.number), name: t.holder_name, birth: t.holder_birth, dpi: t.holder_dpi, code: t.code, event: ev,
    typeLabel: typeName(t.ticket_type), seqLabel: t.pkg_size > 1 ? `${t.pkg_seq}/${t.pkg_size}` : '',
    // Un boleto usado o anulado pierde su QR: la imagen se reemplaza por un sello (el código sigue en la BD para mostrar el resumen)
    stamp: t.status === 'utilizada' ? { label: 'UTILIZADO', sub: new Date(t.used_at || Date.now()).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) }
      : t.status === 'cancelada' || t.status === 'reembolsada' ? { label: t.status === 'reembolsada' ? 'REEMBOLSADO' : 'ANULADO', sub: '' } : null,
  }, ROOT);
  fs.writeFileSync(ticketFile(t.code), png);
}
const waTextFor = (t, ev, holderName) => waMessage({
  holderName: holderName || t.holder_name, event: ev,
  tickets: [{ number: t.number, typeName: typeName(t.ticket_type), seq: t.pkg_seq, pkgSize: t.pkg_size }],
});

// Confirma el pago (transferencia validada) y emite los boletos. Es el ÚNICO punto donde
// una compra pasa a "pagada": mientras tanto no existe ningún boleto escaneable.
async function approveOrder(orderId, approver, ip) {
  const o = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!o) throw new HttpError(404, 'Solicitud no encontrada');
  if (!['por_validar', 'pendiente_efectivo'].includes(o.status)) throw bad('Solo se pueden autorizar solicitudes con pago por confirmar.');
  const prev = o.status;
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(o.event_id);
  const per = Math.max(1, Math.round(o.qty / (o.units || o.qty)));
  const holders = parseHolders(o.holders_json);
  const each = round2(o.total / o.qty);

  const created = [];
  await db.tx(async (tx) => {
    const cur = await tx.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
    if (cur.status !== prev) throw bad('La solicitud ya fue procesada.');
    for (let i = 0; i < o.qty; i++) {
      const fresh = await tx.prepare('SELECT next_number FROM events WHERE id = ?').get(ev.id);
      await tx.prepare('UPDATE events SET next_number = next_number + 1 WHERE id = ?').run(ev.id);
      const code = rand(16); // 128 bits impredecibles; el QR contiene solo este código
      const own = holders[i] && holders[i].toLowerCase() !== o.full_name.toLowerCase() ? holders[i] : null;
      const price = i === o.qty - 1 ? round2(o.total - each * (o.qty - 1)) : each;
      await tx.prepare(`INSERT INTO tickets(order_id,event_id,number,code,holder_name,holder_birth,holder_dpi,created_at,ticket_type,price,status,pkg_seq,pkg_size)
                  VALUES(?,?,?,?,?,?,?,?,?,?,'valida',?,?)`)
        .run(o.id, ev.id, fresh.next_number, code, own || o.full_name, own ? '' : o.birth, own ? '' : o.dpi, now(), o.ticket_type, price, (i % per) + 1, per);
      created.push({ number: fresh.next_number, code, ticket_type: o.ticket_type, status: 'valida', pkg_seq: (i % per) + 1, pkg_size: per, holder_name: own || o.full_name, holder_birth: own ? '' : o.birth, holder_dpi: own ? '' : o.dpi });
    }
    await tx.prepare("UPDATE orders SET status='aprobada', decided_at=?, confirmed_at=?, approved_by=? WHERE id=?").run(now(), now(), approver.id, o.id);
  });

  // Imágenes (si falla, se revierte todo para no dejar boletos sin imagen)
  const files = [];
  try {
    for (const t of created) {
      await renderTicketRow(t, ev);
      files.push({ filename: `Boleto-${ticketNumber(t.number)}-DOKAN.png`, path: ticketFile(t.code), code: t.code, number: t.number, row: t });
    }
  } catch (e) {
    console.error('[boleto] error generando imagen:', e);
    await db.tx(async (tx) => {
      await tx.prepare('DELETE FROM tickets WHERE order_id = ?').run(o.id);
      await tx.prepare('UPDATE orders SET status=?, decided_at=NULL, confirmed_at=NULL, approved_by=NULL WHERE id=?').run(prev, o.id);
      await tx.prepare('UPDATE events SET next_number = next_number - ? WHERE id = ? AND next_number = ?').run(o.qty, ev.id, created[created.length - 1].number + 1);
    });
    throw new HttpError(500, 'No se pudo generar el boleto: ' + e.message);
  }
  await audit(approver, o.payment_method === 'efectivo' ? 'pago_efectivo_confirmado' : 'pago_transferencia_autorizado', 'order', o.id,
    { total: o.total, tickets: created.map((t) => ticketNumber(t.number)), referencia: o.auth_number || null }, ip);

  // Correo
  const list = files.map((f) => `#${ticketNumber(f.number)}`).join(', ');
  const mail = await sendMail({
    to: o.email,
    subject: `Tus boletos para ${ev.title} ${ev.subtitle || ''} ✔`.trim(),
    text: `Hola ${o.full_name},\n\nTu pago fue confirmado. Adjuntamos tu${files.length > 1 ? 's' : ''} boleto${files.length > 1 ? 's' : ''} (${list}) para ${ev.title}.\nFecha: ${fmtDMY(ev.event_date)} ${fmtTime(ev.event_time)}\nLugar: ${ev.location}\n\nPresenta el código QR en la entrada.\n— DOKAN Tickets & Eventos`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>¡Pago confirmado!</h2><p>Hola <b>${o.full_name.replace(/[<>&]/g, '')}</b>, tu pago fue confirmado. Tus boletos (${list}) van adjuntos.</p>
      <p><b>${ev.title}</b> ${ev.subtitle || ''}<br>${fmtDMY(ev.event_date)} · ${fmtTime(ev.event_time)}<br>${ev.location}</p><p>Presenta el código QR en la entrada.</p></div>`,
    attachments: files.map((f) => ({ filename: f.filename, path: f.path })),
  });

  // WhatsApp automático (solo con proveedor configurado). Con "none" no se envía nada: queda "pendiente de envío manual".
  const waResults = [];
  for (const f of files) waResults.push(await sendWhatsApp(o.phone, waTextFor(f.row, ev, o.full_name), `${CFG.publicUrl}/t/${f.code}.png`));
  const waOk = waResults.every((r) => r.ok);
  const waMode = waResults[0]?.mode || 'manual';
  await db.prepare('UPDATE orders SET email_status=?, wa_status=?, wa_link=? WHERE id=?').run(
    mail.ok ? (mail.simulated ? 'simulado' : 'enviado') : `error: ${mail.error}`,
    waOk ? (waMode === 'manual' ? 'manual' : 'enviado') : `error: ${waResults.find((r) => !r.ok)?.error}`,
    waResults[0]?.link || null, o.id);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
}

// ---------- Presentación ----------
function minPrice() { const a = TYPES.filter((t) => t.active).map((t) => t.price); return a.length ? Math.min(...a) : 0; }
function publicEvent(e) {
  return { id: e.id, title: e.title, subtitle: e.subtitle, event_date: e.event_date, event_time: e.event_time, location: e.location, organizer: e.organizer, price: e.price, from_price: minPrice(), poster: e.poster, active: !!e.active };
}
function ticketView(t, ev) {
  return {
    id: t.id, number: ticketNumber(t.number), url: `/t/${t.code}.png`, status: t.status, type: t.ticket_type, type_name: typeName(t.ticket_type),
    seq: t.pkg_seq, pkg_size: t.pkg_size, holder: t.holder_name, used_at: t.used_at, price: t.price,
    wa_text: waTextFor(t, ev),
  };
}
async function orderView(o, { staff = false, role = 'USER' } = {}) {
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(o.event_id);
  const rows = await db.prepare('SELECT * FROM tickets WHERE order_id = ? ORDER BY number').all(o.id);
  const holders = parseHolders(o.holders_json);
  const per = Math.max(1, Math.round(o.qty / (o.units || o.qty)));
  const sup = await db.prepare('SELECT c.id, c.name, c.academy FROM supports s JOIN competitors c ON c.id = s.competitor_id WHERE s.order_id = ?').get(o.id);
  const valid = rows.filter((t) => t.status === 'valida' || t.status === 'utilizada');
  const v = {
    id: o.id, event: ev ? publicEvent(ev) : null, full_name: o.full_name, email: o.email, phone: o.phone,
    dpi: role === 'TAQUILLA' ? null : o.dpi, birth: role === 'TAQUILLA' ? null : o.birth,
    ticket_type: o.ticket_type, type_name: typeName(o.ticket_type), units: o.units || o.qty, per_unit: per, unit_price: o.unit_price,
    qty: o.qty, total: o.total, status: o.status, payment_method: o.payment_method, auth_number: o.auth_number,
    reject_reason: o.reject_reason, created_at: o.created_at, paid_at: o.paid_at, confirmed_at: o.confirmed_at,
    competitor: sup || null, holders: Array.from({ length: o.qty }, (_, i) => holders[i] || ''),
    tickets: rows.map((t) => ticketView(t, ev)),
    // Entradas todavía NO emitidas: se muestran como "pendiente de pago" y no tienen QR
    pending_tickets: o.status === 'aprobada' ? [] : PENDING.includes(o.status)
      ? Array.from({ length: o.qty }, (_, i) => ({ index: i + 1, type_name: typeName(o.ticket_type), seq: (i % per) + 1, pkg_size: per, holder: holders[i] || o.full_name, status: 'pendiente_pago' })) : [],
    wa_text_all: valid.length > 1 ? waMessage({ holderName: o.full_name, event: ev, tickets: valid.map((t) => ({ number: t.number, typeName: typeName(t.ticket_type), seq: t.pkg_seq, pkgSize: t.pkg_size })) }) : null,
  };
  if (staff) {
    v.account_email = role === 'TAQUILLA' ? null : (await db.prepare('SELECT email FROM users WHERE id = ?').get(o.user_id))?.email;
    v.email_status = o.email_status; v.wa_status = o.wa_status; v.wa_phone = normPhone(o.phone);
    v.approved_by = o.approved_by ? (await db.prepare('SELECT name FROM users WHERE id = ?').get(o.approved_by))?.name : null;
  }
  return v;
}

// ---------- Rutas ----------
const routes = [];
const route = (method, pattern, opts, handler) => {
  if (typeof opts === 'function') { handler = opts; opts = {}; }
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, opts, handler });
};
// Quién puede qué (cambia una línea para ajustar): TAQUILLA solo escanea; los pagos y la búsqueda de boletos son de ADMIN.
const SCAN = ['ADMIN', 'TAQUILLA'], PAY_ROLES = ['ADMIN'];
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const DUMMY_HASH = hashPw(rand(8)); // iguala el tiempo de respuesta cuando el usuario no existe

// ----- Sesión -----
route('GET', '/api/me', { allowMustChange: true }, (c) => ({ user: c.user }));
route('GET', '/api/config', { auth: true }, (c) => ({
  // Los datos bancarios solo se entregan a compradores con sesión iniciada
  bank: c.user.role === 'USER' ? CFG.bank : null,
  waMode: CFG.wa,
  ticketTypes: ticketTypes().filter((t) => t.active).map((t) => ({ code: t.code, name: t.name, price: t.price, per_unit: t.per_unit, max_units: t.max_units, fit: t.fit })),
  pay: payMethods(),
  proof: { phone: CFG.proofPhone, wa: normPhone(CFG.proofPhone) },
}));
route('POST', '/api/logout', { allowMustChange: true }, async (c) => {
  const t = parseCookies(c.req).sid;
  if (t) await db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
  c.res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  return { ok: true };
});

// Registro: sin verificación por correo. El rol SIEMPRE es USER (se ignora cualquier "role" enviado).
route('POST', '/api/register', async (c) => {
  throttle(`reg:${c.ip}`, 10, 15 * 60e3);
  const name = cleanStr(c.body.name, 80), email = cleanStr(c.body.email).toLowerCase(), phone = normPhone(c.body.phone), pw = String(c.body.password || '');
  if (name.length < 3) throw bad('Escribe tu nombre completo.');
  if (!isEmail(email)) throw bad('Correo electrónico inválido.');
  if (phone.length < 10 || phone.length > 15) throw bad('Teléfono inválido (ej. 5555-5555).');
  if (!strongPw(pw)) throw bad(PW_MSG);
  if (await db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Ya existe una cuenta con ese correo. Inicia sesión.');
  let id;
  try {
    id = Number((await db.prepare("INSERT INTO users(name,email,phone,password_hash,role,verified,created_at) VALUES(?,?,?,?,'USER',1,?)").run(name, email, phone, hashPw(pw), now())).lastInsertRowid);
  } catch { throw new HttpError(409, 'Ya existe una cuenta con ese correo. Inicia sesión.'); }
  await setSession(c.res, id);
  await audit({ id, email }, 'registro', 'user', id, null, c.ip);
  return { ok: true, role: 'USER' };
});

route('POST', '/api/login', async (c) => {
  const id = cleanStr(c.body.email).toLowerCase(), pw = String(c.body.password || '');
  throttle(`login:${c.ip}`, 20, 10 * 60e3);
  throttle(`login-acc:${id}`, 10, 10 * 60e3);
  const u = await db.prepare('SELECT * FROM users WHERE email = ?').get(id);
  const okPw = checkPw(pw, u ? u.password_hash : DUMMY_HASH);
  if (!u || !okPw) { await audit(null, 'login_fallido', 'user', null, null, c.ip); throw new HttpError(401, 'Usuario o contraseña incorrectos.'); }
  if (u.status !== 'activo') throw new HttpError(403, 'Tu cuenta está suspendida. Contacta al administrador.');
  await setSession(c.res, u.id);
  await audit(u, 'login', 'user', u.id, null, c.ip);
  return { ok: true, role: u.role, mustChange: !!u.must_change };
});

// Recuperación de contraseña por enlace con vencimiento (1 h). Responde igual exista o no el correo.
route('POST', '/api/forgot', async (c) => {
  const email = cleanStr(c.body.email).toLowerCase();
  throttle(`forgot:${c.ip}`, 8, 15 * 60e3); throttle(`forgot-acc:${email}`, 3, 15 * 60e3);
  const u = await db.prepare("SELECT * FROM users WHERE email = ? AND status = 'activo'").get(email);
  if (u && isEmail(u.email)) {
    const token = rand(32);
    await db.prepare('UPDATE users SET reset_hash=?, reset_expires=? WHERE id=?').run(sha(token), now() + 3600e3, u.id);
    const link = `${CFG.publicUrl}/#/reset?email=${encodeURIComponent(u.email)}&token=${token}`;
    sendMail({
      to: u.email, subject: 'Restablece tu contraseña de DOKAN Tickets',
      text: `Hola ${u.name},\n\nPara crear una contraseña nueva abre este enlace (vence en 1 hora):\n${link}\n\nSi no lo solicitaste, ignora este mensaje.\n— DOKAN Tickets & Eventos`,
    }).catch((e) => console.error('[correo] recuperación:', e.message));
    await audit(u, 'recuperacion_solicitada', 'user', u.id, null, c.ip);
  }
  return { ok: true };
});
route('POST', '/api/reset', async (c) => {
  throttle(`reset:${c.ip}`, 10, 15 * 60e3);
  const email = cleanStr(c.body.email).toLowerCase(), token = String(c.body.token || ''), pw = String(c.body.password || '');
  const u = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !u.reset_hash || u.reset_expires < now() || !safeEq(sha(token), u.reset_hash)) throw bad('El enlace no es válido o ya venció. Solicita uno nuevo.');
  if (!strongPw(pw)) throw bad(PW_MSG);
  await db.prepare('UPDATE users SET password_hash=?, reset_hash=NULL, reset_expires=NULL, must_change=0 WHERE id=?').run(hashPw(pw), u.id);
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  await audit(u, 'contrasena_restablecida', 'user', u.id, null, c.ip);
  return { ok: true };
});

route('POST', '/api/password', { auth: true, allowMustChange: true }, async (c) => {
  const cur = String(c.body.current || ''), nw = String(c.body.password || '');
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').get(c.user.id);
  if (!checkPw(cur, u.password_hash)) throw bad('La contraseña actual no es correcta.');
  if (!strongPw(nw)) throw bad('La nueva contraseña debe tener 8+ caracteres con letras y números.');
  if (nw === cur) throw bad('La nueva contraseña debe ser distinta de la actual.');
  await db.prepare('UPDATE users SET password_hash=?, must_change=0 WHERE id=?').run(hashPw(nw), u.id);
  await db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, parseCookies(c.req).sid || '');
  await audit(c.user, 'contrasena_cambiada', 'user', u.id, null, c.ip);
  return { ok: true };
});

// ----- Eventos y competidores (lectura para cualquier usuario con sesión) -----
route('GET', '/api/events', { auth: true }, async () => ({ events: (await db.prepare('SELECT * FROM events WHERE active = 1 ORDER BY event_date').all()).map(publicEvent) }));
route('GET', '/api/events/:id', { auth: true }, async (c) => {
  const e = await db.prepare('SELECT * FROM events WHERE id = ? AND active = 1').get(c.params.id);
  if (!e) throw new HttpError(404, 'Evento no encontrado');
  return { event: publicEvent(e) };
});
// El comprador NO ve la lista de competidores: escribe un código y el servidor lo valida (mayúsculas o minúsculas).
async function findCompetitorByCode(eventId, raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(code)) return null;
  return (await db.prepare('SELECT * FROM competitors WHERE event_id = ? AND code = ? COLLATE NOCASE AND active = 1').get(eventId, code)) || null;
}
route('GET', '/api/events/:id/competitor-code', { roles: ['USER'] }, async (c) => {
  throttle(`ccode:${c.user.id}`, 30, 10 * 60e3); // evita adivinar códigos
  const comp = await findCompetitorByCode(Number(c.params.id), c.url.searchParams.get('code'));
  if (!comp) throw new HttpError(404, 'Código no válido. Revisa que esté escrito correctamente.');
  return { competitor: { name: comp.name } };
});

// ----- Pedidos del comprador -----
const MAX_OPEN = Number(env('MAX_OPEN_ORDERS', '5')); // solicitudes en revisión por usuario
const AUTH_RE = /^[A-Za-z0-9-]{4,40}$/;
async function checkReference(auth, orderId) {
  if (!AUTH_RE.test(auth)) throw bad('Escribe el número de autorización/referencia de la transferencia (4 a 40 caracteres).');
  if (await db.prepare("SELECT 1 FROM orders WHERE auth_number = ? AND id != ? AND status IN ('por_validar','aprobada')").get(auth, orderId || 0)) throw bad('Ese número de autorización ya fue utilizado en otra solicitud.');
}
route('POST', '/api/orders', { roles: ['USER'] }, async (c) => {
  const b = c.body;
  const ev = await db.prepare('SELECT * FROM events WHERE id = ? AND active = 1').get(Number(b.event_id));
  if (!ev) throw new HttpError(404, 'Evento no disponible');
  const full_name = cleanStr(b.full_name, 80), email = cleanStr(b.email).toLowerCase(), phone = normPhone(b.phone);
  const dpi = String(b.dpi || '').replace(/\D/g, ''), birth = String(b.birth || '');
  if (full_name.length < 3) throw bad('Escribe tu nombre completo.');
  if (!isEmail(email)) throw bad('Correo electrónico inválido.');
  if (phone.length < 10 || phone.length > 15) throw bad('Teléfono inválido.');
  if (dpi.length !== 13) throw bad('El DPI debe tener 13 dígitos.');
  if (!validDate(birth)) throw bad('Fecha de nacimiento inválida.');
  if (!isAdult(birth)) throw bad('Debes ser mayor de edad (18 años cumplidos) para comprar entradas.');

  // Tipo y precio SIEMPRE salen del servidor; el navegador nunca define el monto.
  const tt = typeOf(b.ticket_type || 'GENERAL');
  if (!tt || !tt.active) throw bad('Selecciona un tipo de entrada válido.');
  const units = Number(b.units ?? b.qty);
  if (!Number.isInteger(units) || units < 1 || units > tt.max_units) throw bad(`Cantidad inválida para ${tt.name} (máximo ${tt.max_units}).`);
  const qty = units * tt.per_unit, total = round2(units * tt.price);

  // Pago: transferencia o depósito, ambos con número de referencia. El comprobante se envía por WhatsApp y
  // sin comprobante recibido el pago no se autoriza (ver /approve).
  const method = String(b.payment_method || '');
  if (!['transferencia', 'deposito'].includes(method) || !payMethods()[method]) throw bad('Selecciona un método de pago disponible (transferencia o depósito).');
  const auth = cleanStr(b.auth_number, 40).replace(/\s/g, '');
  // Doble clic / reintento: mismo pedido con la MISMA referencia en los últimos 30 s -> se devuelve el existente
  const dupe = await db.prepare("SELECT id FROM orders WHERE user_id=? AND event_id=? AND ticket_type=? AND units=? AND payment_method=? AND auth_number=? AND status='por_validar' AND created_at > ? ORDER BY id DESC").get(c.user.id, ev.id, tt.code, units, method, auth, now() - 30e3);
  if (dupe) return { ok: true, id: dupe.id, status: 'por_validar', payment_method: method, duplicate: true };
  await checkReference(auth, 0);

  // Apoyo a competidor: opcional, solo con un código válido
  let comp = null;
  if (cleanStr(b.competitor_code, 20)) {
    comp = await findCompetitorByCode(ev.id, b.competitor_code);
    if (!comp) throw bad('El código de competidor no es válido.');
  }

  // Mesa de 5: los titulares quedan DEFINITIVOS al comprar (no se editan después)
  let holders = [];
  if (tt.per_unit > 1) {
    const given = Array.isArray(b.holders) ? Array.from({ length: qty }, (_, i) => cleanStr(b.holders[i], 80)) : [];
    if (given.length === qty && given.every((n) => n.length >= 3)) holders = given;
    else if (b.holders_self === true) holders = Array(qty).fill(full_name);
    else throw bad(`${tt.name}: escribe el nombre de cada asistente, o confirma que todas las entradas saldrán a tu nombre.`);
  }

  const open = (await db.prepare(`SELECT COUNT(*) n FROM orders WHERE user_id = ? AND status IN ('solicitada','por_validar','pendiente_efectivo')`).get(c.user.id)).n;
  if (open >= MAX_OPEN) throw bad('Tienes demasiadas solicitudes pendientes. Espera a que se validen.');

  const id = await db.tx(async (tx) => {
    const newId = Number((await tx.prepare(`INSERT INTO orders(user_id,event_id,full_name,email,phone,dpi,birth,qty,total,status,auth_number,created_at,paid_at,ticket_type,units,unit_price,payment_method,holders_json)
      VALUES(?,?,?,?,?,?,?,?,?,'por_validar',?,?,?,?,?,?,?,?)`).run(c.user.id, ev.id, full_name, email, phone, dpi, birth, qty, total, auth, now(), now(), tt.code, units, tt.price, method, holders.length ? JSON.stringify(holders) : null)).lastInsertRowid);
    // FIT: solo se genera cuando hay un competidor apoyado
    if (comp) await tx.prepare('INSERT INTO supports(competitor_id,user_id,order_id,event_id,tickets_count,amount,fit_amount,created_at) VALUES(?,?,?,?,?,?,?,?)').run(comp.id, c.user.id, newId, ev.id, qty, total, round2(tt.fit * units), now());
    return newId;
  });
  await audit(c.user, 'pedido_creado', 'order', id, { tipo: tt.code, unidades: units, total, metodo: method, competidor: comp?.code || null }, c.ip);
  return { ok: true, id, status: 'por_validar', payment_method: method };
});
route('GET', '/api/orders', { auth: true }, async (c) => ({
  orders: await Promise.all((await db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(c.user.id)).map((o) => orderView(o))),
}));
route('GET', '/api/orders/:id', { auth: true }, async (c) => {
  const o = await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(c.params.id, c.user.id);
  if (!o) throw new HttpError(404, 'Solicitud no encontrada');
  return { order: await orderView(o) };
});
route('POST', '/api/orders/:id/payment', { auth: true }, async (c) => {
  const o = await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(c.params.id, c.user.id);
  if (!o) throw new HttpError(404, 'Solicitud no encontrada');
  if (o.payment_method === 'efectivo') throw bad('El pago en efectivo ya no se acepta. Cancela la solicitud y compra de nuevo.');
  if (!['solicitada', 'por_validar', 'rechazada'].includes(o.status)) throw bad('Esta solicitud ya fue procesada.');
  const auth = cleanStr(c.body.auth_number, 40).replace(/\s/g, '');
  await checkReference(auth, o.id);
  await db.prepare("UPDATE orders SET auth_number=?, status='por_validar', paid_at=?, reject_reason=NULL WHERE id=?").run(auth, now(), o.id);
  await audit(c.user, 'referencia_enviada', 'order', o.id, null, c.ip);
  return { ok: true };
});
route('DELETE', '/api/orders/:id', { auth: true }, async (c) => {
  const o = await db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(c.params.id, c.user.id);
  if (!o) throw new HttpError(404, 'Solicitud no encontrada');
  if (!['solicitada', 'pendiente_efectivo'].includes(o.status)) throw bad('Solo se pueden cancelar solicitudes sin pago reportado.');
  await db.prepare("UPDATE orders SET status='cancelada', decided_at=? WHERE id=?").run(now(), o.id);
  await audit(c.user, 'pedido_cancelado', 'order', o.id, null, c.ip);
  return { ok: true };
});

// ----- Taquilla + Administración: pagos, boletos y escáner -----
route('GET', '/api/staff/events', { roles: SCAN }, async () => ({ events: (await db.prepare('SELECT * FROM events ORDER BY event_date DESC, id DESC').all()).map(publicEvent) }));
route('GET', '/api/staff/orders', { roles: PAY_ROLES }, async (c) => {
  const st = c.url.searchParams.get('status'), q = cleanStr(c.url.searchParams.get('q'), 60), eid = Number(c.url.searchParams.get('event_id')) || null;
  const where = [], args = [];
  if (st && st !== 'todas') { where.push('o.status = ?'); args.push(st); }
  if (eid) { where.push('o.event_id = ?'); args.push(eid); }
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`, n = Number(q.replace(/^#/, ''));
    where.push(`(o.full_name LIKE ? ESCAPE '\\' OR o.email LIKE ? ESCAPE '\\' OR o.phone LIKE ? ESCAPE '\\' OR o.auth_number LIKE ? ESCAPE '\\'${Number.isInteger(n) && n > 0 ? ' OR o.id = ? OR EXISTS(SELECT 1 FROM tickets t WHERE t.order_id=o.id AND t.number=?)' : ''})`);
    args.push(like, like, like, like); if (Number.isInteger(n) && n > 0) args.push(n, n);
  }
  const rows = await db.prepare(`SELECT o.* FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 200`).all(...args);
  return { orders: await Promise.all(rows.map((o) => orderView(o, { staff: true, role: c.user.role }))) };
});
route('POST', '/api/staff/orders/:id/approve', { roles: PAY_ROLES }, async (c) => {
  const cur = await db.prepare('SELECT status FROM orders WHERE id = ?').get(c.params.id);
  if (cur?.status === 'por_validar' && c.body.proof_received !== true) throw bad('Confirma que recibiste el comprobante de pago por WhatsApp. Sin comprobante no se puede autorizar.');
  if (cur?.status === 'por_validar') await audit(c.user, 'comprobante_recibido', 'order', c.params.id, null, c.ip);
  const o = await approveOrder(Number(c.params.id), c.user, c.ip);
  return { ok: true, order: await orderView(o, { staff: true, role: c.user.role }) };
});
route('POST', '/api/staff/orders/:id/reject', { roles: PAY_ROLES }, async (c) => {
  const o = await db.prepare('SELECT * FROM orders WHERE id = ?').get(c.params.id);
  if (!o) throw new HttpError(404, 'Solicitud no encontrada');
  if (o.status !== 'por_validar') throw bad('Solo se pueden rechazar transferencias por validar.');
  const reason = cleanStr(c.body.reason, 200) || 'La transferencia no pudo ser validada.';
  await db.prepare("UPDATE orders SET status='rechazada', reject_reason=?, decided_at=?, approved_by=? WHERE id=?").run(reason, now(), c.user.id, o.id);
  await audit(c.user, 'pago_rechazado', 'order', o.id, { motivo: reason }, c.ip);
  return { ok: true };
});
route('POST', '/api/staff/orders/:id/cancel', { roles: PAY_ROLES }, async (c) => {
  const o = await db.prepare('SELECT * FROM orders WHERE id = ?').get(c.params.id);
  if (!o) throw new HttpError(404, 'Solicitud no encontrada');
  if (!['solicitada', 'pendiente_efectivo'].includes(o.status)) throw bad('Solo se pueden cancelar solicitudes sin pago confirmado.');
  await db.prepare("UPDATE orders SET status='cancelada', reject_reason=?, decided_at=? WHERE id=?").run(cleanStr(c.body.reason, 200) || null, now(), o.id);
  await audit(c.user, 'pedido_cancelado_staff', 'order', o.id, null, c.ip);
  return { ok: true };
});
route('GET', '/api/staff/tickets', { roles: PAY_ROLES }, async (c) => {
  const q = cleanStr(c.url.searchParams.get('q'), 60), eid = Number(c.url.searchParams.get('event_id')) || null;
  if (!q) return { tickets: [] };
  const n = Number(q.replace(/^#/, ''));
  const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
  const rows = await db.prepare(`SELECT t.*, o.full_name buyer, o.id order_id2, o.payment_method FROM tickets t JOIN orders o ON o.id = t.order_id
    WHERE (${Number.isInteger(n) && n > 0 ? 't.number = ? OR t.order_id = ? OR ' : ''}t.holder_name LIKE ? ESCAPE '\\' OR o.full_name LIKE ? ESCAPE '\\')
    ${eid ? 'AND t.event_id = ?' : ''} ORDER BY t.id DESC LIMIT 60`)
    .all(...(Number.isInteger(n) && n > 0 ? [n, n] : []), like, like, ...(eid ? [eid] : []));
  return { tickets: await Promise.all(rows.map(async (t) => {
    const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(t.event_id);
    return { ...ticketView(t, ev), order_id: t.order_id, buyer: t.buyer, payment_method: t.payment_method, event: `${ev.title} ${ev.subtitle || ''}`.trim(), event_id: t.event_id, used_by: t.used_by ? (await db.prepare('SELECT name FROM users WHERE id=?').get(t.used_by))?.name : null };
  })) };
});

// Escáner
const codeFrom = (raw) => String(raw || '').trim().replace(/^DOKAN\|/i, '').toLowerCase();
const REASONS = {
  invalida: 'Código QR no reconocido.',
  evento_incorrecto: 'Este boleto no corresponde al evento seleccionado.',
  cancelada: 'Boleto anulado. No se permite el ingreso.',
  reembolsada: 'Boleto reembolsado. No se permite el ingreso.',
  ya_utilizada: 'Entrada ya utilizada.',
};
async function scanInfo(t) {
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(t.event_id);
  const o = await db.prepare('SELECT payment_method, status, id FROM orders WHERE id = ?').get(t.order_id);
  return {
    id: t.id, number: ticketNumber(t.number), type_name: typeName(t.ticket_type), seq: t.pkg_seq, pkg_size: t.pkg_size,
    name: t.holder_name, birth: t.holder_birth ? fmtDMY(t.holder_birth) : '', dpi: t.holder_dpi || '',
    event: `${ev.title} ${ev.subtitle || ''}`.trim(), date: fmtDMY(ev.event_date), time: fmtTime(ev.event_time), location: ev.location, organizer: ev.organizer,
    payment: o?.status === 'aprobada' ? `Pagado (${o.payment_method})` : 'Sin confirmar', order_id: t.order_id,
    status: t.status, used: t.status === 'utilizada', used_at: t.used_at,
    used_by: t.used_by ? (await db.prepare('SELECT name FROM users WHERE id=?').get(t.used_by))?.name : null,
  };
}
async function classify(raw, eventId) {
  // Respaldo sin cámara: el personal autorizado puede escribir el NÚMERO visible del boleto (ej. 3 o #003).
  // Solo vale para el evento elegido y queda registrado como "manual" en el historial.
  const num = String(raw || '').trim().match(/^#?(\d{1,6})$/);
  if (num) {
    const t = await db.prepare('SELECT * FROM tickets WHERE number = ? AND event_id = ?').get(Number(num[1]), eventId);
    if (!t) return { state: 'invalida', code: '', manual: true };
    return { state: t.status === 'valida' ? 'valida' : t.status === 'utilizada' ? 'ya_utilizada' : t.status, code: t.code, t, manual: true };
  }
  const code = codeFrom(raw);
  if (!/^[a-f0-9]{32}$/.test(code)) return { state: 'invalida', code };
  const t = await db.prepare('SELECT * FROM tickets WHERE code = ?').get(code);
  if (!t) return { state: 'invalida', code };
  if (t.event_id !== eventId) return { state: 'evento_incorrecto', code, t };
  return { state: t.status === 'valida' ? 'valida' : t.status === 'utilizada' ? 'ya_utilizada' : t.status, code, t };
}
const logScan = (t, eventId, userId, result, detail) =>
  db.prepare('INSERT INTO scans(ticket_id,event_id,user_id,result,detail,created_at) VALUES(?,?,?,?,?,?)').run(t?.id ?? null, eventId ?? null, userId, result, detail ? String(detail).slice(0, 40) : null, now());
async function needEvent(c) {
  const eid = Number(c.body.event_id);
  if (!eid || !(await db.prepare('SELECT 1 FROM events WHERE id = ?').get(eid))) throw bad('Selecciona el evento que estás validando.');
  return eid;
}
async function scanResponse(cl) {
  if (cl.state === 'invalida' || cl.state === 'evento_incorrecto') return { valid: false, state: cl.state, reason: REASONS[cl.state] };
  if (cl.state === 'cancelada' || cl.state === 'reembolsada') return { valid: false, state: cl.state, reason: REASONS[cl.state] };
  return { valid: cl.state === 'valida', state: cl.state, reason: cl.state === 'ya_utilizada' ? REASONS.ya_utilizada : undefined, ticket: await scanInfo(cl.t) };
}
route('POST', '/api/staff/scan', { roles: SCAN }, async (c) => {
  const eid = await needEvent(c);
  const cl = await classify(c.body.code, eid);
  await logScan(cl.t, eid, c.user.id, cl.state, cl.manual ? 'manual' : cl.t ? null : cl.code);
  return scanResponse(cl);
});
route('POST', '/api/staff/checkin', { roles: SCAN }, async (c) => {
  const eid = await needEvent(c);
  const pre = await classify(c.body.code, eid);
  const code = pre.t ? pre.t.code : codeFrom(c.body.code);
  // Atómico: solo UN escaneo puede pasar de 'valida' a 'utilizada', aunque lleguen dos a la vez.
  const r = await db.prepare("UPDATE tickets SET status='utilizada', used=1, used_at=?, used_by=? WHERE code=? AND status='valida' AND event_id=?").run(now(), c.user.id, code, eid);
  const cl = await classify(code, eid);
  if (r.changes === 1) {
    await logScan(cl.t, eid, c.user.id, 'ingreso_registrado', pre.manual ? 'manual' : null);
    const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(cl.t.event_id);
    renderTicketRow(cl.t, ev).catch((e) => console.error('[boleto] no se pudo sellar:', e.message)); // la imagen deja de mostrar el QR
    return { ok: true, state: 'ingreso_registrado', ticket: await scanInfo(cl.t) };
  }
  await logScan(cl.t, eid, c.user.id, cl.state === 'valida' ? 'invalida' : cl.state, cl.t ? null : cl.code);
  return { ok: false, ...(await scanResponse(cl)) };
});
route('GET', '/api/staff/scans', { roles: SCAN }, async (c) => {
  const eid = Number(c.url.searchParams.get('event_id')) || null, lim = Math.min(200, Number(c.url.searchParams.get('limit')) || 60);
  const where = [], args = [];
  if (c.user.role === 'TAQUILLA') { where.push('s.user_id = ?'); args.push(c.user.id); } // la taquilla solo ve sus propios escaneos
  if (eid) { where.push('s.event_id = ?'); args.push(eid); }
  const rows = await db.prepare(`SELECT s.id, s.result, s.created_at, s.detail, u.name user_name, t.number, t.ticket_type, t.holder_name, e.title FROM scans s
    LEFT JOIN users u ON u.id = s.user_id LEFT JOIN tickets t ON t.id = s.ticket_id LEFT JOIN events e ON e.id = s.event_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC LIMIT ?`).all(...args, lim);
  return { scans: rows.map((r) => ({ id: r.id, result: r.result, at: r.created_at, user: r.user_name, number: r.number ? ticketNumber(r.number) : null, type_name: r.ticket_type ? typeName(r.ticket_type) : null, holder: r.holder_name, event: r.title })), scope: c.user.role === 'TAQUILLA' ? 'propio' : 'todos' };
});
// Panel de solo lectura para el perfil "Taquilla (panel)": entradas vendidas y utilizadas, sin datos personales ni dinero.
const nOf = async (q, ...a) => (await db.prepare(q).get(...a)).n;
route('GET', '/api/panel/stats', { roles: ['ADMIN', 'PANEL'] }, async () => {
  const evs = await db.prepare('SELECT * FROM events ORDER BY event_date DESC').all();
  const events = await Promise.all(evs.map(async (e) => ({
    id: e.id, title: e.title, subtitle: e.subtitle, event_date: e.event_date,
    sold: await nOf("SELECT COUNT(*) n FROM tickets WHERE event_id=? AND status IN ('valida','utilizada')", e.id),
    used: await nOf("SELECT COUNT(*) n FROM tickets WHERE event_id=? AND status='utilizada'", e.id),
    by_type: await Promise.all(ticketTypes().map(async (t) => ({ name: t.name, sold: await nOf("SELECT COUNT(*) n FROM tickets WHERE event_id=? AND ticket_type=? AND status IN ('valida','utilizada')", e.id, t.code), used: await nOf("SELECT COUNT(*) n FROM tickets WHERE event_id=? AND ticket_type=? AND status='utilizada'", e.id, t.code) }))),
  })));
  const sold = events.reduce((s, e) => s + e.sold, 0), used = events.reduce((s, e) => s + e.used, 0);
  return { sold, used, pending_entry: sold - used, events };
});

// ----- Administración (solo ADMIN) -----
// FIT confirmado de un competidor = FIT del pedido, proporcional a las entradas que siguen válidas o utilizadas
const FIT_CONF = "(SELECT COALESCE(SUM(s.fit_amount * 1.0 * (SELECT COUNT(*) FROM tickets t2 WHERE t2.order_id = s.order_id AND t2.status IN ('valida','utilizada')) / s.tickets_count), 0) FROM supports s WHERE s.competitor_id = c.id)";
route('GET', '/api/admin/stats', { admin: true }, async () => {
  const evs = await db.prepare('SELECT * FROM events ORDER BY event_date DESC').all();
  const events = await Promise.all(evs.map(async (e) => ({
    id: e.id, title: e.title, subtitle: e.subtitle, active: !!e.active,
    sold: await nOf("SELECT COUNT(*) n FROM tickets WHERE event_id=? AND status IN ('valida','utilizada')", e.id),
    pending: await nOf("SELECT COALESCE(SUM(qty),0) n FROM orders WHERE event_id=? AND status IN ('solicitada','por_validar','pendiente_efectivo')", e.id),
    used: await nOf("SELECT COUNT(*) n FROM tickets WHERE event_id=? AND status='utilizada'", e.id),
    revenue: await nOf("SELECT COALESCE(SUM(price),0) n FROM tickets WHERE event_id=? AND status IN ('valida','utilizada')", e.id),
  })));
  const [eventos, vendidas, pendientes, por_validar, ingresados, mesas_vendidas, recaudado, fit_total, supportsRaw] = await Promise.all([
    nOf('SELECT COUNT(*) n FROM events'),
    nOf("SELECT COUNT(*) n FROM tickets WHERE status IN ('valida','utilizada')"),
    nOf("SELECT COALESCE(SUM(qty),0) n FROM orders WHERE status IN ('solicitada','por_validar','pendiente_efectivo')"),
    nOf("SELECT COUNT(*) n FROM orders WHERE status='por_validar'"),
    nOf("SELECT COUNT(*) n FROM tickets WHERE status='utilizada'"),
    nOf("SELECT COALESCE(SUM(units),0) n FROM orders WHERE ticket_type='RINGSIDE' AND status='aprobada'"),
    nOf("SELECT COALESCE(SUM(price),0) n FROM tickets WHERE status IN ('valida','utilizada')"),
    nOf("SELECT COALESCE(SUM(s.fit_amount * 1.0 * (SELECT COUNT(*) FROM tickets t2 WHERE t2.order_id = s.order_id AND t2.status IN ('valida','utilizada')) / s.tickets_count), 0) n FROM supports s"),
    db.prepare(`SELECT c.id, c.name, c.code, e.title event,
      (SELECT COUNT(*) FROM supports s JOIN tickets t ON t.order_id = s.order_id WHERE s.competitor_id = c.id AND t.status IN ('valida','utilizada')) tickets,
      ${FIT_CONF} fit
      FROM competitors c JOIN events e ON e.id = c.event_id ORDER BY fit DESC, tickets DESC LIMIT 8`).all(),
  ]);
  return { eventos, vendidas, pendientes, por_validar, ingresados, mesas_vendidas, recaudado, fit_total, events, supports: supportsRaw.filter((x) => x.tickets > 0) };
});
route('GET', '/api/admin/reports', { admin: true }, async (c) => {
  const eid = Number(c.url.searchParams.get('event_id'));
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(eid);
  if (!ev) throw new HttpError(404, 'Evento no encontrado');
  const one = (q, ...a) => db.prepare(q).get(...a);
  const by_type = await Promise.all(ticketTypes().map(async (t) => {
    const cnt = (st) => one(`SELECT COUNT(*) n, COALESCE(SUM(price),0) a FROM tickets WHERE event_id=? AND ticket_type=? AND status IN (${st})`, eid, t.code);
    const [sold, used, avail, voided, pend, pk, issued] = await Promise.all([
      cnt("'valida','utilizada'"), cnt("'utilizada'"), cnt("'valida'"), cnt("'cancelada','reembolsada'"),
      one("SELECT COALESCE(SUM(qty),0) n, COALESCE(SUM(total),0) a FROM orders WHERE event_id=? AND ticket_type=? AND status IN ('solicitada','por_validar','pendiente_efectivo')", eid, t.code),
      one("SELECT COALESCE(SUM(units),0) n FROM orders WHERE event_id=? AND ticket_type=? AND status='aprobada'", eid, t.code),
      one('SELECT COUNT(*) n FROM tickets WHERE event_id=? AND ticket_type=?', eid, t.code),
    ]);
    return { code: t.code, name: t.name, per_unit: t.per_unit, sold: sold.n, amount: sold.a, used: used.n, available: avail.n, voided: voided.n, pending: pend.n, pending_amount: pend.a, packages: t.per_unit > 1 ? pk.n : null, issued: issued.n };
  }));
  const payments = await db.prepare('SELECT payment_method m, status s, COUNT(*) n, COALESCE(SUM(total),0) a FROM orders WHERE event_id=? GROUP BY payment_method, status').all(eid);
  const supports = await db.prepare(`SELECT c.id, c.name, c.code, c.active,
      (SELECT COUNT(*) FROM supports s JOIN orders o ON o.id=s.order_id WHERE s.competitor_id=c.id AND o.status IN ('solicitada','por_validar','pendiente_efectivo','aprobada')) orders,
      (SELECT COALESCE(SUM(o.qty),0) FROM supports s JOIN orders o ON o.id=s.order_id WHERE s.competitor_id=c.id AND o.status IN ('solicitada','por_validar','pendiente_efectivo')) pending_tickets,
      (SELECT COALESCE(SUM(s.fit_amount),0) FROM supports s JOIN orders o ON o.id=s.order_id WHERE s.competitor_id=c.id AND o.status IN ('solicitada','por_validar','pendiente_efectivo')) pending_fit,
      (SELECT COUNT(*) FROM supports s JOIN tickets t ON t.order_id=s.order_id WHERE s.competitor_id=c.id AND t.status IN ('valida','utilizada')) confirmed_tickets,
      ${FIT_CONF} confirmed_fit
    FROM competitors c WHERE c.event_id=? ORDER BY confirmed_fit DESC, pending_fit DESC, c.name`).all(eid);
  const sum = (k) => by_type.reduce((s, t) => s + t[k], 0);
  return {
    event: publicEvent(ev), by_type, payments, supports,
    totals: { sold: sum('sold'), amount: by_type.reduce((s, t) => s + t.amount, 0), used: sum('used'), available: sum('available'), pending: sum('pending'), issued: sum('issued'), voided: sum('voided') },
  };
});

route('GET', '/api/admin/events', { admin: true }, async () => ({ events: (await db.prepare('SELECT * FROM events ORDER BY id DESC').all()).map(publicEvent) }));
async function eventFields(b) {
  const title = cleanStr(b.title, 80), subtitle = cleanStr(b.subtitle, 80), location = cleanStr(b.location, 100), organizer = cleanStr(b.organizer, 80);
  const date = String(b.event_date || ''), time = String(b.event_time || '');
  if (!title || !location || !organizer) throw bad('Completa título, lugar y organizador.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw bad('Fecha u hora inválida.');
  let poster = null;
  if (b.image_data) {
    const m = String(b.image_data).match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
    if (!m) throw bad('Imagen inválida (usa PNG, JPG o WEBP).');
    const sharp = require('sharp');
    const name = `ev-${rand(6)}.jpg`;
    await sharp(Buffer.from(m[2], 'base64')).resize(1066, 810, { fit: 'cover' }).jpeg({ quality: 90 }).toFile(path.join(ROOT, 'public', 'uploads', name));
    poster = `/uploads/${name}`;
  }
  return { title, subtitle, location, organizer, date, time, poster };
}
route('POST', '/api/admin/events', { admin: true, limit: 8 * 1024 * 1024 }, async (c) => {
  const f = await eventFields(c.body);
  const r = await db.prepare('INSERT INTO events(title,subtitle,event_date,event_time,location,organizer,price,poster) VALUES(?,?,?,?,?,?,?,?)')
    .run(f.title, f.subtitle, f.date, f.time, f.location, f.organizer, minPrice(), f.poster || '/img/poster.jpg');
  await seedRoster(Number(r.lastInsertRowid));
  await audit(c.user, 'evento_creado', 'event', r.lastInsertRowid, { titulo: f.title }, c.ip);
  return { ok: true, id: Number(r.lastInsertRowid) };
});
route('POST', '/api/admin/events/:id', { admin: true, limit: 8 * 1024 * 1024 }, async (c) => {
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(c.params.id);
  if (!ev) throw new HttpError(404, 'Evento no encontrado');
  const f = await eventFields(c.body);
  await db.prepare('UPDATE events SET title=?,subtitle=?,event_date=?,event_time=?,location=?,organizer=?,poster=? WHERE id=?')
    .run(f.title, f.subtitle, f.date, f.time, f.location, f.organizer, f.poster || ev.poster, ev.id);
  await audit(c.user, 'evento_editado', 'event', ev.id, { titulo: f.title }, c.ip);
  return { ok: true };
});
route('POST', '/api/admin/events/:id/toggle', { admin: true }, async (c) => {
  await db.prepare('UPDATE events SET active = 1 - active WHERE id = ?').run(c.params.id);
  await audit(c.user, 'evento_visibilidad', 'event', c.params.id, null, c.ip);
  return { ok: true };
});
route('DELETE', '/api/admin/events/:id', { admin: true }, async (c) => {
  const ev = await db.prepare('SELECT * FROM events WHERE id = ?').get(c.params.id);
  if (!ev) throw new HttpError(404, 'Evento no encontrado');
  if (await db.prepare('SELECT 1 FROM orders WHERE event_id = ?').get(ev.id)) throw new HttpError(409, 'El evento ya tiene solicitudes o boletos: no se puede eliminar. Ocúltalo en su lugar.');
  await db.tx(async (tx) => {
    await tx.prepare('DELETE FROM competitors WHERE event_id = ?').run(ev.id);
    await tx.prepare('DELETE FROM events WHERE id = ?').run(ev.id);
  });
  await audit(c.user, 'evento_eliminado', 'event', ev.id, { titulo: ev.title }, c.ip);
  return { ok: true };
});

// Competidores
route('GET', '/api/admin/competitors', { admin: true }, async (c) => {
  const eid = Number(c.url.searchParams.get('event_id'));
  return { competitors: await db.prepare('SELECT c.*, (SELECT COUNT(*) FROM supports s WHERE s.competitor_id = c.id) supports FROM competitors c WHERE c.event_id = ? ORDER BY c.name COLLATE NOCASE').all(eid) };
});
route('POST', '/api/admin/competitors', { admin: true }, async (c) => {
  const eid = Number(c.body.event_id);
  if (!(await db.prepare('SELECT 1 FROM events WHERE id = ?').get(eid))) throw bad('Evento inválido.');
  // Una persona por línea: "Nombre | CÓDIGO"
  const lines = c.body.bulk ? String(c.body.bulk).split(/\r?\n/) : [`${c.body.name || ''} | ${c.body.code || ''}`];
  let added = 0, skipped = 0;
  for (const ln of lines) {
    const [n, k] = ln.split('|');
    const name = cleanStr(n, 80), code = cleanStr(k, 12).toUpperCase();
    if (!name && !code) continue;
    if (name.length < 2 || !/^[A-Z0-9]{3,12}$/.test(code)) { skipped++; continue; }
    try { await db.prepare('INSERT INTO competitors(event_id,name,code,created_at) VALUES(?,?,?,?)').run(eid, name, code, now()); added++; } catch { skipped++; }
  }
  if (!added && !skipped) throw bad('Escribe el nombre y el código del competidor.');
  await audit(c.user, 'competidores_agregados', 'event', eid, { agregados: added, omitidos: skipped }, c.ip);
  return { ok: true, added, skipped };
});
route('POST', '/api/admin/competitors/:id/toggle', { admin: true }, async (c) => {
  await db.prepare('UPDATE competitors SET active = 1 - active WHERE id = ?').run(c.params.id);
  await audit(c.user, 'competidor_visibilidad', 'competitor', c.params.id, null, c.ip);
  return { ok: true };
});
route('DELETE', '/api/admin/competitors/:id', { admin: true }, async (c) => {
  if (await db.prepare('SELECT 1 FROM supports WHERE competitor_id = ?').get(c.params.id)) throw new HttpError(409, 'Tiene apoyos registrados: no se puede eliminar. Ocúltalo en su lugar.');
  await db.prepare('DELETE FROM competitors WHERE id = ?').run(c.params.id);
  await audit(c.user, 'competidor_eliminado', 'competitor', c.params.id, null, c.ip);
  return { ok: true };
});

// Anular / reembolsar boleto (solo ADMIN)
route('POST', '/api/admin/tickets/:id/void', { admin: true }, async (c) => {
  const t = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(c.params.id);
  if (!t) throw new HttpError(404, 'Boleto no encontrado');
  if (t.status === 'utilizada') throw bad('El boleto ya fue utilizado y no se puede anular.');
  if (t.status !== 'valida') throw bad('El boleto ya está anulado.');
  const reason = cleanStr(c.body.reason, 200);
  if (reason.length < 3) throw bad('Escribe el motivo de la anulación.');
  const st = c.body.refund ? 'reembolsada' : 'cancelada';
  const r = await db.prepare("UPDATE tickets SET status=?, voided_by=?, voided_at=?, void_reason=? WHERE id=? AND status='valida'").run(st, c.user.id, now(), reason, t.id);
  if (!r.changes) throw bad('El boleto cambió de estado. Actualiza e intenta de nuevo.');
  try { await renderTicketRow({ ...t, status: st }, await db.prepare('SELECT * FROM events WHERE id = ?').get(t.event_id)); } catch (e) { console.error('[boleto] sello:', e.message); }
  await audit(c.user, st === 'reembolsada' ? 'boleto_reembolsado' : 'boleto_anulado', 'ticket', t.id, { numero: ticketNumber(t.number), motivo: reason }, c.ip);
  return { ok: true, status: st };
});

// Usuarios
route('GET', '/api/admin/users', { admin: true }, async () => ({
  users: (await db.prepare('SELECT id,name,email,phone,role,status,must_change,created_at FROM users ORDER BY id').all()).map((u) => ({ ...u, must_change: !!u.must_change })),
}));
const tempPassword = () => `${crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z]/g, 'k').slice(0, 6)}${crypto.randomInt(10, 99)}Aa`;
route('POST', '/api/admin/users', { admin: true }, async (c) => {
  const name = cleanStr(c.body.name, 80), email = cleanStr(c.body.email).toLowerCase(), phone = normPhone(c.body.phone), role = String(c.body.role || '');
  if (name.length < 3) throw bad('Escribe el nombre completo.');
  if (!isEmail(email)) throw bad('Correo electrónico inválido.');
  if (!ROLES.includes(role)) throw bad('Rol inválido.');
  if (await db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
  const temp = String(c.body.password || '') || tempPassword();
  if (!strongPw(temp)) throw bad(PW_MSG);
  const id = Number((await db.prepare('INSERT INTO users(name,email,phone,password_hash,role,verified,must_change,created_at) VALUES(?,?,?,?,?,1,1,?)').run(name, email, phone, hashPw(temp), role, now())).lastInsertRowid);
  await audit(c.user, 'usuario_creado', 'user', id, { email, rol: role }, c.ip);
  return { ok: true, id, temp_password: temp };
});
route('POST', '/api/admin/users/:id', { admin: true }, async (c) => {
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').get(c.params.id);
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  const role = c.body.role !== undefined ? String(c.body.role) : u.role, status = c.body.status !== undefined ? String(c.body.status) : u.status;
  const name = c.body.name !== undefined ? cleanStr(c.body.name, 80) : u.name;
  if (!ROLES.includes(role) || !['activo', 'suspendido'].includes(status) || name.length < 3) throw bad('Datos inválidos.');
  if (u.id === c.user.id && (role !== u.role || status !== 'activo')) throw bad('No puedes cambiar tu propio rol ni suspender tu propia cuenta.');
  if (u.role === 'ADMIN' && (role !== 'ADMIN' || status !== 'activo') && (await db.prepare("SELECT COUNT(*) n FROM users WHERE role='ADMIN' AND status='activo' AND id != ?").get(u.id)).n === 0) throw bad('Debe quedar al menos un administrador activo.');
  await db.prepare('UPDATE users SET role=?, status=?, name=? WHERE id=?').run(role, status, name, u.id);
  if (role !== u.role || status !== u.status) await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  await audit(c.user, 'usuario_editado', 'user', u.id, { rol: [u.role, role], estado: [u.status, status] }, c.ip);
  return { ok: true };
});
route('POST', '/api/admin/users/:id/reset-password', { admin: true }, async (c) => {
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').get(c.params.id);
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  const temp = tempPassword();
  await db.prepare('UPDATE users SET password_hash=?, must_change=1, reset_hash=NULL, reset_expires=NULL WHERE id=?').run(hashPw(temp), u.id);
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  await audit(c.user, 'contrasena_restablecida_admin', 'user', u.id, null, c.ip);
  return { ok: true, temp_password: temp };
});

// Ajustes: precios por tipo de entrada y métodos de pago
route('GET', '/api/admin/settings', { admin: true }, async () => { await refreshCatalog(); return { types: ticketTypes().map((t) => ({ ...t, active: !!t.active })), pay: payMethods() }; });
route('POST', '/api/admin/settings', { admin: true }, async (c) => {
  await refreshCatalog();
  const before = { types: ticketTypes().map((t) => [t.code, t.price, t.fit, t.active]), pay: payMethods() };
  await db.tx(async (tx) => {
    for (const t of Array.isArray(c.body.types) ? c.body.types : []) {
      const cur = await tx.prepare('SELECT * FROM ticket_types WHERE code = ?').get(String(t.code || ''));
      if (!cur) throw bad('Tipo de entrada inválido.');
      const price = Number(t.price), mx = Number(t.max_units ?? cur.max_units), fit = Number(t.fit ?? cur.fit);
      if (!(price > 0 && price < 100000) || !Number.isInteger(mx) || mx < 1 || mx > 50) throw bad('Precio o máximo inválido.');
      if (!(fit >= 0 && fit < price)) throw bad('El FIT debe ser mayor o igual a 0 y menor que el precio.');
      await tx.prepare('UPDATE ticket_types SET price=?, max_units=?, active=?, fit=? WHERE code=?').run(round2(price), mx, t.active ? 1 : 0, round2(fit), cur.code);
    }
    if (c.body.pay) {
      const p = { transferencia: !!c.body.pay.transferencia, deposito: !!c.body.pay.deposito };
      if (!p.transferencia && !p.deposito) throw bad('Debe quedar al menos un método de pago activo.');
      const up = tx.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      await up.run('pay_transferencia', p.transferencia ? '1' : '0'); await up.run('pay_deposito', p.deposito ? '1' : '0');
    }
    if (!(await tx.prepare('SELECT COUNT(*) n FROM ticket_types WHERE active = 1').get()).n) throw bad('Debe quedar al menos un tipo de entrada activo.');
  });
  await refreshCatalog();
  await audit(c.user, 'ajustes_modificados', 'settings', null, { antes: before, despues: { types: ticketTypes().map((t) => [t.code, t.price, t.fit, t.active]), pay: payMethods() } }, c.ip);
  return { ok: true };
});

route('GET', '/api/admin/audit', { admin: true }, async (c) => {
  const lim = Math.min(300, Number(c.url.searchParams.get('limit')) || 100);
  return { entries: await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(lim) };
});

// ---------- Servidor ----------
function resolveStatic(rel) {
  const base = path.join(ROOT, 'public');
  // Lector de QR del navegador: se sirve desde node_modules (npm install) para no depender de un CDN externo
  if (rel === '/vendor/html5-qrcode.min.js') {
    const f = path.join(ROOT, 'node_modules', 'html5-qrcode', 'html5-qrcode.min.js');
    return fs.existsSync(f) ? f : null;
  }
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return 'forbidden';
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  // Windows no distingue mayúsculas y Linux sí (p. ej. LOGIN_LOGO.PNG vs login_logo.png): se busca sin distinguir
  try {
    const want = path.basename(file).toLowerCase();
    const hit = fs.readdirSync(path.dirname(file)).find((f) => f.toLowerCase() === want);
    if (hit) { const alt = path.join(path.dirname(file), hit); if (fs.statSync(alt).isFile()) return alt; }
  } catch { /* directorio inexistente */ }
  return null;
}
function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC_HEADERS }); return res.end('No encontrado'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=300', ...SEC_HEADERS });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    // Boleto público (enlace imposible de adivinar; WhatsApp lo descarga desde aquí)
    const m = p.match(/^\/t\/([a-f0-9]{32})\.png$/);
    if (m) {
      const f = ticketFile(m[1]);
      if (!fs.existsSync(f)) {
        // El disco del servidor puede ser temporal (hosting): la imagen se vuelve a generar desde la base de datos
        const t = await db.prepare('SELECT * FROM tickets WHERE code = ?').get(m[1]);
        const ev = t && await db.prepare('SELECT * FROM events WHERE id = ?').get(t.event_id);
        if (!t || !ev) { res.writeHead(404); return res.end('No encontrado'); }
        await renderTicketRow(t, ev);
      }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60', 'Content-Disposition': 'inline; filename="boleto-dokan.png"', ...SEC_HEADERS });
      return fs.createReadStream(f).pipe(res);
    }
    if (p.startsWith('/api/')) {
      const r = routes.find((x) => x.method === req.method && x.re.test(p));
      if (!r) return send(res, 404, { error: 'Ruta no encontrada' });
      if (now() - cacheAt > 5000) await refreshCatalog();
      const vals = p.match(r.re).slice(1);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(vals[i])]));
      const user = await getUser(req);
      // Los permisos se validan SIEMPRE aquí, en el servidor (ocultar un botón en la interfaz no protege nada)
      const roles = r.opts.roles || (r.opts.admin ? ['ADMIN'] : null);
      if ((r.opts.auth || roles) && !user) return send(res, 401, { error: 'Inicia sesión para continuar.' });
      if (user && user.must_change && (r.opts.auth || roles) && !r.opts.allowMustChange) return send(res, 403, { error: 'Debes cambiar tu contraseña para continuar.', mustChangePassword: true });
      if (roles && !roles.includes(user.role)) return send(res, 403, { error: 'No tienes permiso para esta acción.' });
      const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req, r.opts.limit) : {};
      const ip = req.socket.remoteAddress;
      const out = await r.handler({ req, res, url, params, body, user, ip });
      return send(res, 200, out);
    }
    // Estáticos
    const f = resolveStatic(p === '/' ? '/index.html' : p);
    if (f === 'forbidden') { res.writeHead(403); return res.end(); }
    if (f) return serveFile(res, f);
    if (path.extname(p)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC_HEADERS }); return res.end('No encontrado'); }
    return serveFile(res, path.join(ROOT, 'public', 'index.html'));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
    console.error('[error]', e);
    send(res, 500, { error: 'Error interno del servidor' });
  }
});
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

(async function init() {
  await migrate();
  await seedUsers();
  await refreshCatalog();
  const cuentas = (await db.prepare('SELECT role, COUNT(*) n FROM users GROUP BY role').all()).map((r) => `${r.role}=${r.n}`).join(' · ');
  server.listen(CFG.port, () => {
    console.log(`\n  DOKAN Tickets listo → ${CFG.publicUrl}`);
    console.log(`  Base de datos: ${REMOTE ? 'Turso (' + env('TURSO_DATABASE_URL') + ')' : 'archivo local data/dokan.db'}`);
    console.log(`  Cuentas: ${cuentas}`);
    console.log(`  Correo: ${env('SMTP_HOST') ? 'SMTP ' + env('SMTP_HOST') : 'SIMULADO (consola + data/outbox.log)'} · WhatsApp: ${CFG.wa}\n`);
  });
})().catch((e) => { console.error('[arranque] no se pudo iniciar:', e); process.exit(1); });
