# Capital Dúo · Revisión de seguridad posterior al rediseño 3D

20 de octubre de 2026. Revisión del proyecto actual y sus servicios locales. No se abrió ningún túnel ni se publicó la aplicación. No se leyó ni modificó el almacenamiento real del navegador. Las sondas se limitaron a estos servidores y a servidores efímeros del propio proyecto. Se consultaron avisos npm y documentación oficial de Node, sin pruebas sobre sistemas externos.

**Estado final: acceso externo BLOQUEADO preventivamente.** Node v22.22.2 es anterior a correcciones posteriores, y el fabricante anuncia otro parche de gravedad alta para la línea 22 el 21 de octubre. La aplicabilidad del aviso aún no detallado a esta aplicación no se puede confirmar. No se actualizó la instalación global; la vista previa compilada queda preparada y su listener 4174 se dejó cerrado.

## Superficie que se expondría

- Frontend estático: exactamente trece recursos permitidos, precargados en memoria. Incluyen HTML, CSS, módulos locales y Three.js empaquetado en scene.js; sin CDN, fuentes remotas, telemetría o conexiones externas del frontend. CSP mantiene connect-src 'none'.
- Puerto 4173: aplicación personal, ligada exclusivamente a 127.0.0.1. Aunque el comando se llama dev, sirve la compilación estática; no hay HMR ni servidor de desarrollo expuesto.
- Puerto 4174: vista previa aislada, ligada exclusivamente a 127.0.0.1, con artefactos de .preview-dist y PREVIEW_ONLY=true obligatorio. Usa capital-duo.preview.v1; no lee los libros real/demo del servicio personal. Cada visitante tendría datos en su propio navegador, sin acceso a los registros del dueño.
- No existen API, base de datos, administración remota, usuarios/sesiones de servidor, WebSocket, proxy ni endpoints de escritura. La aplicación no ejecuta comandos recibidos por HTTP. Los comandos de compilación/verificación son locales y usan argumentos controlados por el proyecto.
- No se sirven la raíz del proyecto, .env, .git, metadatos de hosting, fuentes, mapas, node_modules, documentación o respaldos. No se encontraron .env, claves privadas ni credenciales en los archivos propios revisados. Los nombres Fran/Yane y los ejemplos son contenido intencional de la aplicación; los registros reales no forman parte del build.
- No hay autenticación ni contabilidad compartida. Las validaciones cliente mantienen coherencia local; no constituyen autorización de servidor. Una futura versión compartida necesitaría otra arquitectura de autenticación y transacciones.

## Hallazgos de esta revisión y correcciones

| Hallazgo | Gravedad | Corrección y comprobación |
| --- | --- | --- |
| Inicializar una demostración nueva escribía sin bloqueo. Una pestaña lenta podía sobrescribir un cambio de otra pestaña durante esa primera carga. | Baja; integridad de demo/preview. La carga de registros reales no realizaba esa escritura. | src/storage.js ya no escribe al cargar. El ejemplo queda en memoria; el primer movimiento persiste bajo Web Locks y comparación de versión. Tres regresiones prueban inicio/recarga, conservación del libro concurrente y lectura sin sobrescrituras. |
| El getter localStorage se evaluaba fuera del try del lector. Si el navegador denegaba ese acceso, el arranque abortaba. | Baja; disponibilidad local. | src/app.js obtiene el almacenamiento dentro de try. Ante denegación muestra alerta e interfaz restringida, bloquea guardados y no toca datos previos. Regresión con getter denegado y cero lecturas/escrituras del libro original. |
| Una petición de 8.086 bytes con muchos encabezados podía ocultar Content-Length por truncamiento y recibir 200, incumpliendo la prohibición de cuerpos. | Baja; protocolo del servidor estático. Sin proxy, escrituras ni explotación de request smuggling demostrada. | Límite explícito de 100 encabezados y rechazo 431 al alcanzar ese umbral, antes de confiar en los encabezados. Regresión del caso original y fronteras 99/100: 99 aceptados, 100 rechazados. |
| Runtime Node v22.22.2 anterior a parches de seguridad y aviso oficial de gravedad alta aún pendiente para la línea 22. | Alta según el aviso del fabricante; exposición de esta aplicación no confirmada. | Se bloquea configurar cualquier origen público en createStaticServer antes de crear el listener. La demo local sigue permitida, pero su servidor se dejó detenido. Actualizar/revisar Node y levantar el bloqueo exige un paso posterior; no hay bandera de entorno para omitirlo. |

Los dos fallos de almacenamiento se reprodujeron con datos ficticios, sin afectar datos reales. No se modificaron las fórmulas, el esquema de respaldos, las claves existentes ni las dependencias. No se confirmó explotación remota en la app; el pendiente del runtime impide aprobar la publicación.

Se contrastaron los avisos oficiales de [junio](https://nodejs.org/en/blog/vulnerability/june-2026-security-releases), [julio](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases) y [octubre](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). Los fallos publicados de HTTP/2, TLS y WebCrypto requieren APIs/configuraciones que este servidor estático HTTP/1 no utiliza. Eso acota los casos conocidos; no demuestra que el aviso de octubre sea inaplicable, pues todavía no detalla los fallos ni la versión corregida.

El aviso de julio describe además CVE-2026-58044 en proxies que reenvían mensajes con cabeceras truncadas. Este proyecto no reenvía solicitudes. La prueba local sí detectó la desviación de su propia política de cuerpos descrita arriba y se corrigió, sin afirmar que se haya explotado ese CVE.

Los controles de la revisión anterior siguen comprobados: Host/origen estrictos, rutas literales, aislamiento de demo, Web Locks al guardar, límite UTF-8, fechas reales, CSP/anti-framing y rechazo de entradas inválidas. No se presentan como vulnerabilidades nuevas.

## Pruebas posteriores y resultados

- npm test: **55/55 aprobadas**, con compilación previa. npm run typecheck y npm run check: aprobados. git diff --check: sin errores.
- npm audit --json: **0 vulnerabilidades conocidas informadas** para las versiones del lockfile consultadas. No se instalaron actualizaciones ni se usaron correcciones forzadas. Runtime local identificado: Node v22.22.2; npm audit no certifica el runtime.
- Once pruebas HTTP: trece recursos exactos y tamaños; .env, .git, hosting, servidor, fuentes, dependencias, respaldos, API/admin/debug, traversal simple/doble/codificado, variantes de Windows/ADS/case y mapas inaccesibles. GET/HEAD siguen funcionando; métodos de escritura, WebSocket y CONNECT no habilitan acceso. Las cadenas de destino ajeno se enviaron únicamente al servidor del proyecto, sin conectarse a esos destinos.
- Host ausente/duplicado/ajeno, origen ajeno y Fetch Metadata cross-site se rechazan. Cuatro variantes de encabezados de proxy no amplían rutas ni puertos. Encabezados excesivos reciben 431; chunked, framing ambiguo y destinos absolutos reciben 400. El servidor sigue respondiendo después.
- Verificación sobre los servicios realmente abiertos: solo 127.0.0.1:4173 y 127.0.0.1:4174. En ambos, trece rutas sensibles dan 404, Host inválido 421 y origen ajeno 403; los módulos servidos coinciden con las fuentes corregidas. El runtime del 4174 fuerza demo y el del 4173 conserva la aplicación personal.
- Navegador, exclusivamente en 4174: descripción de formulario con cierre de textarea, imagen con onerror y SVG con onload. Historial, detalle, exportación y copia previa a importar mantienen el contenido como texto: cero nodos ejecutables y cero diálogos de script observados.
- Respaldo de prueba con ID que intenta romper un atributo, descripción y motivo maliciosos: importación validada y texto escapado; el ID conserva su valor sin crear marcado. JSON con __proto__ se rechaza y, tras recarga, los saldos permanecen intactos.
- Contabilidad/persistencia: aporte de prueba, venta V=20/C=10 (reinversión 4, ganancia 6), doble toque con un único registro, replay/skip sin otra venta, recarga, retiro válido y sobrerretiro bloqueado, deshacer y déficit bloqueado. Las pruebas del motor también cubren aportes desiguales, redondeos, correcciones/anulaciones y respaldos de ida y vuelta.
- Al terminar se importó demostración limpia: tres movimientos del ejemplo, capital Fran $12 / Yane $202 / total $214 y pendientes $3/$3. No quedan payloads de auditoría en la demostración entregada.
- Cierre real comprobado: se detuvo la vista previa y 4174 rechazó conexiones. Tras comprobarla, se dejó detenida al identificar el pendiente de Node. El servidor personal 4173 permanece local.

## Exposición futura y cierre

La compilación de vista previa queda preparada en .preview-dist. Para repetir pruebas exclusivamente locales: npm run preview en http://127.0.0.1:4174. Al terminar esta revisión ese puerto está cerrado. Solo se sirven los trece recursos permitidos, con límite de 256 KB por recurso salvo scene.js, limitado expresamente a 1,5 MB. No se amplió ningún control global.

Una vez resuelto y revisado el bloqueo del runtime, el futuro túnel deberá dirigir un único hostname HTTPS exclusivamente a http://127.0.0.1:4174 y conservar Host de upstream 127.0.0.1:4174. No deberá apuntar al 4173, al sistema de archivos, a un proxy, a otros puertos ni a una interfaz pública de depuración. El validador de CAPITAL_DUO_PREVIEW_ORIGIN solo admite un origen HTTPS exacto y rechaza comodines, listas, rutas, credenciales y puertos adicionales; **actualmente incluso un origen válido impide iniciar el servidor** por el bloqueo preventivo. Configurarlo no abre conexiones ni permite CORS.

**La configuración ejecutable del proveedor de túnel, su TLS y su control de acceso no están disponibles y no se han verificado. El acceso externo queda pendiente de ese paso; no se considera validado por estas pruebas locales.** La política vigente rechaza navegaciones cross-site; introducir la dirección directamente evita esa condición sin relajar controles.

Para cerrar un futuro acceso: detener primero el túnel y después Ctrl+C en npm run preview; verificar que 4174 deja de escuchar. No es necesario borrar registros, alterar seguridad global ni detener servicios ajenos. El cierre de 4174 sí se comprobó en esta revisión.

## Limitaciones y riesgos pendientes

Los datos locales y respaldos no tienen cifrado de aplicación. Una persona o extensión con acceso al perfil del navegador puede leerlos o alterarlos; la bitácora no prueba autenticidad contra el dueño del dispositivo. No hay cuentas ni sincronización. La vista previa es para datos de demostración.

La consulta npm no cubre vulnerabilidades desconocidas, todos los problemas del runtime/OS o del futuro proveedor. Los avisos Node se revisaron por documentación, sin intentar explotar sus fallos. No hubo pentest externo, pruebas de carga/agotamiento, Safari/iPhone físico ni estrés de múltiples navegadores reales. La serialización, copia e importación JSON están verificadas; la API del navegador no confirmó un archivo descargado, por lo que esa descarga no se da por comprobada.

Archivos modificados en esta revisión: src/app.js, src/storage.js, server.mjs, scripts/preview.mjs, pruebas de seguridad cliente/HTTP y nuevo tests/storage-security.test.mjs; documentación de seguridad, validación y almacenamiento. Reversión de código mediante Git, sin migrar ni eliminar registros del navegador. Esta revisión reduce riesgos comprobados; no garantiza seguridad total.
