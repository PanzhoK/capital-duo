# Verificación de Capital Dúo

La auditoría local posterior del 20 de octubre de 2026 se documenta en [SECURITY_REVIEW.md](SECURITY_REVIEW.md): 34 pruebas aprobadas, servidor endurecido, guardado con Web Locks y vista previa obligatoriamente de demostración. Los resultados siguientes corresponden a la entrega inicial.

## Resultado

11 pruebas Node pasan. Sintaxis de `app.js` y `ledger.js` validada con `node --check`. Sin dependencias de ejecución o instalación.

Cobertura: ejemplo obligatorio ($14 y luego $214, pendientes $3/$3), aportes desiguales, costo no duplicado, retiros sin alterar capital, sobrerretiro, costo financiado exclusivamente por capital, déficit bloqueado, ganancia cero, redondeo para 5.000 valores, alternancia de pesos impares, correcciones/anulaciones/restauraciones, orden por fecha, referencias y fechas inválidas, respaldo ida y vuelta, almacenamiento fallido y cambio concurrente de pestaña. Se verificó acumulación entera hasta el límite de 5.000 eventos.

## Navegador

Probado en el navegador integrado de Codex con vistas 1440×1000 y 390×844. La vista móvil no desborda horizontalmente. No equivale a una prueba en un iPhone físico o Safari.

Flujos comprobados desde formularios: aporte, venta con costo y reparto previo, aporte desigual, persistencia después de recargar, corrección trazable, bloqueo de sobrerretiro, retiro válido, bloqueo explícito de déficit, recibo animado de la venta, cambio a demo e importación de un archivo JSON con confirmación. La importación del ejemplo muestra y guarda capital Fran $12 / Yane $202 y pendientes $3/$3. Los datos de prueba se usaron en el origen `127.0.0.1`, separados del origen de entrega `localhost`.

La API de automatización del navegador integrado no confirmó el evento de descarga. La aplicación ofrece descarga estándar y una alternativa de copia íntegra del JSON para navegadores que la bloqueen. La serialización y recuperación de respaldos sí están comprobadas; no se afirma haber verificado un archivo descargado por esa API.

## Revisión de seguridad

Esquema de importación estricto; límite 5 MB y 5.000 eventos; montos enteros, fechas reales y referencias válidas; reproducción contable antes de guardar; rechazo de operaciones que invalidan movimientos posteriores. Contenido externo escapado. Scripts del mismo origen y sin evaluación dinámica. Sin secretos, telemetría, dependencias externas ni transmisión de registros a un servidor.

Almacenamiento local sin cifrado de aplicación ni autenticación, apropiado para uso personal en dispositivo de confianza. La bitácora conserva originales pero no es inalterable para el propietario del navegador. La auditoría posterior agregó Web Locks para serializar escrituras del mismo libro entre pestañas; no hay sincronización entre dispositivos.

## Entrega y publicación

Aplicación local en `http://localhost:4173`; iniciar desde esta carpeta con `npm run dev`. El sitio privado de Sites fue registrado pero no publicado en la entrega inicial. La revisión de seguridad posterior se realizó exclusivamente de forma local por instrucción del usuario, sin publicación ni túneles. La vista previa aislada se prepara con `npm run preview` en el puerto 4174; cualquier acceso externo requiere un paso posterior y revisar su configuración real.

## Supuestos

CLP sin centavos. Ventas cobradas y costos financiados/recuperados dentro de la misma operación. No hay efectivo conciliado, inventario, deudas ni sincronización. El déficit no tiene una regla acordada y se bloquea. Proyecto nuevo porque no había código ni registros en la carpeta.
