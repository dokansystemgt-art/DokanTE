'use strict';
// Mensajes de WhatsApp. Todo se construye con los datos reales del evento y del boleto (nada escrito a mano).
const { fmtDMY } = require('./ticket');

// 18:00 -> "6:00 P. M."
function fmtTimeWA(t) {
  const [h, m] = String(t || '18:00').split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'P. M.' : 'A. M.'}`;
}
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const pad3 = (n) => String(n).padStart(3, '0');
const eventTitle = (ev) => `${ev.title}${ev.subtitle ? ` — ${ev.subtitle}` : ''}`;

/**
 * @param {{holderName:string, event:object, tickets:Array<{number:number|string, typeName?:string, seq?:number, pkgSize?:number}>}} p
 * Un boleto -> mensaje individual. Varios (paquete) -> mensaje conjunto.
 */
function waMessage({ holderName, event, tickets }) {
  const many = tickets.length > 1;
  const nums = tickets.map((t) => `#${pad3(t.number)}`).join(', ');
  const t0 = tickets[0];
  const typeLine = !many && t0.typeName
    ? `🎫 *Tipo:* ${t0.typeName}${t0.pkgSize > 1 ? ` (entrada ${t0.seq} de ${t0.pkgSize})` : ''}\n`
    : many && t0.typeName ? `🎫 *Tipo:* ${t0.typeName} (paquete de ${tickets.length} entradas)\n` : '';
  return [
    `¡Hola ${firstName(holderName)}! ¡Tu pago fue confirmado! `,
    '',
    many
      ? `Tus entradas para *${eventTitle(event)}* ya están listas.`
      : `Tu entrada para *${eventTitle(event)}* ya está lista.`,
    '',
    `🎟️ *${many ? 'Boletos' : 'Boleto'} ${nums}*`,
    typeLine ? typeLine.trimEnd() : null,
    '',
    `📅 *Fecha:* ${fmtDMY(event.event_date)}`,
    `🕕 *Hora:* ${fmtTimeWA(event.event_time)}`,
    `📍 *Lugar:* ${event.location}`,
    '',
    many
      ? 'Presenta la imagen de cada boleto y su código QR en la entrada del evento.'
      : 'Presenta la imagen de tu boleto y su código QR en la entrada del evento.',
    '',
    `¡Gracias por tu compra! Nos vemos en ${event.title}.`,
  ].filter((l) => l !== null).join('\n');
}

module.exports = { waMessage, fmtTimeWA, firstName, pad3, eventTitle };
