# DOKAN · Tickets & Eventos

Venta de entradas **General (Q125)**, **Sillas VIP (Q175)** y **Mesa de 5 personas (Q900 = 5 entradas)**, pago por **transferencia o depósito** con comprobante por WhatsApp, apoyo a competidores por código, boletos con QR de un solo uso, escáner para taquilla y paneles por rol.

## Instalación (Node.js 22.5 o superior)
```bash
npm install            # incluye html5-qrcode (lector del escáner, servido por el propio servidor)
npm start              # http://localhost:3000   (este proyecto NO tiene "npm run dev")
npm test               # 37 pruebas de integración con BD temporal (no toca tus datos)
```
Al arrancar, el servidor **migra la base de datos solo** (agrega tablas/columnas, no borra nada), carga la lista de competidores y crea las cuentas iniciales que falten.

## Roles
| Rol | Qué ve / puede |
|---|---|
| **ADMIN** | Todo: panel en vivo, pagos (autorizar/rechazar), búsqueda y anulación de boletos, escáner, eventos, competidores y códigos, usuarios, precios/FIT, reportes y auditoría |
| **TAQUILLA** | **Solo el escáner** (cámara o número de boleto) y su historial de escaneos |
| **PANEL** (“Taquilla (panel)”) | **Solo un panel** con entradas vendidas / utilizadas / por ingresar. Sin dinero, sin datos de compradores |
| **USER** | Comprar, ver sus compras y compartir sus boletos |

Los permisos se validan **en el servidor** en cada petición. Para dar a TAQUILLA otra vez los pagos, cambia en `server.js` la constante `PAY = ['ADMIN']` por `['ADMIN','TAQUILLA']` (y agrega las páginas al menú).

## Compra
1. **Reglas:** solo **mayores de 18 años** (se valida con la fecha de nacimiento, en pantalla y en el servidor).
2. **Pago:** *Transferencia* o *Depósito*. El **efectivo ya no existe**. Se pide el número de referencia y se muestra: *“Envía tu comprobante al 3596-2132. Sin comprobante no podemos autorizar tu pago”* con botón que abre WhatsApp con el mensaje listo (nombre, monto, referencia). El número se cambia con `PROOF_PHONE` en `.env`.
3. **Autorizar:** el administrador debe marcar *“Recibí el comprobante”*; sin eso el servidor rechaza la autorización. Hasta entonces no existe ningún boleto.
4. **Mesa de 5 personas:** se eligen los 5 nombres o se confirma “todas a mi nombre”. **Queda definitivo**: no hay forma de cambiarlo desde Mis compras ni Boletos.
5. **Apoyar a un competidor (última sección, opcional):** se ingresa un **código** (mayúsculas o minúsculas). Solo se aceptan los 16 códigos cargados (`lib/roster.js`); no se muestra ninguna lista. Los códigos se ven y administran en *Admin → Competidores*.

## FIT
Solo se genera cuando la compra tiene un competidor: **General Q25 · VIP Q45 · Mesa Q200** (por entrada / por mesa). Se guarda en el momento de la compra, el reporte separa FIT **pagado** de **pendiente**, y si se anula un boleto el FIT baja en proporción. Se edita en *Admin → Ajustes* (afecta solo compras nuevas).

## Boleto de un solo uso (“autodestruible”)
- Al registrar el ingreso, el boleto pasa a *utilizado* en una operación atómica y **su imagen se reemplaza por una versión sin QR con el sello “UTILIZADO”**. Igual sucede al anular.
- Si alguien vuelve a presentarlo, el escáner **siempre muestra el resumen**: titular, tipo, número, y fecha/hora/usuario del primer ingreso, y no permite entrar.
- Límite honesto: una captura o el correo que ya se envió conservan su QR original, pero ese código ya no sirve: el segundo escaneo se rechaza.

## Escáner
Admin y Taquilla: eligen el evento, la cámara, y pueden **escribir el número del boleto** si no hay cámara (queda registrado como manual). La cámara exige HTTPS (o localhost).

## WhatsApp
Mensaje con datos reales; en teléfonos se comparte la **imagen del boleto** con el menú nativo (un boleto o toda la mesa). En computadora `wa.me` no adjunta imágenes: se abre el chat con el enlace. Abrir WhatsApp nunca se registra como “enviado”.

## Actualización automática
El panel de administración, la lista de pagos y el panel de taquilla se actualizan solos cuando cambian los datos (cada 8–12 s).

## Datos
SQLite en `data/dokan.db` y boletos en `data/tickets/`. **Respalda `data/`.** El archivo `.env` contiene las contraseñas iniciales: no lo subas a un repositorio.
