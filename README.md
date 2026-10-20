# Capital Dúo

Aplicación funcional para el capital y las ganancias de Fran y Yane. Proyecto nuevo: la carpeta original estaba vacía. No se recuperaron registros anteriores.

## Abrir localmente

Requiere Node.js 22 o posterior. Desde esta carpeta, ejecutar `npm run dev` y abrir http://localhost:4173. No abrir `index.html` con `file://`: los módulos necesitan HTTP. No requiere instalar dependencias. `npm test` ejecuta las pruebas contables y de seguridad; `npm run check` verifica sintaxis. El navegador necesita Web Locks para guardar de forma segura entre pestañas; si no lo admite, se permite consultar/exportar y se rechaza el guardado sin modificar registros.

## Vista previa aislada

Ejecutar `npm run preview`. Prepara `.preview-dist/` copiando únicamente cinco archivos estáticos y arranca http://127.0.0.1:4174. Este modo fuerza demostración y usa `capital-duo.preview.v1`; nunca lee los libros real/demo normales. No copia respaldos, `.env`, `.git`, documentación, capturas ni archivos del equipo. No abre túneles ni publica. Detener con Ctrl+C.

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

Cada registro es un evento; correcciones y anulaciones agregan eventos con fecha y motivo. Los originales se conservan. Cada cambio reproduce todas las operaciones activas y se rechaza si invalida fondos posteriores. La bitácora local es trazable pero no es resistente a la manipulación del dueño del navegador. No reemplaza un sistema contable certificado.

Importaciones: validación estricta de esquema v1, máximo 5.000.000 bytes UTF-8 / 5.000 eventos, tipos, fechas reales, referencias y reglas contables. Reemplazo explícito después de ofrecer descarga de los datos actuales. No mezcla registros automáticamente. Datos corruptos no se sobrescriben: se ofrece descarga para recuperación. El guardado usa Web Locks por libro y compara la versión anterior dentro del bloqueo: una segunda pestaña con datos desactualizados se rechaza. No cambia de modo ni admite un segundo envío durante un guardado. Si el modo o el libro cambia mientras se lee un respaldo, se cancela la importación. Para compartir registros entre usuarios o dispositivos sigue siendo necesario un backend autenticado con transacciones.

## Interfaz y seguridad

Escenario isométrico SVG nativo, animaciones CSS, sin librerías, fuentes remotas ni servicios externos. Soporta `prefers-reduced-motion`, pausa manual y modo liviano. Formularios legibles, modales nativos, enfoque de teclado y navegación móvil. El contenido externo se valida y escapa antes de presentarse; sin evaluación dinámica. CSP restringe scripts al mismo origen y bloquea conexiones; el servidor agrega `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, política de permisos y `no-store`. Los estilos inline permanecen habilitados para geometría/animación de valores controlados por la aplicación; no se acepta CSS del usuario.

## Límites

Sin política para contabilizar déficit, conciliación de caja, inventario, deudas, autenticación o sincronización. La validación cliente protege la coherencia de esta herramienta local y no representa una barrera de autorización de servidor. Importar un respaldo de otra persona exige confianza en su contenido y revisión de sus totales.
