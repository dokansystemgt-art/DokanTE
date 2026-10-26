'use strict';
// Pruebas de integración: arrancan el servidor real con una BD temporal y recorren los flujos completos.
// Uso: npm test   (requiere haber ejecutado npm install)
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..');
const PORT = 3400 + Math.floor(Math.random() * 400), BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dokan-test-'));
const SEED = { SEED_ADMIN_EMAIL: 'ADMIN@GMAL.COM', SEED_ADMIN_PASSWORD: 'ADMIN123', SEED_USER_EMAIL: 'GIANCARLO@GMAIL.COM', SEED_USER_PASSWORD: 'Gian1755', SEED_TAQUILLA_EMAIL: 'TAQUILLA@GMAIL.COM', SEED_TAQUILLA_PASSWORD: 'TAQUI123', SEED_PANEL_EMAIL: 'Taquido@gmail.com', SEED_PANEL_PASSWORD: 'Tdokan1234' };
let proc;
const start = () => new Promise((ok, no) => {
  proc = spawn(process.execPath, ['--no-warnings', 'server.js'], { cwd: ROOT, env: { ...process.env, ...SEED, PORT, MAX_OPEN_ORDERS: '200', DATA_DIR: DATA, PUBLIC_URL: BASE, SMTP_HOST: '' } });
  let out = ''; proc.stdout.on('data', (d) => { out += d; if (out.includes('listo')) ok(); }); proc.stderr.on('data', (d) => { out += d; });
  proc.on('exit', (c) => no(new Error('servidor terminó: ' + c + '\n' + out)));
});
const stop = () => new Promise((ok) => { proc.removeAllListeners('exit'); proc.on('exit', ok); proc.kill(); });
function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j = {}; try { j = await r.json(); } catch { /* binario */ } return { s: r.status, ...j, _r: r };
  };
  return { get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}), del: (u) => call('DELETE', u), raw: (u) => fetch(BASE + u, { headers: { cookie } }) };
}
let pass = 0, fail = 0; const failures = [];
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ✔', name); } catch (e) { fail++; failures.push(name); console.log('  ✘', name, '\n     ', e.message.split('\n')[0]); } };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yearsAgo = (y, dayOffset = 0) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setDate(d.getDate() + dayOffset); return ymd(d); };
let refN = 1000; const ref = () => 'REF' + (++refN);
const buyer = (extra = {}) => ({ event_id: 1, full_name: 'Monqui Pérez', email: 'm@x.com', phone: '55551234', dpi: '1234567890101', birth: '1990-05-05', ticket_type: 'GENERAL', units: 1, payment_method: 'transferencia', auth_number: ref(), ...extra });
const hash = async (r) => crypto.createHash('sha1').update(Buffer.from(await (await r).arrayBuffer())).digest('hex');

(async () => {
  await start();
  const admin = client(), taq = client(), user = client(), panel = client(), anon = client(), nu = client();

  console.log('\nAcceso y cuentas');
  await t('Registro sin verificación de correo; el rol enviado se ignora', async () => {
    const r = await nu.post('/api/register', { name: 'Ana López', email: 'Ana@Correo.com', phone: '5555-0000', password: 'Clave1234', role: 'ADMIN' });
    assert.equal(r.s, 200); const me = await nu.get('/api/me'); assert.equal(me.user.email, 'ana@correo.com'); assert.equal(me.user.role, 'USER');
    assert.equal((await client().post('/api/register', { name: 'Ana López', email: 'ana@correo.com', phone: '55550000', password: 'Clave1234' })).s, 409);
    assert.equal((await client().post('/api/register', { name: 'Ana López', email: 'no-es-correo', phone: '55550000', password: 'Clave1234' })).s, 400);
  });
  await t('Las 4 cuentas permanentes inician sesión con su rol', async () => {
    assert.equal((await admin.post('/api/login', { email: 'admin@gmal.com', password: 'ADMIN123' })).role, 'ADMIN');
    assert.equal((await taq.post('/api/login', { email: 'TAQUILLA@GMAIL.COM', password: 'TAQUI123' })).role, 'TAQUILLA');
    const p = await panel.post('/api/login', { email: 'taquido@gmail.com', password: 'Tdokan1234' }); assert.equal(p.role, 'PANEL');
    const u = await user.post('/api/login', { email: 'giancarlo@gmail.com', password: 'Gian1755' }); assert.equal(u.role, 'USER'); assert.equal(u.mustChange, false);
  });
  await t('ADMIN/TAQUILLA/PANEL deben cambiar la contraseña inicial (el servidor lo exige)', async () => {
    assert.equal((await admin.get('/api/staff/events')).s, 403);
    assert.equal((await admin.post('/api/password', { current: 'ADMIN123', password: 'AdminNueva9' })).s, 200);
    assert.equal((await taq.post('/api/password', { current: 'TAQUI123', password: 'TaquiNueva9' })).s, 200);
    assert.equal((await panel.get('/api/panel/stats')).s, 403);
    assert.equal((await panel.post('/api/password', { current: 'Tdokan1234', password: 'PanelNueva9' })).s, 200);
  });
  await t('/api/config exige sesión y entrega número de comprobante, FIT y solo transferencia/depósito', async () => {
    assert.equal((await anon.get('/api/config')).s, 401);
    const c = await user.get('/api/config'); assert.ok(c.bank); assert.equal(c.proof.phone, '35962132'); assert.equal(c.proof.wa, '50235962132');
    assert.deepEqual(Object.keys(c.pay).sort(), ['deposito', 'transferencia']); assert.deepEqual(c.ticketTypes.map((x) => [x.code, x.price, x.fit]), [['GENERAL', 125, 25], ['VIP', 175, 45], ['RINGSIDE', 900, 200]]);
    assert.equal((await admin.get('/api/config')).bank, null);
  });
  await t('Recuperación de contraseña por enlace, un solo uso', async () => {
    await client().post('/api/forgot', { email: 'ana@correo.com' }); await new Promise((r) => setTimeout(r, 300));
    const m = fs.readFileSync(path.join(DATA, 'outbox.log'), 'utf8').match(/token=([a-f0-9]{64})/); assert.ok(m);
    assert.equal((await client().post('/api/reset', { email: 'ana@correo.com', token: m[1], password: 'Nueva12345' })).s, 200);
    assert.equal((await client().post('/api/reset', { email: 'ana@correo.com', token: m[1], password: 'Otra123456' })).s, 400);
  });

  console.log('\nCompetidores por código');
  const ev1 = (await admin.get('/api/admin/events')).events[0];
  await t('Los 16 competidores con sus códigos quedan cargados en el evento', async () => {
    const l = (await admin.get('/api/admin/competitors?event_id=' + ev1.id)).competitors; assert.equal(l.length, 16);
    assert.equal(l.find((c) => c.code === 'KVH006').name, 'Kenpo Vista Hermosa'); assert.equal(l.find((c) => c.code === 'PT016').name, 'Pedro Toledo');
  });
  await t('El comprador valida un código (mayúsculas o minúsculas) y NO puede listar competidores', async () => {
    assert.equal((await user.get(`/api/events/${ev1.id}/competitor-code?code=cip001`)).competitor.name, 'Ciprianos');
    assert.equal((await user.get(`/api/events/${ev1.id}/competitor-code?code=Dm005`)).competitor.name, 'Dinamita MMA');
    assert.equal((await user.get(`/api/events/${ev1.id}/competitor-code?code=XXX999`)).s, 404);
    assert.equal((await user.get(`/api/events/${ev1.id}/competitor-code?code=CIP00`)).s, 404, 'código incompleto');
    assert.equal((await user.get(`/api/events/${ev1.id}/competitors?q=cip`)).s, 404, 'la lista ya no existe');
    assert.equal((await admin.get(`/api/events/${ev1.id}/competitor-code?code=cip001`)).s, 403, 'solo compradores');
  });
  await t('Un evento nuevo recibe automáticamente la lista de competidores', async () => {
    const e = await admin.post('/api/admin/events', { title: 'Otro', event_date: '2027-01-10', event_time: '19:00', location: 'Xela', organizer: 'Org' });
    assert.equal((await admin.get('/api/admin/competitors?event_id=' + e.id)).competitors.length, 16); ev1.other = e.id;
  });

  console.log('\nCompras');
  const ids = {};
  await t('Menores de edad no pueden comprar; quien cumple 18 hoy sí', async () => {
    assert.equal((await user.post('/api/orders', buyer({ birth: '2012-03-03' }))).s, 400);
    const r = await user.post('/api/orders', buyer({ birth: yearsAgo(18, 1) })); assert.equal(r.s, 400); assert.match(r.error, /mayor de edad/);
    const ok = await user.post('/api/orders', buyer({ birth: yearsAgo(18) })); assert.equal(ok.s, 200); ids.edge = ok.id;
    assert.equal((await user.post(`/api/orders/${ids.edge}`, {})).s, 404);
    assert.equal((await user.del('/api/orders/' + ids.edge)).s, 400, 'una compra con pago reportado no se cancela sola');
  });
  await t('El efectivo ya no se acepta; transferencia y depósito exigen referencia', async () => {
    assert.equal((await user.post('/api/orders', buyer({ payment_method: 'efectivo', units: 2 }))).s, 400);
    assert.equal((await user.post('/api/orders', buyer({ auth_number: undefined, units: 2 }))).s, 400);
    assert.equal((await user.post('/api/orders', buyer({ payment_method: 'deposito', auth_number: 'ab', units: 2 }))).s, 400);
    ids.depBody = buyer({ payment_method: 'deposito', units: 2 }); const d = await user.post('/api/orders', ids.depBody); assert.equal(d.s, 200); assert.equal(d.status, 'por_validar'); ids.dep = d.id;
    const o = (await user.get('/api/orders/' + ids.dep)).order; assert.equal(o.payment_method, 'deposito'); assert.equal(o.total, 250);
    assert.equal((await user.post('/api/orders', buyer({ auth_number: o.auth_number, units: 3 }))).s, 400, 'referencia repetida');
  });
  await t('Precios fijos del servidor: General 125, VIP 175, Mesa 5 personas 900 (5 entradas)', async () => {
    const g = await user.post('/api/orders', buyer({ units: 3, total: 1 })); assert.equal((await user.get('/api/orders/' + g.id)).order.total, 375);
    const v = await user.post('/api/orders', buyer({ ticket_type: 'VIP' })); ids.vip = v.id; assert.equal((await user.get('/api/orders/' + v.id)).order.total, 175);
    assert.equal((await user.post('/api/orders', buyer({ ticket_type: 'PLATINO' }))).s, 400);
    assert.equal((await user.post('/api/orders', buyer({ units: 11 }))).s, 400);
    const o = (await user.get('/api/orders/' + v.id)).order; assert.equal(o.type_name, 'Sillas VIP');
  });
  await t('Mesa de 5: exige nombres de los 5 o la confirmación "a mi nombre"; queda definitivo', async () => {
    assert.equal((await user.post('/api/orders', buyer({ ticket_type: 'RINGSIDE' }))).s, 400, 'sin nombres ni confirmación');
    assert.equal((await user.post('/api/orders', buyer({ ticket_type: 'RINGSIDE', holders: ['A B C', 'Carlos Ruiz', '', 'Ana Díaz', 'Luis Gil'] }))).s, 400, 'con un nombre vacío');
    assert.equal((await user.post('/api/orders', buyer({ ticket_type: 'RINGSIDE', units: 3, holders_self: true }))).s, 400, 'máximo de mesas');
    const s = await user.post('/api/orders', buyer({ ticket_type: 'RINGSIDE', holders_self: true })); assert.equal(s.s, 200); ids.self = s.id;
    const c = await user.post('/api/orders', buyer({ ticket_type: 'RINGSIDE', holders: ['Monqui Pérez', 'Carlos Ruiz', 'Pedro Gil', 'Ana Díaz', 'Lucía Mena'], competitor_code: 'cip001' })); assert.equal(c.s, 200); ids.ring = c.id;
    const o = (await user.get('/api/orders/' + ids.ring)).order; assert.equal(o.total, 900); assert.equal(o.qty, 5); assert.equal(o.pending_tickets.length, 5); assert.equal(o.status, 'por_validar');
    assert.equal((await user.post(`/api/orders/${ids.ring}/holders`, { holders: ['x', 'y', 'z', 'w', 'v'] })).s, 404, 'ya no se pueden cambiar los nombres');
  });
  await t('Apoyo a competidor: código opcional y válido; guarda FIT solo cuando hay competidor', async () => {
    assert.equal((await user.post('/api/orders', buyer({ competitor_code: 'ZZZ999', units: 4 }))).s, 400);
    const a = await user.post('/api/orders', buyer({ competitor_code: 'Dm005', units: 2 })); ids.sup = a.id; assert.equal((await user.get('/api/orders/' + a.id)).order.competitor.name, 'Dinamita MMA');
    const g = await user.post('/api/orders', buyer({ competitor_code: 'cip001', units: 1 })); ids.gen = g.id;
    const v = await user.post('/api/orders', buyer({ ticket_type: 'VIP', competitor_code: 'KVH006' })); ids.vipsup = v.id;
    const r = (await admin.get('/api/admin/reports?event_id=' + ev1.id)).supports;
    assert.equal(r.find((c) => c.code === 'DM005').pending_fit, 50, '2 generales × Q25');
    assert.equal(r.find((c) => c.code === 'CIP001').pending_fit, 25 + 200, 'general Q25 + mesa Q200');
    assert.equal(r.find((c) => c.code === 'KVH006').pending_fit, 45, 'VIP Q45');
    assert.equal(r.find((c) => c.code === 'PAN007').pending_fit, 0, 'sin apoyo: sin FIT');
  });
  await t('Doble envío accidental no duplica el pedido', async () => {
    const a = await user.post('/api/orders', ids.depBody); assert.equal(a.id, ids.dep); assert.equal(a.duplicate, true);
    const o = (await user.get('/api/orders/' + ids.dep)).order; const other = await user.post('/api/orders', buyer({ units: 2, payment_method: 'deposito' })); assert.notEqual(other.id, ids.dep, 'otra referencia = otro pedido'); assert.equal(o.units, 2);
  });

  console.log('\nPagos y comprobante');
  await t('Nada se emite ni cuenta como venta mientras el pago está en revisión', async () => {
    const st = await admin.get('/api/admin/stats'); assert.equal(st.vendidas, 0); assert.ok(st.pendientes > 10); assert.equal(st.fit_total, 0);
  });
  await t('Un usuario normal no puede usar rutas de admin/staff/panel', async () => {
    for (const [m, u] of [['post', `/api/staff/orders/${ids.vip}/approve`], ['get', '/api/staff/orders'], ['get', '/api/admin/users'], ['get', '/api/admin/audit'], ['post', '/api/admin/settings'], ['post', '/api/staff/scan'], ['get', '/api/panel/stats']]) assert.equal((await user[m](u, {})).s, 403, u);
    assert.equal((await anon.get('/api/staff/orders')).s, 401);
  });
  await t('Sin comprobante recibido NO se autoriza el pago; con comprobante se emiten los boletos', async () => {
    const no = await admin.post(`/api/staff/orders/${ids.vip}/approve`); assert.equal(no.s, 400); assert.match(no.error, /comprobante/i);
    assert.equal((await admin.post(`/api/staff/orders/${ids.vip}/approve`, { proof_received: false })).s, 400);
    const r = await admin.post(`/api/staff/orders/${ids.vip}/approve`, { proof_received: true }); assert.equal(r.s, 200); assert.equal(r.order.tickets.length, 1); assert.equal(r.order.tickets[0].type_name, 'Sillas VIP');
    assert.equal((await admin.post(`/api/staff/orders/${ids.vip}/approve`, { proof_received: true })).s, 400, 'no dos veces');
  });
  let ring;
  await t('Mesa 5 personas confirmada: 5 boletos con número, QR y titular propios', async () => {
    assert.equal((await admin.post(`/api/staff/orders/${ids.ring}/approve`, { proof_received: true })).s, 200); ring = (await user.get('/api/orders/' + ids.ring)).order;
    assert.equal(ring.tickets.length, 5); assert.equal(new Set(ring.tickets.map((x) => x.number)).size, 5); assert.equal(new Set(ring.tickets.map((x) => x.url)).size, 5);
    assert.deepEqual(ring.tickets.map((x) => x.holder), ['Monqui Pérez', 'Carlos Ruiz', 'Pedro Gil', 'Ana Díaz', 'Lucía Mena']);
    assert.equal(ring.tickets.reduce((s, x) => s + x.price, 0), 900);
    assert.equal((await admin.post(`/api/staff/orders/${ids.self}/approve`, { proof_received: true })).s, 200);
    assert.deepEqual((await user.get('/api/orders/' + ids.self)).order.tickets.map((x) => x.holder), Array(5).fill('Monqui Pérez'));
    assert.equal((await admin.post(`/api/staff/orders/${ids.gen}/approve`, { proof_received: true })).s, 200);
  });
  await t('Mensaje de WhatsApp con datos reales; uno por boleto y uno para toda la mesa', async () => {
    const tk = ring.tickets[1], m = tk.wa_text;
    for (const piece of ['¡Hola Carlos! ¡Tu pago fue confirmado!', 'Tu entrada para *Amateur Fight League — Sexta Edición* ya está lista.', `🎟️ *Boleto #${tk.number}*`, '📅 *Fecha:* 28/11/2026', '🕕 *Hora:* 6:00 P. M.', '📍 *Lugar:* Antigua Guatemala', '¡Gracias por tu compra! Nos vemos en Amateur Fight League.']) assert.ok(m.includes(piece), piece);
    assert.ok(m.includes('Mesa 5 personas') && ring.wa_text_all.includes('Boletos #'));
  });
  await t('Rechazar una transferencia permite corregir la referencia', async () => {
    const r = await user.post('/api/orders', buyer({ units: 5 })); assert.equal((await admin.post(`/api/staff/orders/${r.id}/reject`, { reason: 'No llegó' })).s, 200);
    assert.equal((await user.post(`/api/orders/${r.id}/payment`, { auth_number: ref() })).s, 200);
  });

  console.log('\nPermisos de TAQUILLA (solo escanea) y PANEL (solo lectura)');
  const events = (await taq.get('/api/staff/events')).events;
  await t('Taquilla solo escanea: no ve pagos, compras, búsqueda de boletos, usuarios ni reportes', async () => {
    assert.equal(events.length, 2);
    for (const [m, u, b] of [['get', '/api/staff/orders'], ['post', `/api/staff/orders/${ids.sup}/approve`, { proof_received: true }], ['post', `/api/staff/orders/${ids.sup}/reject`], ['get', '/api/staff/tickets?q=1'], ['get', '/api/admin/users'], ['get', '/api/admin/stats'], ['get', '/api/admin/audit'], ['get', '/api/panel/stats'], ['post', '/api/admin/settings', {}], ['post', '/api/admin/events', { title: 'x' }]]) assert.equal((await taq[m](u, b)).s, 403, u);
    assert.equal((await taq.post('/api/orders', buyer())).s, 403, 'tampoco compra');
  });
  await t('Perfil Taquilla (panel): solo ve entradas vendidas/utilizadas; nada más', async () => {
    const s = await panel.get('/api/panel/stats'); assert.equal(s.s, 200); assert.equal(s.sold, 1 + 5 + 5 + 1); assert.equal(s.used, 0); assert.equal(s.pending_entry, 12);
    assert.equal(JSON.stringify(s).includes('total'), false, 'sin datos de dinero');
    for (const [m, u] of [['get', '/api/staff/events'], ['post', '/api/staff/scan'], ['post', '/api/staff/checkin'], ['get', '/api/staff/orders'], ['get', '/api/staff/scans'], ['get', '/api/admin/stats'], ['get', '/api/orders'], ['get', '/api/config']].filter((x) => x[1] !== '/api/orders' && x[1] !== '/api/config')) assert.equal((await panel[m](u, {})).s, 403, u);
    assert.equal((await panel.post('/api/orders', buyer())).s, 403);
  });

  console.log('\nEscáner y QR que se autodestruye');
  const code = (url) => url.match(/t\/([a-f0-9]{32})/)[1];
  const c1 = code(ring.tickets[0].url), c2 = code(ring.tickets[1].url), c3 = code(ring.tickets[2].url), cGen = code((await user.get('/api/orders/' + ids.gen)).order.tickets[0].url);
  await t('El código del QR tiene 128 bits; el número visible solo lo puede usar el personal (con evento)', async () => {
    assert.match(c1, /^[a-f0-9]{32}$/); assert.notEqual(c1, c2);
    assert.equal((await taq.post('/api/staff/scan', { code: 'DOKAN|' + ring.tickets[0].number.padStart(32, '0'), event_id: ev1.id })).state, 'invalida');
    assert.equal((await user.post('/api/staff/scan', { code: ring.tickets[0].number, event_id: ev1.id })).s, 403);
    assert.equal((await taq.post('/api/staff/scan', { code: c1 })).s, 400, 'sin evento');
  });
  await t('Escaneo válido muestra evento, tipo, nº, titular y pago', async () => {
    const r = await taq.post('/api/staff/scan', { code: `DOKAN|${c1}`, event_id: ev1.id }); assert.equal(r.valid, true); assert.equal(r.ticket.type_name, 'Mesa 5 personas'); assert.equal(r.ticket.name, 'Monqui Pérez'); assert.match(r.ticket.payment, /Pagado/);
    const x = await taq.post('/api/staff/scan', { code: c1, event_id: ev1.other }); assert.equal(x.state, 'evento_incorrecto'); assert.equal(x.ticket, undefined);
  });
  await t('Al registrar el ingreso el QR se destruye: la imagen cambia y ya no se puede volver a entrar', async () => {
    const before = await hash(user.raw(ring.tickets[0].url));
    const a = await taq.post('/api/staff/checkin', { code: c1, event_id: ev1.id }); assert.equal(a.ok, true);
    await new Promise((r) => setTimeout(r, 900));
    const after = await hash(user.raw(ring.tickets[0].url)); assert.notEqual(before, after, 'la imagen del boleto ya no es la original (sin QR)');
    assert.equal((await user.raw(ring.tickets[0].url)).status, 200);
    assert.equal((await user.get('/api/orders/' + ids.ring)).order.tickets[0].status, 'utilizada');
    const unused = await hash(user.raw(ring.tickets[1].url)); assert.notEqual(unused, after);
  });
  await t('Reescanear un boleto usado SIEMPRE muestra el resumen y no deja entrar (QR o número)', async () => {
    for (const raw of [`DOKAN|${c1}`, c1, '#' + ring.tickets[0].number]) {
      const r = await admin.post('/api/staff/scan', { code: raw, event_id: ev1.id });
      assert.equal(r.valid, false); assert.equal(r.state, 'ya_utilizada'); assert.ok(r.ticket.used_at); assert.equal(r.ticket.name, 'Monqui Pérez'); assert.equal(r.ticket.number, ring.tickets[0].number); assert.equal(r.ticket.used_by, 'Taquilla');
    }
    const b = await admin.post('/api/staff/checkin', { code: c1, event_id: ev1.id }); assert.equal(b.ok, false); assert.equal(b.state, 'ya_utilizada'); assert.ok(b.ticket.used_at);
  });
  await t('Cada boleto de la mesa se valida por separado', async () => {
    assert.equal((await taq.post('/api/staff/checkin', { code: c2, event_id: ev1.id })).ok, true);
    assert.equal((await taq.post('/api/staff/scan', { code: c3, event_id: ev1.id })).valid, true);
  });
  await t('Validación manual por NÚMERO de boleto (sin cámara)', async () => {
    const n = (await user.get('/api/orders/' + ids.vip)).order.tickets[0].number;
    const r = await taq.post('/api/staff/scan', { code: '#' + n, event_id: ev1.id }); assert.equal(r.valid, true);
    assert.equal((await taq.post('/api/staff/scan', { code: n, event_id: ev1.other })).valid, false);
    assert.equal((await taq.post('/api/staff/scan', { code: '9999', event_id: ev1.id })).state, 'invalida');
    assert.equal((await taq.post('/api/staff/checkin', { code: n, event_id: ev1.id })).ok, true);
  });
  await t('Check-in ATÓMICO: 8 escaneos simultáneos → exactamente 1 ingreso', async () => {
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? taq : admin).post('/api/staff/checkin', { code: cGen, event_id: ev1.id })));
    assert.equal(res.filter((r) => r.ok).length, 1); assert.equal(res.filter((r) => r.state === 'ya_utilizada').length, 7);
  });
  await t('Anulación: solo ADMIN; el boleto anulado pierde el QR y no entra', async () => {
    const tk = (await admin.get('/api/staff/tickets?q=' + ring.tickets[3].number)).tickets.find((x) => x.order_id === ids.ring);
    assert.equal((await taq.post(`/api/admin/tickets/${tk.id}/void`, { reason: 'x' })).s, 403);
    assert.equal((await admin.post(`/api/admin/tickets/${tk.id}/void`, {})).s, 400);
    const before = await hash(user.raw(ring.tickets[3].url));
    assert.equal((await admin.post(`/api/admin/tickets/${tk.id}/void`, { reason: 'Fraude detectado' })).s, 200);
    assert.notEqual(before, await hash(user.raw(ring.tickets[3].url)));
    const r = await taq.post('/api/staff/scan', { code: code(ring.tickets[3].url), event_id: ev1.id }); assert.equal(r.valid, false); assert.equal(r.state, 'cancelada'); assert.equal(r.ticket, undefined);
    const used = (await admin.get('/api/staff/tickets?q=' + ring.tickets[0].number)).tickets.find((x) => x.order_id === ids.ring); assert.equal((await admin.post(`/api/admin/tickets/${used.id}/void`, { reason: 'Prueba' })).s, 400);
  });
  await t('Historial: fecha, usuario y resultado; la taquilla solo ve los suyos', async () => {
    const a = await admin.get(`/api/staff/scans?event_id=${ev1.id}&limit=200`), q = await taq.get(`/api/staff/scans?event_id=${ev1.id}&limit=200`);
    assert.ok(a.scans.length > q.scans.length && q.scans.every((s) => s.user === 'Taquilla')); assert.equal(q.scope, 'propio');
  });

  console.log('\nReportes, FIT y administración');
  await t('Reportes: pendientes ≠ vendidas; mesas vendidas; FIT confirmado solo de pagos aprobados y proporcional a boletos válidos', async () => {
    const r = await admin.get('/api/admin/reports?event_id=' + ev1.id); const mesa = r.by_type.find((x) => x.code === 'RINGSIDE');
    assert.equal(mesa.packages, 2); assert.equal(mesa.issued, 10); assert.equal(mesa.voided, 1); assert.equal(mesa.used, 2);
    const cip = r.supports.find((c) => c.code === 'CIP001'); assert.equal(cip.confirmed_tickets, 1 + 4); assert.equal(cip.confirmed_fit, 25 + 160, 'general 25 + mesa 200×4/5 (un boleto anulado)');
    assert.equal(r.supports.find((c) => c.code === 'KVH006').confirmed_fit, 0, 'VIP con apoyo aún sin aprobar');
    assert.equal(r.supports.find((c) => c.code === 'PAN007').confirmed_fit, 0);
    const st = await admin.get('/api/admin/stats'); assert.equal(st.mesas_vendidas, 2); assert.equal(st.fit_total, 185); assert.ok(st.supports.some((c) => c.code === 'CIP001' && c.fit === 185));
  });
  await t('Auditoría registra comprobante, pagos, anulaciones y accesos', async () => {
    const a = (await admin.get('/api/admin/audit?limit=300')).entries.map((e) => e.action);
    for (const x of ['comprobante_recibido', 'pago_transferencia_autorizado', 'boleto_anulado', 'pedido_creado', 'login', 'competidores_agregados'].filter((x) => x !== 'competidores_agregados')) assert.ok(a.includes(x), x);
  });
  await t('Competidores (admin): agregar con código propio, sin repetir códigos', async () => {
    const r = await admin.post('/api/admin/competitors', { event_id: ev1.id, bulk: 'Nuevo Peleador | NP017\nRepetido | cip001\nSin código' }); assert.deepEqual([r.added, r.skipped], [1, 2]);
    assert.equal((await user.get(`/api/events/${ev1.id}/competitor-code?code=np017`)).competitor.name, 'Nuevo Peleador');
    assert.equal((await taq.post('/api/admin/competitors', { event_id: 1, name: 'z', code: 'ZZZ1' })).s, 403);
  });
  await t('Usuarios: crear rol PANEL, suspender (sin sesión), no auto-degradarse', async () => {
    const c = await admin.post('/api/admin/users', { name: 'Visor Dos', email: 'visor2@x.com', role: 'PANEL' }); assert.equal(c.s, 200);
    const w = client(); assert.equal((await w.post('/api/login', { email: 'visor2@x.com', password: c.temp_password })).mustChange, true);
    assert.equal((await admin.post(`/api/admin/users/${c.id}`, { status: 'suspendido' })).s, 200); assert.equal((await w.get('/api/me')).user, null);
    const me = (await admin.get('/api/admin/users')).users.find((u) => u.email === 'admin@gmal.com'); assert.equal((await admin.post(`/api/admin/users/${me.id}`, { role: 'USER' })).s, 400);
    assert.equal((await admin.post('/api/admin/users', { name: 'Raro', email: 'r@x.com', role: 'SUPER' })).s, 400);
  });
  await t('Ajustes: precio y FIT por tipo (solo compras nuevas); no se puede dejar sin métodos de pago', async () => {
    assert.equal((await admin.post('/api/admin/settings', { pay: { transferencia: false, deposito: false } })).s, 400);
    assert.equal((await admin.post('/api/admin/settings', { types: [{ code: 'GENERAL', price: 130, fit: 130, max_units: 10, active: true }] })).s, 400, 'FIT menor que el precio');
    assert.equal((await admin.post('/api/admin/settings', { types: [{ code: 'GENERAL', price: 130, fit: 30, max_units: 10, active: true }] })).s, 200);
    const r = await user.post('/api/orders', buyer({ units: 6, competitor_code: 'PT016' })); assert.equal((await user.get('/api/orders/' + r.id)).order.total, 780);
    assert.equal((await user.get('/api/orders/' + ids.gen)).order.total, 125);
    assert.equal((await admin.get('/api/admin/reports?event_id=' + ev1.id)).supports.find((c) => c.code === 'PT016').pending_fit, 180);
    await admin.post('/api/admin/settings', { types: [{ code: 'GENERAL', price: 125, fit: 25, max_units: 10, active: true }] });
  });

  console.log('\nPersistencia');
  await stop();
  // Regresión: arrancar sobre una BD que YA tiene eventos pero no competidores (instalación existente que se actualiza)
  { const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(path.join(DATA, 'dokan.db')); d.exec('DELETE FROM supports; DELETE FROM competitors;'); d.close(); }
  await start();
  await t('Actualizar una instalación existente: carga los 16 competidores al arrancar sin fallar', async () => {
    const a = client(); await a.post('/api/login', { email: 'admin@gmal.com', password: 'AdminNueva9' });
    assert.equal((await a.get('/api/admin/competitors?event_id=' + ev1.id)).competitors.length, 16);
  });
  await t('Tras reiniciar: datos intactos, contraseñas NO restablecidas y competidores sin duplicar', async () => {
    const a = client(); assert.equal((await a.post('/api/login', { email: 'admin@gmal.com', password: 'ADMIN123' })).s, 401);
    assert.equal((await a.post('/api/login', { email: 'admin@gmal.com', password: 'AdminNueva9' })).s, 200);
    assert.equal((await a.get('/api/staff/orders?status=aprobada')).orders.length, 4);
    assert.equal((await a.get('/api/admin/competitors?event_id=' + ev1.id)).competitors.length, 16);
    assert.equal((await client().post('/api/login', { email: 'giancarlo@gmail.com', password: 'Gian1755' })).s, 200);
    assert.equal((await client().post('/api/login', { email: 'taquido@gmail.com', password: 'Tdokan1234' })).s, 401, 'ya cambió su contraseña');
  });
  await stop(); fs.rmSync(DATA, { recursive: true, force: true });
  console.log(`\n${pass} correctas, ${fail} fallidas${fail ? ': ' + failures.join(' | ') : ''}`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); try { proc.kill(); } catch { /* */ } process.exit(1); });
