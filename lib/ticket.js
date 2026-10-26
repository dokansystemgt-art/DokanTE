'use strict';
// Genera el boleto (PNG 1066x1600) con el diseño DOKAN: póster arriba, fecha + QR, datos del comprador y patrocinadores.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const QRCode = require('qrcode');

const W = 1066, H = 1600, POSTER_H = 810;
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const FONT = "'Arial Black','Impact','Helvetica Neue',Arial,sans-serif";
const FONT_TXT = "'Segoe UI','Helvetica Neue',Arial,sans-serif";

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fit = (text, max, width, k = 0.56) => Math.max(14, Math.min(max, Math.floor(width / (String(text).length * k))));

function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return { y, m, d };
}
function fmtDMY(iso) {
  const { y, m, d } = parseISO(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
function fmtTime(t) {
  const [h, mi] = String(t || '18:00').split(':').map(Number);
  const ap = h >= 12 ? 'P.M.' : 'A.M.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mi).padStart(2, '0')} ${ap}`;
}
function fmtDPI(d) {
  const s = String(d).replace(/\D/g, '');
  return s.length === 13 ? `${s.slice(0, 4)}-${s.slice(4, 9)}-${s.slice(9)}` : s;
}

function sponsorSlots(rootDir) {
  const dir = path.join(rootDir, 'public', 'img', 'sponsors');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f)).sort().slice(0, 8); } catch { /* sin patrocinadores */ }
  return files.map((f) => path.join(dir, f));
}

// ¿El logo tiene su contorno claro (p. ej. letras blancas)? Entonces va sobre un recuadro oscuro; si no, sobre blanco.
// raw = píxeles RGBA; se mira solo el borde exterior visible del logo (lo que quedaría "perdido" sobre blanco).
function plateIsDark(data, w, h, ch = 4) {
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * ch + 3]);
  let edge = 0, light = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (A(x, y) < 128) continue;
      if (A(x - 1, y) >= 128 && A(x + 1, y) >= 128 && A(x, y - 1) >= 128 && A(x, y + 1) >= 128) continue;
      edge++;
      const i = (y * w + x) * ch;
      if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] > 200) light++;
    }
  }
  return edge > 0 && light / edge > 0.35;
}
async function logoPlate(buf) {
  try {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return plateIsDark(data, info.width, info.height, info.channels);
  } catch { return false; } // ante cualquier duda, recuadro blanco
}

// Distribución de patrocinadores en el pie: hasta 4 en una fila; de 5 a 8 en dos filas. Sin logos: 4 espacios de ejemplo.
function sponsorLayout(n) {
  const count = n === 0 ? 4 : n;
  const GAP = 14, AREA = W - 120;
  const perRow = count <= 4 ? [count] : [Math.ceil(count / 2), Math.floor(count / 2)];
  const ph = perRow.length === 1 ? 84 : 40;
  const boxes = [];
  perRow.forEach((k, r) => {
    const pw = Math.min(230, Math.floor((AREA - GAP * (k - 1)) / k));
    const total = k * pw + GAP * (k - 1);
    const x0 = Math.round((W - total) / 2);
    for (let i = 0; i < k; i++) boxes.push({ x: x0 + i * (pw + GAP), y: 1500 + r * (ph + 6), w: pw, h: ph });
  });
  return boxes;
}

// stamp = { label: 'UTILIZADO', sub: '24/10/2026 6:12 p. m.' } -> el QR se elimina de la imagen (boleto "autodestruido")
async function renderTicket({ number, name, birth, dpi, code, event, typeLabel = '', seqLabel = '', stamp = null }, rootDir) {
  const { d, m, y } = parseISO(event.event_date);
  const mes = MESES[m - 1] || '';
  const mesSize = fit(mes, 80, 400, 0.66);

  // Póster
  let posterBuf;
  const posterPath = event.poster ? path.join(rootDir, 'public', event.poster.replace(/^\/+/, '')) : null;
  if (posterPath && fs.existsSync(posterPath)) {
    posterBuf = await sharp(posterPath).resize(W, POSTER_H, { fit: 'cover', position: 'attention' }).jpeg({ quality: 92 }).toBuffer();
  } else {
    posterBuf = await sharp({ create: { width: W, height: POSTER_H, channels: 3, background: '#06122b' } }).jpeg().toBuffer();
  }

  // QR (negro sobre blanco para que cualquier lector lo detecte)
  const qr = stamp
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="230" height="230"><rect width="230" height="230" fill="#ffffff"/><g transform="rotate(-18 115 115)"><rect x="-10" y="82" width="250" height="66" fill="none" stroke="#d11a1a" stroke-width="6"/><text x="115" y="127" text-anchor="middle" font-family="${FONT_TXT}" font-weight="800" font-size="${String(stamp.label).length > 9 ? 30 : 38}" fill="#d11a1a">${esc(stamp.label)}</text></g><text x="115" y="214" text-anchor="middle" font-family="${FONT_TXT}" font-size="15" fill="#333">${esc(stamp.sub || '')}</text><text x="115" y="30" text-anchor="middle" font-family="${FONT_TXT}" font-size="15" fill="#333">QR NO VÁLIDO</text></svg>`)
    : await QRCode.toBuffer(`DOKAN|${code}`, { errorCorrectionLevel: 'M', margin: 1, width: 230, color: { dark: '#000000', light: '#ffffff' } });

  const chipText = [typeLabel, seqLabel].filter(Boolean).join(' · ').toUpperCase();
  const chipW = Math.min(480, 34 + chipText.length * 15.5);
  const chip = chipText
    ? `<rect x="55" y="172" width="${chipW}" height="44" rx="8" fill="#ffd400"/><text x="${55 + chipW / 2}" y="203" text-anchor="middle" font-family="${FONT_TXT}" font-weight="800" font-size="25" fill="#050505">${esc(chipText)}</text>`
    : '';

  const nameStr = String(name);
  const orgStr = String(event.organizer || '');
  const locStr = String(event.location || '');

  const slots = sponsorSlots(rootDir);
  const boxes = sponsorLayout(slots.length);
  // Cada logo se ajusta (sin deformarse) dentro de su recuadro; el recuadro es blanco u oscuro según el logo.
  const logos = [];
  for (let i = 0; i < slots.length; i++) {
    const buf = await sharp(slots[i]).resize(boxes[i].w - 24, boxes[i].h - 14, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    logos.push({ buf, dark: await logoPlate(buf) });
  }
  const sponsorsSvg = boxes.map((bx, i) => (slots.length
    ? (logos[i].dark
      ? `<rect x="${bx.x}" y="${bx.y}" width="${bx.w}" height="${bx.h}" rx="10" fill="#161616" stroke="#4a4a4a" stroke-width="2"/>`
      : `<rect x="${bx.x}" y="${bx.y}" width="${bx.w}" height="${bx.h}" rx="10" fill="#ffffff"/>`)
    : `<rect x="${bx.x}" y="${bx.y}" width="${bx.w}" height="${bx.h}" rx="10" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="8 6" opacity=".7"/>
    <text x="${bx.x + bx.w / 2}" y="${bx.y + bx.h / 2 + 6}" text-anchor="middle" font-family="${FONT_TXT}" font-weight="700" font-size="17" fill="#fff">TU LOGO AQUÍ</text>`)).join('\n  ')
    + `\n  <text x="${W / 2}" y="1491" text-anchor="middle" font-family="${FONT_TXT}" font-weight="800" font-size="14" letter-spacing="6" fill="#ffd400">PATROCINADORES</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Número de boletín -->
  <text x="55" y="108" font-family="${FONT}" font-weight="900" font-size="72" fill="#fff">${esc(number)}</text>
  <rect x="55" y="120" width="113" height="4" fill="#ffd400"/>
  <text x="57" y="152" font-family="${FONT_TXT}" font-weight="800" font-size="23" fill="#fff" letter-spacing="1">BOLETÍN</text>
  ${chip}

  <!-- Franja fecha + QR -->
  <rect x="0" y="${POSTER_H + 2}" width="${W}" height="${1118 - POSTER_H - 2}" fill="#050505"/>
  <polygon points="0,1060 70,1030 90,1118 0,1118" fill="#ffd400" opacity=".9"/>
  <polygon points="${W},1070 ${W - 70},1040 ${W - 90},1118 ${W},1118" fill="#ffd400" opacity=".9"/>
  <text x="275" y="945" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="150" fill="#fff">${d}</text>
  <text x="275" y="1018" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${mesSize}" fill="#fff">${esc(mes)}</text>
  <text x="275" y="1090" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="80" fill="#ffd400">${y}</text>
  <rect x="533" y="850" width="3" height="235" fill="#ffd400"/>
  <rect x="660" y="842" width="262" height="250" rx="22" fill="#fff" stroke="#ffd400" stroke-width="5"/>

  <!-- Datos -->
  <rect x="0" y="1118" width="${W}" height="352" fill="#fff"/>
  <polygon points="40,1155 485,1155 470,1200 25,1200" fill="#050505"/>
  <polygon points="40,1155 62,1155 47,1200 25,1200" fill="#ffd400"/>
  <text x="110" y="1188" font-family="${FONT_TXT}" font-weight="800" font-size="28" fill="#fff">TITULAR DEL BOLETO</text>
  <polygon points="580,1155 1020,1155 1005,1200 565,1200" fill="#050505"/>
  <polygon points="580,1155 602,1155 587,1200 565,1200" fill="#ffd400"/>
  <text x="658" y="1188" font-family="${FONT_TXT}" font-weight="800" font-size="28" fill="#fff">ORGANIZADO POR:</text>
  <rect x="532" y="1150" width="2" height="296" fill="#c8c8c8"/>

  <text x="60" y="1242" font-family="${FONT_TXT}" font-weight="800" font-size="26" fill="#111">Nombre:</text>
  <text x="60" y="1277" font-family="${FONT_TXT}" font-size="${fit(nameStr, 30, 440)}" fill="#111">${esc(nameStr)}</text>
  <text x="60" y="1327" font-family="${FONT_TXT}" font-weight="800" font-size="26" fill="#111">Fecha de nacimiento:</text>
  <text x="60" y="1360" font-family="${FONT_TXT}" font-size="30" fill="#111">${esc(birth ? fmtDMY(birth) : '—')}</text>
  <text x="60" y="1409" font-family="${FONT_TXT}" font-weight="800" font-size="26" fill="#111">DPI:</text>
  <text x="60" y="1442" font-family="${FONT_TXT}" font-size="30" fill="#111">${esc(dpi ? fmtDPI(dpi) : '—')}</text>

  <text x="604" y="1250" font-family="${FONT_TXT}" font-weight="800" font-size="${fit(orgStr, 34, 410, 0.58)}" fill="#111">${esc(orgStr)}</text>
  <text x="604" y="1312" font-family="${FONT_TXT}" font-weight="800" font-size="26" fill="#111">Horario:</text>
  <text x="604" y="1346" font-family="${FONT_TXT}" font-size="30" fill="#111">${esc(fmtTime(event.event_time))}</text>
  <text x="604" y="1403" font-family="${FONT_TXT}" font-weight="800" font-size="26" fill="#111">Ubicación:</text>
  <text x="604" y="1437" font-family="${FONT_TXT}" font-size="${fit(locStr, 30, 410)}" fill="#111">${esc(locStr)}</text>

  <!-- Pie -->
  <rect x="0" y="1470" width="${W}" height="130" fill="#050505"/>
  <polygon points="0,1478 50,1470 0,1530" fill="#ffd400"/>
  <polygon points="${W},1478 ${W - 50},1470 ${W},1530" fill="#ffd400"/>
  <polygon points="0,1600 70,1600 0,1560" fill="#ffd400"/>
  <polygon points="${W},1600 ${W - 70},1600 ${W},1560" fill="#ffd400"/>
  ${sponsorsSvg}
</svg>`;

  const layers = [
    { input: posterBuf, top: 0, left: 0 },
    { input: Buffer.from(svg), top: 0, left: 0 },
    { input: qr, top: 852, left: 676 },
  ];
  for (let i = 0; i < logos.length; i++) layers.push({ input: logos[i].buf, left: boxes[i].x + 12, top: boxes[i].y + 7 });

  return sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } }).composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

module.exports = { renderTicket, plateIsDark, fmtDMY, fmtTime, fmtDPI, MESES };
