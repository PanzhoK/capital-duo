# Verificación del rediseño 3D · Capital Dúo

Revisión local del 20 de octubre de 2026. No se abrió ningún túnel ni se publicó la aplicación. Las pruebas de navegador se realizaron exclusivamente en `http://127.0.0.1:4174`, con demostración forzada y almacenamiento independiente. No se modificaron los registros reales de `localhost:4173`.

## Pruebas automatizadas

- `npm test`: **48/48 aprobadas**, con compilación previa. Contabilidad, persistencia, seguridad del cliente/servidor y reproducción de ventas.
- `npm run typecheck`: sin errores en la escena TypeScript.
- `npm run check`: sintaxis JavaScript comprobada.
- `npm audit --json`: cero vulnerabilidades conocidas informadas por npm en las versiones del lockfile consultado. Esto no cubre vulnerabilidades desconocidas ni el sistema operativo/runtime.
- Comparación contra el checkpoint Git `880fd7a`: `src/ledger.js` conserva íntegro el motor financiero anterior.

Cobertura contable: ejemplo obligatorio ($14 y después $214, pendientes $3/$3), aportes desiguales, costo recuperado no duplicado, 20% de la venta, retiros sin reducir capital, fondos insuficientes, déficit bloqueado, ganancia cero, redondeo entero y conservación para miles de valores, turnos independientes de pesos impares, correcciones/anulaciones/restauraciones y orden retroactivo.

Cobertura de guardado/reproducción: bloqueo entre pestañas y comparación de versión, fallos de espacio, separación real/demo/preview, importaciones que cambian de libro durante su lectura, snapshots inmutables, doble confirmación, replay/skip sin escrituras, cancelación de callbacks obsoletos, reproducción reentrante y movimiento reducido sin temporizadores. Un fallo de presentación posterior al guardado mantiene la venta y no permite reenviarla desde el formulario cerrado.

Seguridad: entradas XSS permanecen escapadas en historial, detalles, atributos y respaldos; JSON con campos inesperados, tipos/montos manipulados, propiedades de prototipo, fechas/referencias inválidas o exceso de bytes/eventos se rechaza sin escribir. HTTP prueba los trece recursos exactos y el bundle local de Three; archivos sensibles, rutas administrativas, fuentes, dependencias, mapas y recorrido de directorios no están disponibles. Se conservan Host/origen estrictos, CSP sin conexiones, solo GET/HEAD y rechazo de WebSocket/CORS de escritura. Detalle y límites en [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## Navegador

Navegador integrado de Codex en 1440×1000, 650×900, 390×844 y 375×812. WebGL activo, un lienzo 3D y sin desborde horizontal en las vistas móviles comprobadas. La escena real muestra isla, negocio y dos bóvedas con volumen. Se ajustaron tamaño/contraste de texto y separación entre controles/saldos; las acciones móviles siguen el flujo de la página para no tapar cifras.

Flujos comprobados con datos de prueba:

- Venta de $20 con costo $10: previa de $4 de reinversión y $6 de ganancia; doble toque genera un solo registro. La animación muestra los importes guardados y sus mitades; repetir y saltar mantienen el mismo número de movimientos.
- Recarga conserva capital y pendientes. Bóveda pulsada en el lienzo abre el detalle correcto; el botón HTML equivalente también funciona.
- Sobrerretiro bloqueado; retiro de $2 reduce solo pendientes. Deshacer agrega anulación y recupera el saldo sin alterar capital.
- Venta con déficit muestra la causa y mantiene la confirmación deshabilitada.
- Vista liviana elimina el lienzo y permite volver a 3D. Con movimiento pausado, venta de $5/costo $0 muestra inmediatamente todos los pasos: reinversión $1 repartida $1/$0 y ganancia $4 repartida $2/$2; deshacer conserva la bitácora.
- Importación del respaldo del ejemplo con revisión de totales y respaldo previo; tras recarga, Fran $12 / Yane $202 / total $214, pendientes $3 por persona.

La serialización, copia íntegra e importación JSON están comprobadas. La API de automatización no confirmó un archivo descargado; no se afirma haber verificado esa descarga. El sonido comienza apagado y exige interacción, pero no se verificó su percepción auditiva.

## Límites y supuestos

No hubo prueba en iPhone físico, Safari, medición de FPS/batería real ni estrés de múltiples dispositivos. Se limita resolución, sombras y renderizado; esto no garantiza un rendimiento concreto en todo hardware. Movimiento reducido se comprobó en el reproductor y mediante pausa manual; no se cambió la preferencia del sistema operativo.

Datos en este navegador, sin cifrado de aplicación, cuentas ni sincronización. Ventas cobradas y costos financiados/recuperados dentro de la misma operación. Capital contable distinto del efectivo disponible. Los déficits siguen bloqueados porque su absorción no está acordada.

La vista previa sirve solo recursos compilados permitidos en loopback. La configuración concreta de un futuro proveedor de túnel, TLS y control de acceso sigue sin comprobarse; requiere otro paso. Cerrar con Ctrl+C el servidor correspondiente, y detener primero cualquier túnel si se crea posteriormente.

## Limpieza y reversión

Se retiraron la escena SVG, los bloques de inicio y el recibo antiguos, imports sin uso y capturas de pruebas del proyecto. Hay una única interfaz y un único cálculo financiero. Fuentes en `src/`; resultados de compilación y dependencias instaladas excluidos de Git. Se conserva el checkpoint local `880fd7a` para revisar/revertir código sin crear copias del proyecto; no contiene datos de almacenamiento del navegador.
