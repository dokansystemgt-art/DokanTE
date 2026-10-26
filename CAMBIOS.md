# Cambios de esta versión (resumen técnico)

## Archivos
| Archivo | Cambio |
|---|---|
| `server.js` | Migraciones idempotentes, roles ADMIN/USER/TAQUILLA, registro sin verificación, recuperación de contraseña, tipos de entrada/precios, métodos de pago, competidores y apoyos, emisión por paquete, escáner atómico, reportes, usuarios, ajustes, auditoría, cabeceras de seguridad |
| `lib/ticket.js` | El boleto muestra tipo (`RINGSIDE · 2/5`), titular y maneja datos vacíos |
| `lib/messages.js` | **Nuevo.** Mensaje de WhatsApp con datos reales |
| `public/app.js` | Reescrito sobre la misma estructura: compra con tipos/competidor/pago, boletos con compartir, paneles ADMIN/TAQUILLA, escáner, reportes, usuarios, ajustes |
| `public/style.css` | Capa móvil (menú inferior, controles táctiles, tablas apiladas, modales como hoja inferior) |
| `test/run.js` | **Nuevo.** 39 pruebas de integración |
| `package.json`, `.env`, `.env.example`, `README.md` | `html5-qrcode`, variables `SEED_*`, documentación |

## Decisiones a tener en cuenta
- **Los boletos se emiten al confirmar el pago**, no al comprar (así no existe un QR válido de algo no pagado). Mientras tanto la compra muestra sus entradas como "pendiente de pago" y los reportes separan *pendientes* de *vendidas*.
- Un pedido = un tipo de entrada. Para mezclar General + VIP se hacen dos compras.
- Evento: el campo `price` queda solo por compatibilidad; los precios viven en `ticket_types`.
- Apoyo a competidor: se guarda al comprar; el reporte separa lo **pagado** de lo **pendiente**.
- Se corrigieron de paso: `/api/config` exponía la cuenta bancaria sin sesión; una solicitud rechazada no podía reenviarse; el registro permitía sobrescribir la contraseña de una cuenta sin verificar.


---
# Actualización 2 (esta versión)
- **Efectivo eliminado** (servidor rechaza `efectivo`; la interfaz ya no lo ofrece). Se agrega **Depósito a cuenta**.
- **Mayoría de edad** obligatoria (18+) al comprar.
- **Competidor por código** (16 códigos de `lib/roster.js`), opcional y última sección. Se eliminó el buscador con lista.
- **Comprobante por WhatsApp** al 35962132 (`PROOF_PHONE`); el servidor exige la confirmación “comprobante recibido” para autorizar.
- **Mesa de 5**: nombres definitivos (se eliminó la ruta `/api/orders/:id/holders`). El tipo se muestra como “Mesa 5 personas”.
- **Boleto autodestruible**: sello UTILIZADO/ANULADO sin QR; reescaneo siempre muestra resumen.
- **FIT** por tipo (25/45/200) solo con competidor; reportes y panel admin.
- **Roles**: TAQUILLA solo escáner; nuevo rol PANEL (`Taquido@gmail.com`) de solo lectura.
- **Panel en vivo** (auto-actualización) y corrección de una carrera al navegar rápido entre pantallas.
- Anti-duplicados ahora compara también la referencia de pago (antes podía fusionar dos mesas distintas).
