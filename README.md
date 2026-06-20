# Sistema Hotelero Central Beach

Sistema web para administrar la operación diaria de un hostal o pequeño hotel: habitaciones, huéspedes, reservaciones, calendario de ocupación, check-in/check-out, pagos, caja y reportes.

No requiere instalación de software, no usa login y no tiene costos de servidor: corre como una página web y guarda los datos en una hoja de Google Sheets, a través de Google Apps Script.

## Descripción

Central Beach es la app que usa el equipo de recepción para saber qué habitaciones están libres, registrar huéspedes, crear reservaciones, hacer el check-in y check-out, cobrar pagos y cerrar la caja del día. Todo desde el navegador, también en el celular.

## Características

- Dashboard con llegadas, salidas, ocupación y pagos del día.
- Gestión de habitaciones (crear, editar, cambiar estado).
- Gestión de huéspedes (crear, editar).
- Reservaciones con validación automática que evita reservar dos veces la misma habitación en fechas que se cruzan.
- Calendario de ocupación visual con colores, navegable por 14 días.
- Check-in y check-out.
- Registro de pagos y consulta de saldo pendiente por reservación.
- Reportes y cierre diario de caja, listo para imprimir.
- Comprobante de reserva imprimible y para enviar por WhatsApp.
- Diseño "Mobile First": funciona bien en celular, tablet y computador.
- Datos guardados en Google Sheets, sin servidores ni bases de datos de pago.

## Requisitos

- Una cuenta de Google (gratuita) para crear el Google Sheet y el Apps Script.
- Un navegador moderno (Chrome, Edge, Safari, Firefox).
- Conexión a internet para que el equipo guarde y lea datos de Google Sheets. (El sistema también puede funcionar en modo de prueba sin internet, usando datos de ejemplo guardados en el navegador, mientras no se configure `API_BASE_URL`.)

## Tecnologías

- Frontend: HTML, CSS y JavaScript, sin frameworks ni instalación.
- Backend / API: Google Apps Script publicado como aplicación web.
- Base de datos: Google Sheets.

## Instalación paso a paso

La guía detallada con todos los pasos, uno por uno, está en **[INSTALACION.md](./INSTALACION.md)**. Resumen rápido:

1. Crear un Google Sheet.
2. Crear un proyecto de Apps Script y pegar `Code.gs`.
3. Ejecutar la función `setupSheets()` una sola vez.
4. Publicar el proyecto como aplicación web.
5. Copiar la URL `/exec` que entrega Google.
6. Pegar esa URL en `API_BASE_URL` dentro de `app.js`.
7. Abrir `index.html` en el navegador.

## Configuración de Google Sheets

`setupSheets()` crea automáticamente, dentro de tu Google Sheet, las hojas:

- `Habitaciones`
- `Reservaciones`
- `Huespedes`
- `Pagos`
- `Usuarios`
- `Configuracion`

También agrega encabezados y datos de ejemplo (habitaciones, huéspedes y reservaciones de prueba). Puedes ejecutar `setupSheets()` más de una vez sin riesgo: no duplica información que ya exista.

## Configuración de Apps Script

1. Abre tu Google Sheet.
2. Ve a `Extensiones > Apps Script`.
3. Pega el contenido de `apps-script/Code.gs`.
4. Reemplaza `SPREADSHEET_ID` por el ID de tu hoja (está en la URL del Sheet, entre `/d/` y `/edit`).
5. Guarda el proyecto.
6. Ejecuta `setupSheets()` y acepta los permisos que solicite Google.

## Publicación Web App

1. En Apps Script, ve a `Implementar > Nueva implementación`.
2. Elige tipo `Aplicación web`.
3. Configura "Ejecutar como: Yo" y "Quién tiene acceso" según lo que necesites (normalmente "Cualquier usuario").
4. Presiona `Implementar`.
5. Copia la URL que termina en `/exec`. Esa es la dirección de tu API.

Cada vez que cambies algo en `Code.gs`, debes crear una nueva versión de la implementación (o editar la existente) para que el cambio quede publicado.

## Configuración de API_BASE_URL

1. Abre el archivo `app.js`.
2. Busca, cerca del inicio del archivo, la línea:

   ```js
   const API_BASE_URL = "";
   ```

3. Pega ahí la URL `/exec` que copiaste:

   ```js
   const API_BASE_URL = "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec";
   ```

4. Guarda el archivo y recarga `index.html` en el navegador.
5. Si la conexión funcionó, en la parte superior del sistema aparecerá el indicador "Google Sheets activo".

## Primer uso

1. Abre `index.html` en el navegador (o publica la carpeta en un hosting estático).
2. Revisa que las habitaciones de ejemplo aparezcan en la sección "Habitaciones". Edítalas o crea las habitaciones reales del hostal.
3. Registra a tus huéspedes reales y borra (o deja, no afecta nada) los datos de ejemplo.
4. Crea una reservación de prueba para confirmar que todo funciona de punta a punta (ver `CHECKLIST_ENTREGA.md`).
5. Comparte `MANUAL_USUARIO.md` con el equipo de recepción.

## Mantenimiento

- El sistema no requiere mantenimiento de servidor: no hay servidor propio.
- Si cambias `Code.gs`, vuelve a publicar la implementación (ver "Publicación Web App").
- Revisa de vez en cuando que la cuenta de Google que publicó el Apps Script siga activa, ya que la Web App corre con sus permisos.
- Si agregas nuevas habitaciones o cambias tarifas, esto se hace directamente desde la pantalla "Habitaciones" del sistema, sin tocar código.

## Backups

- Como toda la información vive en Google Sheets, Google guarda automáticamente un historial de versiones del archivo (`Archivo > Historial de versiones` dentro de Google Sheets).
- Se recomienda además descargar una copia periódica: en Google Sheets, ir a `Archivo > Descargar > Microsoft Excel (.xlsx)` y guardar el archivo en un lugar seguro (por ejemplo, una vez por semana o antes de cambios importantes).
- Antes de ejecutar cambios grandes en `Code.gs` o en la estructura de hojas, haz una copia del Google Sheet completo (`Archivo > Hacer una copia`).

## Preguntas frecuentes

**¿Necesito instalar algo en mi computador?**
No. Solo necesitas un navegador y, para configurarlo la primera vez, una cuenta de Google.

**¿Los datos están seguros?**
Los datos viven en tu propia cuenta de Google Sheets. Solo tú decides quién tiene acceso a esa hoja de cálculo.

**¿El sistema tiene usuarios y contraseñas?**
No. Esta versión no incluye login: cualquier persona con el enlace puede usar el sistema. Si se necesita login, es una mejora a futuro, no incluida en este sprint.

**¿Funciona desde el celular?**
Sí, el diseño es "Mobile First" y se adapta a pantallas pequeñas.

**¿Qué pasa si dos personas reservan la misma habitación al mismo tiempo?**
El sistema valida las fechas y no permite que una habitación tenga dos reservaciones activas que se cruquen en fechas. Si hay conflicto, muestra un aviso y no guarda la reservación.

**¿Puedo agregar más habitaciones o tipos de habitación?**
Sí, desde la pantalla "Habitaciones", sin tocar código.

## Resolución de problemas

| Problema | Posible causa | Qué hacer |
|---|---|---|
| El sistema dice "datos simulados" o no aparece "Google Sheets activo" | `API_BASE_URL` está vacío o mal copiado | Revisa el paso "Configuración de API_BASE_URL" |
| Aparece un error de permisos al ejecutar `setupSheets()` | Apps Script todavía no tiene autorización | Vuelve a ejecutar la función y acepta todos los permisos que pida Google |
| Los cambios en `Code.gs` no se reflejan en el sistema | Falta publicar una nueva versión de la implementación | Repite el paso "Publicación Web App" |
| No se puede reservar una habitación aunque parece libre | Ya existe otra reservación activa que se cruza en fechas | Revisa el calendario de esa habitación o el detalle de la reservación en conflicto |
| El botón de WhatsApp no abre nada | El huésped no tiene un número de teléfono guardado o el formato no es válido | Edita el huésped y agrega su número con código de país |
| La hoja de cálculo no tiene los datos esperados | `setupSheets()` no se ejecutó o se ejecutó en una hoja diferente | Verifica que `SPREADSHEET_ID` en `Code.gs` apunte al Google Sheet correcto y vuelve a ejecutar `setupSheets()` |

## Documentos relacionados

- [MANUAL_USUARIO.md](./MANUAL_USUARIO.md) — guía para el equipo de recepción.
- [INSTALACION.md](./INSTALACION.md) — guía técnica paso a paso de instalación.
- [CHECKLIST_ENTREGA.md](./CHECKLIST_ENTREGA.md) — checklist de entrega al cliente.
