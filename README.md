# Capital Dúo

Aplicación local para el capital y las ganancias de Fran y Yane, presentada como una isla de gestión 3D. Este rediseño conserva el libro, sus claves de almacenamiento, su formato de respaldo y las reglas financieras existentes. La entrega inicial comenzó sin registros previos; la aplicación no puede recuperarlos automáticamente.

## Abrir localmente

Requiere Node.js 22 o posterior. Desde esta carpeta, instalar con `npm ci --ignore-scripts` y ejecutar `npm run dev`; abrir http://localhost:4173. El comando compila y sirve exclusivamente los recursos permitidos de `dist/`, en loopback; no inicia un servidor de desarrollo ni abre un túnel. No abrir `index.html` con `file://`: los módulos necesitan HTTP. Detener con Ctrl+C.

`npm run build` genera `dist/`; `npm test` compila y ejecuta las pruebas contables, de reproducción y seguridad; `npm run check` comprueba sintaxis JavaScript; `npm run typecheck` comprueba la escena TypeScript. El navegador necesita Web Locks para guardar de forma segura entre pestañas; si no lo admite, se permite consultar/exportar y se rechaza el guardado sin modificar registros.

## Vista previa aislada

Ejecutar `npm run preview`. Compila y prepara `.preview-dist/` copiando únicamente los trece recursos estáticos de la lista permitida; arranca http://127.0.0.1:4174. Este modo fuerza demostración y usa `capital-duo.preview.v1`; nunca lee los libros real/demo normales. No copia respaldos, `.env`, `.git`, documentación, capturas, fuentes TypeScript, dependencias instaladas ni archivos del equipo. No abre túneles ni publica. Detener con Ctrl+C.

`npm run build:preview` solo prepara esos archivos. El servidor conserva en memoria una lista exacta de recursos; no hay API, proxy, ejecución de comandos ni lectura de rutas solicitadas por el visitante. Solo acepta GET/HEAD, Host loopback con puerto exacto y solicitudes de origen permitido. Rechaza WebSocket, métodos de escritura, enmarcado y conexiones del frontend.

Para un futuro túnel, el destino será únicamente `http://127.0.0.1:4174`, con Host de upstream `127.0.0.1:4174`. `CAPITAL_DUO_PREVIEW_ORIGIN` permite declarar un solo origen HTTPS exacto cuando se conozca el enlace; por defecto está vacío. Se rechazan comodines, credenciales, rutas, puertos adicionales y listas de orígenes. Esta variable no abre conexiones, no habilita CORS y no cambia el bind ni Host. No usar el puerto 4173 ni servir la raíz del proyecto. La configuración real del proveedor sigue pendiente de revisar antes de abrir cualquier túnel. Véase [informe de seguridad](SECURITY_REVIEW.md).

## Contabilidad

- Montos en CLP enteros positivos; costos pueden ser cero. Máximo $1.000.000.000.000 por movimiento. Se validan enteros seguros y acumulaciones.
- Aporte: aumenta exclusivamente el capital del aportante.
- Venta: el costo debe poder financiarse con el capital conjunto anterior. Reinversión = venta / 5, redondeada al peso más cercano mediante aritmética BigInt. Ganancia = venta − costo − reinversión. El costo recuperado no se suma otra vez.
- Reinversión y ganancias se reparten por mitades; los pesos impares alternan destinatario empezando por Fran, con contadores independientes. Los turnos se reconstruyen cronológicamente al recalcular.
- Ganancia negativa: registro bloqueado hasta acordar e implementar una política de absorción del déficit. No hay reparto ficticio.
- Retiro: reduce solo la ganancia pendiente de la persona; nunca el capital. No permite sobregiros.
- El capital contable no es una medición de efectivo en caja. Se asume que cada venta registrada ya está cobrada y que su costo se financió y recuperó en la misma operación. No gestiona inventario ni costos de operaciones abiertas.
- Fecha contable elegida por el usuario; orden por fecha y, ante empate, por orden original de registro. Fechas predeterminadas de Chile. Correcciones mantienen la posición original ante empates.

## Persistencia y privacidad

Datos en `localStorage`, clave `capital-duo.real.v1`; demostración independiente en `capital-duo.demo.v1`. Empieza en registros reales vacíos. No hay backend, cuentas ni sincronización. Dos dispositivos o navegadores no comparten datos. Los datos locales y respaldos JSON no están cifrados por la aplicación. Usar un dispositivo de confianza y respaldar periódicamente. El origen local y el publicado tienen almacenamientos separados: transferir usando exportación/importación.

Abrir un libro no escribe registros. Una demostración nueva comienza en memoria; el primer movimiento guarda el ejemplo y el cambio juntos bajo Web Locks, para no sobrescribir la inicialización de otra pestaña. Si el navegador deniega el acceso al almacenamiento, la interfaz muestra una alerta y bloquea guardados; habilitar el almacenamiento y recargar permite recuperar los registros existentes.

Cada registro es un evento; correcciones y anulaciones agregan eventos con fecha y motivo. Los originales se conservan. Cada cambio reproduce todas las operaciones activas y se rechaza si invalida fondos posteriores. La bitácora local es trazable pero no es resistente a la manipulación del dueño del navegador. No reemplaza un sistema contable certificado.

Importaciones: validación estricta de esquema v1, máximo 5.000.000 bytes UTF-8 / 5.000 eventos, tipos, fechas reales, referencias y reglas contables. Reemplazo explícito después de ofrecer descarga de los datos actuales. No mezcla registros automáticamente. Datos corruptos no se sobrescriben: se ofrece descarga para recuperación. El guardado usa Web Locks por libro y compara la versión anterior dentro del bloqueo: una segunda pestaña con datos desactualizados se rechaza. No cambia de modo ni admite un segundo envío durante un guardado. Si el modo o el libro cambia mientras se lee un respaldo, se cancela la importación. Para compartir registros entre usuarios o dispositivos sigue siendo necesario un backend autenticado con transacciones.

## Interfaz, estructura y seguridad

Three.js dibuja geometría real local: isla, negocio central, bóvedas, monedas y árboles. El renderizado se detiene en reposo, fuera de pantalla y al ocultar la pestaña. Los efectos limitan su frecuencia y resolución; no hay texturas, fuentes remotas, telemetría ni servicios externos. La escena se carga bajo demanda. Si WebGL falla se activa explícitamente la vista liviana; formularios, saldos y navegación permanecen fuera del lienzo. Se respetan movimiento reducido y pausa manual. Tranquilo es el ambiente inicial y Fiesta añade partículas breves; el sonido requiere activación explícita y empieza apagado en cada visita.

La venta se persiste antes de animarse. Saltar o repetir solo reproduce una copia inmutable del resultado contable; nunca vuelve a guardar. Los importes y sus mitades proceden del único motor financiero, incluidos los turnos de redondeo. Deshacer agrega una anulación trazable y se bloquea si deja movimientos posteriores sin fondos.

`src/ledger.js` centraliza contabilidad y validación; `storage.js` conserva las claves y lectura segura; `app.js` coordina formularios/guardado; `animation.js` reproduce resultados sin escrituras; `game-ui.js` y `views.js` presentan los datos; `scene.ts` se ocupa únicamente del mundo 3D. `scripts/build.mjs` empaqueta Three en un único módulo local con esbuild. Versiones fijadas y lockfile versionado; `dist/`, `.preview-dist/` y `node_modules/` se generan y están excluidos de Git. Se retiraron la escena SVG, las tarjetas principales y el recibo anterior; no hay pantallas paralelas ocultas.

El contenido externo se valida y escapa antes de presentarse; sin evaluación dinámica. CSP restringe scripts al mismo origen y bloquea conexiones; el servidor agrega `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, política de permisos y `no-store`. Se mantiene el límite de 256 KB por recurso salvo `scene.js`, limitado expresamente a 1,5 MB por incluir Three; no amplía rutas ni acceso a archivos. Los estilos inline permanecen habilitados para geometría/animación de valores controlados por la aplicación; no se acepta CSS del usuario.

## Límites

Sin política para contabilizar déficit, conciliación de caja, inventario, deudas, autenticación o sincronización. La validación cliente protege la coherencia de esta herramienta local y no representa una barrera de autorización de servidor. Importar un respaldo de otra persona exige confianza en su contenido y revisión de sus totales.
