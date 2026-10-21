# RESALEVAULT — Informe de entrega

Versión: **0.5.0**
Fecha: **21/10/2026**
Carpeta de entrega: `RESALEVAULT_RELEASE` (escritorio real del usuario).

Este informe sigue la regla del proyecto: **nada se marca como hecho si no se ha
ejecutado y comprobado**. Cuando algo está bloqueado, se dice y se explica por qué.

---

## A. Estado del producto

### Funcionalidades completadas y verificadas

Todas ellas con pruebas que las ejecutan (unitarias, de integración o de humo
dentro de Electron real):

- **Inventario**: alta, consulta, edición, archivado y borrado; SKU único;
  categorías, marcas, estados y atributos; ubicaciones jerárquicas; fotos y
  documentos adjuntos; búsqueda, filtros, orden y clasificación.
- **Compras**: registro de coste con reparto de gastos y materialización en lotes.
- **Ventas / pedidos**: beneficio **NETO** (descuenta comisiones de plataforma,
  envíos, cargos y devoluciones); no se puede vender dos veces; cancelación y
  devoluciones.
- **Rentabilidad**: informe financiero, margen, beneficio realizado frente a
  potencial; dinero en céntimos enteros (sin errores de redondeo).
- **Categorías y organización**: integridad referencial; no se borra una categoría
  en uso sin control.
- **Etiquetas de envío y documentos**: adjuntar, abrir, sustituir y borrar;
  detección de archivos ausentes; gestión de errores de permisos.
- **Inteligencia**: 12 reglas **locales** (sin inventar precios de mercado).
- **AI Studio (BYOK)**: el usuario aporta su clave; se guarda **cifrada con el
  almacén del sistema operativo**; claves nunca en el paquete ni en los registros.
- **Planes Free / Pro / Business**: límites aplicados en el **proceso principal**,
  no solo en la interfaz.
- **Licencias**: verificación Ed25519 (la app solo lleva la clave **pública**);
  backend online con control de **puestos** y **revocación**.
- **Copias de seguridad** automáticas y manuales; restauración.
- **Shipping Tracker**: navegador aislado con lista blanca de transportistas.
- **Comprar licencia (Discord)**: botón que abre el servidor oficial.
- **Configuración**: idioma es/en, preferencias persistentes, temas, accesibilidad.

### Errores corregidos en este bloque

1. **Paquetes de prueba distribuidos por error**: `out/smoke.cjs`,
   `out/ui-smoke.cjs` y `out/benchmark.cjs` viajaban dentro del paquete de
   producción. Corregido en `electron-builder.yml` y `electron-builder.appx.yml`
   y **verificado** extrayendo el `.asar` y el `.appx`.
2. **Barra de título en macOS**: la ventana usaba `frame: false`, lo que dejaba a
   macOS sin los botones nativos. Corregido con `hiddenInset` + semáforo.

### Problemas que siguen pendientes

- **Cliente online de licencias en la app**: el backend está desplegado y probado
  en vivo, pero la app todavía **valida la licencia solo offline**. La integración
  online (activación de puesto, consulta de revocaciones) **no está hecha**.
- **Firma con CA de confianza pública**: no existe (presupuesto 0 €).
- **Verificación en equipo limpio**: pendiente (ver `KNOWN_ISSUES.md`).

---

## B. Pruebas

| Nivel | Ejecutadas | Superadas | Fallidas | Bloqueadas |
|---|---|---|---|---|
| Unitarias / integración (Vitest) | 469 | 469 | 0 | 0 |
| Humo del proceso principal (`npm run smoke`) | 70 | 70 | 0 | 0 |
| Humo de la interfaz en Electron (`npm run smoke:ui`) | 61 | 61 | 0 | 0 |
| Validación de manifiestos winget (validador oficial) | 1 | 1 | 0 | 0 |
| Instalación real en equipo limpio | — | — | — | **1 (bloqueada)** |

- **Cobertura**: 88.33 % de líneas · 85.74 % de sentencias · 90.85 % de funciones
  · 77.95 % de ramas.
- **Pruebas de seguridad**: el paquete de producción se extrajo y se buscó
  `sb_secret_`, `service_role`, claves privadas y mapas de código → **0 hallazgos**.
- **Pruebas negativas incluidas**: firma de licencia falsificada → 403; puestos
  agotados → 409; licencia revocada → 403; destino de enlace fuera de la lista
  blanca → rechazado; archivo ausente; API de IA no disponible; formularios vacíos.
- **Prueba de extremo a extremo en vivo** contra el backend real de Supabase:
  superada (ver `docs/BACKEND.md`).

**Evidencia**: la instalación real en un equipo limpio está **bloqueada** en este
PC por una política de nivel de firma Enterprise que exige un certificado de CA
público (150–300 €/año). El kit de verificación está listo en
`Windows/verify-install.ps1`.

---

## C. Protección de la propiedad intelectual

Ver el documento dedicado `IP_PROTECTION_REPORT.md`. Resumen honesto:

- **NO se aplicó ofuscación.** Explicación y alternativa legítima en ese informe.
- **Sí se aplicó**: compilación de producción sin mapas de código, sin paquetes de
  prueba, sin secretos; hashes SHA-256 de todos los artefactos; lógica sensible
  (licencias) verificada con clave pública, nunca con la privada.
- **Limitación**: al ser Electron/JavaScript, el código del cliente es legible por
  quien se lo proponga. La protección real está en la arquitectura (backend +
  firma), no en ocultar el cliente.

---

## D. Distribución

Carpeta: `RESALEVAULT_RELEASE\`

### Windows

| Artefacto | Tamaño | SHA-256 |
|---|---|---|
| `RESALEVAULT-Setup-0.5.0.exe` (NSIS, x64) | 117,64 MB | `2CB281A7042802AB160D7AD830707A0033F64B07C8F91CFF092B1E5729E2883F` |
| `RESALEVAULT-Store-0.5.0.appx` (Store, x64) | 160,98 MB | `CA2E1A847AE52B5548D018633A09D8C1A1D0A06C9A9EF0EEE4BDEF62876524D9` |

> Los hashes se calculan sobre **este** artefacto concreto. El instalador NSIS
> **no es reproducible byte a byte** (incrusta marcas de tiempo): una nueva
> compilación da un hash distinto aunque el código sea idéntico.

- **Formato y arquitectura**: NSIS x64 y AppX x64.
- **Estado de firma**: **sin firmar**. No hay certificado de CA. El `.appx` se deja
  sin firmar a propósito para que lo firme Microsoft al publicarlo en la Store.
- **Compatibilidad comprobada**: arranque, datos y desinstalación probados en el
  propio PC de desarrollo. **Instalación desde cero en equipo limpio: pendiente.**

### macOS

| Artefacto | Estado |
|---|---|
| `.dmg` (x64/arm64) | **BLOQUEADO** — no compilable desde Windows |

- La configuración de compilación (`dist:mac`) y los *entitlements* están listos.
- No se incluye ningún `.dmg` porque **no existe**: sería inventarlo.
- Detalle en `MACOS_STATUS.md`.

---

## E. Instrucciones de instalación

### Windows — instalador NSIS

1. Ejecuta `RESALEVAULT-Setup-0.5.0.exe`.
2. Windows mostrará un aviso de SmartScreen ("Windows protegió su PC") porque el
   instalador **no está firmado**. Es esperado.
   - **No desactives ninguna protección.** Si SmartScreen bloquea la ejecución,
     usa la ruta de la Microsoft Store (paquete AppX), que Microsoft firma.
3. La aplicación se instala por usuario en
   `%LOCALAPPDATA%\Programs\RESALEVAULT`.
4. Los datos del usuario viven en `%APPDATA%\RESALEVAULT` y **no se borran** al
   desinstalar.
5. **Requisito**: Windows 10 1809 o superior, 64 bits.

### Windows — paquete AppX (Store)

1. Requiere activar el modo desarrollador o instalar desde la Store.
2. `Add-AppxPackage .\RESALEVAULT-Store-0.5.0.appx`

### Verificación de integridad

```
Get-FileHash .\RESALEVAULT-Setup-0.5.0.exe -Algorithm SHA256
```
Debe coincidir con el valor de `Windows\SHA256SUMS.txt`.

---

## F. Declaración de calidad

### Windows

**COMPILADO, PERO NO VALIDADO COMPLETAMENTE.**

- Existe un instalador real y verificado (hash, formato, contenido sin secretos).
- Faltan: instalación desde cero en equipo limpio, y firma de confianza pública.
- Motivo: la política de este PC exige firma de nivel Enterprise; la alternativa
  gratuita (Microsoft Store) todavía no se ha publicado.

### macOS

**BLOQUEADO.**

- Falta una máquina Apple con Xcode. No hay alternativa gratuita desde Windows.
- Se entrega la configuración de compilación y los permisos, listos para un Mac.
