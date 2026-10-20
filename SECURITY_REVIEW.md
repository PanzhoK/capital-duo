# Capital Dúo · Revisión local de seguridad

20 de octubre de 2026. Alcance: este proyecto y sus servidores loopback. No se abrió ningún túnel, no se publicó y no se probaron sistemas externos. No se accedió al almacenamiento real del navegador; las pruebas usaron memoria ficticia y el puerto aislado 4174.

## Superficie revisada

- Frontend estático: `index.html`, `app.js`, `ledger.js`, `style.css`, `runtime.js`. No hay API, usuarios/sesiones de servidor, rutas administrativas, base de datos, WebSocket, telemetría ni conexiones externas del frontend.
- Servidor local 4173: aplicación personal. Se reemplazó el servidor anterior por uno estático endurecido, manteniendo origen y claves de datos existentes.
- Vista previa 4174: exclusivamente `.preview-dist`, cinco archivos conocidos precargados en memoria. `runtime.js` exige demostración y un libro independiente; no permite alternar a reales. Los visitantes no reciben el almacenamiento del dueño ni un libro compartido.
- Código/configuración/archivos ocultos: sin `.env`, claves privadas ni credenciales encontradas en los archivos revisados. Las capturas existentes contienen demostración; respaldos de pruebas y metadatos de hosting quedan fuera de los recursos públicos. La búsqueda de patrones no constituye una garantía de ausencia de secretos.
- `npm ls --all --offline`: cero dependencias npm. Node local: v22.22.2. No se consultaron registros ni bases externas de CVE, por la restricción de trabajar localmente; la vigencia de seguridad del runtime queda sin verificar.

## Hallazgos y correcciones

| Hallazgo | Gravedad en el contexto previsto | Corrección y evidencia |
| --- | --- | --- |
| Host sin validación en el servidor anterior | Media al exponerlo | Solo loopback:puerto exacto, rechaza Host ausente/duplicado/ajeno; ignora encabezados de proxy. Pruebas HTTP locales. |
| URL malformada podía lanzar una excepción fuera del manejador | Media, disponibilidad | Se eliminó el parseo URL de entradas HTTP. Rutas literales en Map, errores controlados. Solicitudes malformadas devuelven 400 y el servicio sigue respondiendo. El fallo anterior se identificó por código; no se derribó el servicio original para demostrarlo. |
| No existía una entrada obligatoriamente aislada de demostración | Media, configuración | Otro puerto, artefacto estático y namespace `capital-duo.preview.v1`; sin lecturas de libros reales/demo normales, sin botón ni acción de cambio. No se confirmó una fuga remota de datos reales en la versión anterior. |
| Dos pestañas podían perder una escritura simultánea | Media, integridad | Web Locks exclusivo por libro, comparación de versión dentro del bloqueo, rechazo del segundo envío y del cambio de modo mientras guarda. Falla cerrada sin soporte del navegador. |
| Cambio de modo durante lectura asíncrona de un respaldo | Baja | Captura modo/versión antes de leer y cancela al detectar cambios. Regresión con promesa diferida y cero escrituras. |
| Límite de respaldo medía caracteres, no bytes | Baja | Máximo 5.000.000 bytes UTF-8 al importar y antes de guardar. Se rechaza el ejemplo multibyte de más de 9 MB que antes pasaba esa capa; el selector de archivos ya controlaba bytes. Exportación JSON compacta para conservar el mismo límite al recuperar el respaldo. |
| Fecha imposible aceptada en la bitácora por normalización de Date.parse | Baja | Fecha y hora ISO reales, manteniendo timestamps válidos de los respaldos anteriores. |
| Faltaban restricciones de enmarcado y conexiones innecesarias | Baja, defensa adicional | CSP por encabezado con frame-ancestors/connect-src none; DENY, nosniff, no-referrer, permisos restringidos y no-store. |

No se encontró XSS ejecutable, inyección de comandos, recorrido de directorios ni endpoints administrativos expuestos en las comprobaciones realizadas. No se detectaron hallazgos graves/críticos confirmados dentro de este alcance local.

## Pruebas posteriores

`npm test`: **34/34 aprobadas**. `npm run check`: aprobado. Las pruebas HTTP crean servidores efímeros exclusivamente en 127.0.0.1 y los cierran al terminar.

- 30 rutas denegadas: `.env`, `.git/config`, metadatos de hosting, código servidor, README, respaldos, capturas, traversal literal/codificado, propiedades heredadas, `/api`, `/admin`, depuración y rutas típicas de servidores de desarrollo.
- Host inválido/duplicado/ausente, origen ajeno, Fetch Metadata cross-site, métodos POST/PUT/PATCH/DELETE/OPTIONS, cuerpo GET, WebSocket y CONNECT a otro puerto: sin acceso. GET/HEAD y assets permitidos siguen funcionando. Se verificaron bind, límites y encabezados.
- JSON con tipos/montos/fechas inválidos, claves inesperadas, `__proto__`, 20.000 niveles de anidamiento, Unicode sobredimensionado y referencias manipuladas: rechazado sin modificar registros.
- En navegador real, solo en 4174: descripción de formulario y respaldo con `</textarea>`, `<img onerror>`, `<svg onload>`, IDs con ruptura de atributo y motivos maliciosos. Cero nodos ejecutables insertados y cero diálogos de script; el texto se conserva escapado en historial, detalle y respaldo previo.
- También se rechazó en la interfaz el JSON con `__proto__`, conservando el capital $215. Al terminar se importó una demostración limpia con el ejemplo obligatorio, dejando $214 y pendientes $3/$3; no quedan payloads de auditoría en la vista previa entregada.
- Ejemplo obligatorio tras importar: capital Fran $12 / Yane $202, pendiente $3 por persona. Retirar $4 se bloquea; retirar $3 deja el capital total $214 intacto. Recarga conserva el resultado. Tras el cambio a Web Locks, venta de $5 y costo $0 produce reinversión $1, ganancias $4, repartos conservados y guardado correcto.
- Pruebas del motor cubren aportes desiguales, ventas, 20% de la venta, reinversión, retiros, redondeos, déficits, correcciones/anulaciones, persistencia y respaldos. Pruebas con locks ficticios verifican serialización y conservación ante fallos de espacio. No se afirma haber hecho una prueba real de estrés entre múltiples navegadores.

## Exposición futura y cierre

`npm run preview` prepara e inicia únicamente `http://127.0.0.1:4174`. El futuro túnel debe dirigir un solo hostname HTTPS a ese destino, conservando Host de upstream `127.0.0.1:4174`. Nunca debe apuntar al 4173, a la raíz del proyecto ni permitir TCP arbitrario, otros puertos o interfaces de inspección públicas.

Cuando se conozca el enlace, `CAPITAL_DUO_PREVIEW_ORIGIN` puede declarar su único origen HTTPS exacto para las solicitudes de módulos. Por defecto no está configurado. La validación rechaza comodines, rutas, listas, credenciales y puertos adicionales; no amplía Host, bind, CORS ni destinos. Se probaron estos rechazos y el origen exacto mediante encabezados locales, sin resolver ni visitar dominios externos.

**La configuración concreta del proveedor del túnel, su TLS, acceso/autenticación y reglas de ingreso aún no se han comprobado. El acceso externo queda pendiente de esa revisión en el paso posterior.** No se deben desactivar los controles de este servidor para hacerlo funcionar.

Para cerrar: detener primero el proceso del túnel cuando exista y luego Ctrl+C en la terminal de `npm run preview`. El manejador cierra conexiones y servidor. Verificar que el puerto 4174 ya no esté en LISTENING. No es necesario borrar datos del navegador ni modificar controles globales. Reiniciar la vista previa requiere volver a ejecutar el comando.

## Límites y archivos

Los datos locales y respaldos no están cifrados por la aplicación; la bitácora no garantiza autenticidad frente al dueño del dispositivo. No hay autenticación de una contabilidad compartida. Navegadores sin Web Locks pueden consultar/exportar pero no guardar. No se verificaron Safari/iPhone físico, volumen adversarial de tráfico, vulnerabilidades actuales del runtime ni protección del futuro proveedor. La descarga por la API del navegador integrado no quedó confirmada; sí su serialización, importación y alternativa de copia completa.

Cambios: `server.mjs`, `package.json`, `.gitignore`, `dist/app.js`, `dist/ledger.js`, `dist/index.html`, nuevo `dist/runtime.js`, scripts de compilación/vista previa, tres suites de seguridad, fixtures de prueba y documentación. No se añadieron dependencias ni se migraron/eliminaron registros reales.
