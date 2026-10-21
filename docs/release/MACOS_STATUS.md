# RESALEVAULT — Estado de macOS

Fecha: 21/10/2026

## Situación

La versión de macOS **no se ha podido compilar** desde este entorno y **no se
incluye ningún paquete `.dmg`** en la entrega, porque no existe. Incluir el `.exe`
de Windows renombrado sería un fraude; no se hace.

## Por qué está bloqueado

| Requisito | Disponibilidad desde este PC (Windows 11) |
|---|---|
| `electron-builder` para macOS | ❌ Necesita macOS para empaquetar el `.app` |
| `codesign` (firma) | ❌ Solo existe en macOS |
| `notarytool` (notarización) | ❌ Solo existe en macOS |
| Xcode / herramientas de Apple | ❌ Solo macOS |
| Hardware Apple | ❌ No disponible |

No existe ninguna alternativa **gratuita** que permita firmar y notarizar una app
de macOS desde Windows: la cadena de herramientas de Apple es exclusiva de macOS y
su uso requiere, además, una cuenta de desarrollador Apple (99 EUR/año) para la
distribución directa.

## Qué SÍ se ha dejado preparado (trabajo real, no simulado)

1. **Configuración de compilación** en `electron-builder.yml`:
   - Objetivos `dmg` y `zip`, arquitecturas **x64** y **arm64**.
   - Icono, categoría (`public.app-category.business`), `hardenedRuntime`.
2. **Permisos mínimos** en `build/entitlements.mac.plist`:
   - Solo JIT, memoria ejecutable sin firma (necesarios para Electron y
     `node:sqlite`) y selección de ficheros del usuario. **Nada** de cámara,
     contactos, ubicación ni disco completo.
3. **Compatibilidad del código**: auditoría realizada.
   - Rutas: se usa `app.getPath('userData')` y `node:path`. **Sin** rutas de
     Windows incrustadas ni letras de unidad.
   - Ciclo de vida: `window-all-closed` y `activate` ya contemplan macOS.
   - **Corregido**: la ventana usaba `frame: false`, que en macOS deja al usuario
     sin los botones nativos. Ahora usa `hiddenInset` (semáforo del sistema
     visible) manteniendo la barra propia.
4. **Script listo**: `npm run dist:mac`.

## Qué falta exactamente

1. Un **Mac** con Xcode instalado (o un servicio de compilación macOS).
2. Opcional (para distribución directa sin avisos): una **cuenta de desarrollador
   de Apple** y su certificado (`Developer ID`).

## Cómo completarlo en un Mac

```bash
git clone <repositorio>
npm install
npm run build
npm run dist:mac        # produce .dmg para x64 y arm64
```

Sin certificado, macOS mostrará «desarrollador no identificado» y Gatekeeper
pedirá abrir con **clic derecho → Abrir**. Con una cuenta de Apple, se añade la
firma y la notarización. **No se ha probado ninguna de las dos cosas** porque no
hay un Mac disponible; no se afirma lo contrario.

## Diferencias funcionales esperadas

El código es multiplataforma y no contiene dependencias exclusivas de Windows
(carrieres, IA, base de datos y licencias usan APIs portables). La única
diferencia conocida y deliberada es **cosmética**: en macOS se conservan los
botones de ventana nativos en lugar de dibujarlos la aplicación. Cualquier otra
diferencia solo se podrá confirmar **cuando se compile y pruebe en un Mac**.
