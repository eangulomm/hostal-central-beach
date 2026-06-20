# Guía de Instalación — Sistema Hotelero Central Beach

Esta guía está pensada para quien compra o recibe el sistema y necesita instalarlo desde cero, sin depender del desarrollador. Sigue los pasos en orden.

## Paso 1 — Crear el Google Sheet

1. Entra a [sheets.google.com](https://sheets.google.com) con tu cuenta de Google.
2. Crea una hoja de cálculo nueva en blanco.
3. Ponle un nombre, por ejemplo: `Central Beach - Base de Datos`.
4. Copia el ID de la hoja desde la URL del navegador. En una URL como:

   ```text
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit
   ```

   el ID es el texto entre `/d/` y `/edit` (en el ejemplo: `1AbCdEfGhIjKlMnOpQrStUvWxYz`). Guárdalo, lo necesitarás en el paso 3.

## Paso 2 — Crear el proyecto de Apps Script

1. Dentro de tu Google Sheet, ve al menú `Extensiones > Apps Script`.
2. Se abrirá una pestaña nueva con un editor de código vacío.

## Paso 3 — Copiar Code.gs

1. Abre el archivo `apps-script/Code.gs` que viene con el sistema.
2. Copia todo su contenido.
3. Pégalo en el editor de Apps Script, reemplazando el contenido por defecto (`Code.gs` o `myFunction`).
4. Busca la línea con `SPREADSHEET_ID` y reemplázala por el ID que copiaste en el Paso 1:

   ```js
   const SPREADSHEET_ID = 'PEGA_AQUI_EL_ID_DE_TU_GOOGLE_SHEET';
   ```

5. Guarda el proyecto (ícono de disquete o `Ctrl/Cmd + S`).

## Paso 4 — Ejecutar setupSheets()

1. En la parte superior del editor de Apps Script, en el selector de funciones, elige `setupSheets`.
2. Pulsa el botón "Ejecutar" (▶).

## Paso 5 — Autorizar permisos

1. Google mostrará una ventana pidiendo autorización.
2. Elige tu cuenta de Google.
3. Si aparece un aviso de "App no verificada", pulsa "Avanzado" y luego "Ir a (nombre del proyecto) (no seguro)". Esto es normal en proyectos personales de Apps Script.
4. Acepta los permisos solicitados (acceso a tu Google Sheet).
5. `setupSheets()` se ejecutará y creará las hojas `Habitaciones`, `Reservaciones`, `Huespedes`, `Pagos`, `Usuarios` y `Configuracion`, con datos de ejemplo. Puedes verificarlo abriendo de nuevo tu Google Sheet.

## Paso 6 — Publicar Web App

1. En el editor de Apps Script, ve a `Implementar > Nueva implementación`.
2. En "Tipo de implementación", elige `Aplicación web`.
3. Configura:
   - **Ejecutar como**: Yo (tu cuenta).
   - **Quién tiene acceso**: normalmente "Cualquier usuario", para que el sistema funcione sin que cada recepcionista necesite una cuenta de Google.
4. Pulsa "Implementar".
5. Es posible que se te vuelva a pedir autorización: acéptala igual que en el Paso 5.

## Paso 7 — Obtener URL /exec

1. Después de implementar, Google muestra una URL que termina en `/exec`.
2. Cópiala completa. Esta es la dirección de tu API y la necesitarás en el siguiente paso.

> Importante: cada vez que vuelvas a cambiar `Code.gs`, deberás crear una nueva implementación (o editar la existente) para que el cambio se publique. La URL `/exec` puede mantenerse igual si editas la implementación existente en lugar de crear una nueva.

## Paso 8 — Configurar API_BASE_URL

1. Abre el archivo `app.js` del sistema (con cualquier editor de texto).
2. Busca, cerca del inicio del archivo, la línea:

   ```js
   const API_BASE_URL = "";
   ```

3. Pega la URL `/exec` que copiaste en el Paso 7:

   ```js
   const API_BASE_URL = "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec";
   ```

4. Guarda el archivo.

## Paso 9 — Abrir el sistema

1. Abre `index.html` haciendo doble clic, o súbelo junto con `styles.css` y `app.js` a un hosting estático (por ejemplo, GitHub Pages, Netlify, o cualquier servidor web simple).
2. En la parte superior del sistema debe aparecer el indicador "Google Sheets activo". Si en cambio dice algo sobre datos simulados, revisa el Paso 8.

## Paso 10 — Verificación final

Antes de entregar el sistema al cliente final, confirma que:

- El Dashboard muestra las habitaciones de ejemplo creadas por `setupSheets()`.
- Puedes crear una habitación nueva desde "Habitaciones".
- Puedes crear un huésped nuevo desde "Huéspedes".
- Puedes crear una reservación de prueba y se refleja en el Calendario.
- Puedes cambiar el estado de la reservación a "check-in" y luego a "check-out".
- Puedes registrar un pago y ver que el saldo pendiente se actualiza.
- Puedes imprimir el cierre diario desde "Reportes".
- Puedes abrir el comprobante de una reservación y enviarlo por WhatsApp.

Para una lista de verificación formal, usa **[CHECKLIST_ENTREGA.md](./CHECKLIST_ENTREGA.md)**.

## Capturas de referencia

Se recomienda adjuntar, junto a esta guía, capturas de pantalla de:

1. La hoja de cálculo de Google Sheets recién creada (Paso 1).
2. El menú `Extensiones > Apps Script` (Paso 2).
3. El editor de Apps Script con `Code.gs` pegado (Paso 3).
4. La ventana de autorización de permisos (Paso 5).
5. La pantalla de "Nueva implementación" con el tipo "Aplicación web" seleccionado (Paso 6).
6. La URL `/exec` ya generada (Paso 7).
7. El indicador "Google Sheets activo" dentro del sistema (Paso 9).

Estas capturas no vienen incluidas en este sprint de documentación; se sugiere generarlas al instalar el sistema en un entorno real, para anexarlas a esta guía.
