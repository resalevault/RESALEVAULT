# RESALEVAULT â€” Informe de entrega

VersiÃ³n: **0.5.0**
Fecha: **21/10/2026**
Carpeta de entrega: `RESALEVAULT_RELEASE` (escritorio real del usuario).

Este informe sigue la regla del proyecto: **nada se marca como hecho si no se ha
ejecutado y comprobado**. Cuando algo estÃ¡ bloqueado, se dice y se explica por quÃ©.

---

## A. Estado del producto

### Funcionalidades completadas y verificadas

Todas ellas con pruebas que las ejecutan (unitarias, de integraciÃ³n o de humo
dentro de Electron real):

- **Inventario**: alta, consulta, ediciÃ³n, archivado y borrado; SKU Ãºnico;
  categorÃ­as, marcas, estados y atributos; ubicaciones jerÃ¡rquicas; fotos y
  documentos adjuntos; bÃºsqueda, filtros, orden y clasificaciÃ³n.
- **Compras**: registro de coste con reparto de gastos y materializaciÃ³n en lotes.
- **Ventas / pedidos**: beneficio **NETO** (descuenta comisiones de plataforma,
  envÃ­os, cargos y devoluciones); no se puede vender dos veces; cancelaciÃ³n y
  devoluciones.
- **Rentabilidad**: informe financiero, margen, beneficio realizado frente a
  potencial; dinero en cÃ©ntimos enteros (sin errores de redondeo).
- **CategorÃ­as y organizaciÃ³n**: integridad referencial; no se borra una categorÃ­a
  en uso sin control.
- **Etiquetas de envÃ­o y documentos**: adjuntar, abrir, sustituir y borrar;
  detecciÃ³n de archivos ausentes; gestiÃ³n de errores de permisos.
- **Inteligencia**: 12 reglas **locales** (sin inventar precios de mercado).
- **AI Studio (BYOK)**: el usuario aporta su clave; se guarda **cifrada con el
  almacÃ©n del sistema operativo**; claves nunca en el paquete ni en los registros.
- **Planes Free / Pro / Business**: lÃ­mites aplicados en el **proceso principal**,
  no solo en la interfaz.
- **Licencias**: verificaciÃ³n Ed25519 (la app solo lleva la clave **pÃºblica**);
  backend online con control de **puestos** y **revocaciÃ³n**.
- **Copias de seguridad** automÃ¡ticas y manuales; restauraciÃ³n.
- **Shipping Tracker**: navegador aislado con lista blanca de transportistas.
- **Comprar licencia (Discord)**: botÃ³n que abre el servidor oficial.
- **ConfiguraciÃ³n**: idioma es/en, preferencias persistentes, temas, accesibilidad.

### Errores corregidos en este bloque

1. **Paquetes de prueba distribuidos por error**: `out/smoke.cjs`,
   `out/ui-smoke.cjs` y `out/benchmark.cjs` viajaban dentro del paquete de
   producciÃ³n. Corregido en `electron-builder.yml` y `electron-builder.appx.yml`
   y **verificado** extrayendo el `.asar` y el `.appx`.
2. **Barra de tÃ­tulo en macOS**: la ventana usaba `frame: false`, lo que dejaba a
   macOS sin los botones nativos. Corregido con `hiddenInset` + semÃ¡foro.

### Problemas que siguen pendientes

- **Cliente online de licencias**: la app **sÃ­** se conecta al backend (canal
  `license:refresh`, verificado al arrancar y bajo demanda). Es *offline-first*:
  la firma se verifica siempre en local y la red solo controla puestos y
  revocaciones; un fallo de red nunca bloquea la app ni borra datos.
- **Firma con CA de confianza pÃºblica**: no existe (presupuesto 0 â‚¬).
- **VerificaciÃ³n en equipo limpio**: pendiente (ver `KNOWN_ISSUES.md`).
- **ActualizaciÃ³n automÃ¡tica**: no existe todavÃ­a; la actualizaciÃ³n es manual
  (ver `KNOWN_ISSUES.md` Â§7).

---

## B. Pruebas

| Nivel | Ejecutadas | Superadas | Fallidas | Bloqueadas |
|---|---|---|---|---|
| Unitarias / integraciÃ³n (Vitest) | 509 | 509 | 0 | 0 |
| Humo del proceso principal (`npm run smoke`) | 70 | 70 | 0 | 0 |
| Humo de la interfaz en Electron (`npm run smoke:ui`) | 65 | 65 | 0 | 0 |
| ValidaciÃ³n de manifiestos winget (validador oficial) | 1 | 1 | 0 | 0 |
| InstalaciÃ³n real en equipo limpio | â€” | â€” | â€” | **1 (bloqueada)** |

- **Cobertura**: 88.66 % de lÃ­neas Â· 86.00 % de sentencias Â· 90.75 % de funciones
  Â· 78.40 % de ramas.
- **Matiz del humo (70 vs 66)**: en esta mÃ¡quina salen **70** comprobaciones porque
  existe la clave privada de emisiÃ³n (`tools/keys/license-private.pem`, no
  versionada); 4 de ellas firman y validan una licencia de prueba. En un **clon
  limpio** sin esa clave salen **66** (esas 4 se omiten por diseÃ±o, no fallan).
  El nÃºmero esperado en CI es **66**.
- **Pruebas de seguridad**: el paquete de producciÃ³n se extrajo y se buscÃ³
  `sb_secret_`, `service_role`, claves privadas y mapas de cÃ³digo â†’ **0 hallazgos**.
- **Pruebas negativas incluidas**: firma de licencia falsificada â†’ 403; puestos
  agotados â†’ 409; licencia revocada â†’ 403; destino de enlace fuera de la lista
  blanca â†’ rechazado; archivo ausente; API de IA no disponible; formularios vacÃ­os.
- **Prueba de extremo a extremo en vivo** contra el backend real de Supabase:
  superada (ver `docs/BACKEND.md`).

**Evidencia**: la instalaciÃ³n real en un equipo limpio estÃ¡ **bloqueada** en este
PC por una polÃ­tica de nivel de firma Enterprise que exige un certificado de CA
pÃºblico (150â€“300 â‚¬/aÃ±o). El kit de verificaciÃ³n estÃ¡ listo en
`Windows/verify-install.ps1`.

---

## C. ProtecciÃ³n de la propiedad intelectual

Ver el documento dedicado `IP_PROTECTION_REPORT.md`. Resumen honesto:

- **NO se aplicÃ³ ofuscaciÃ³n.** ExplicaciÃ³n y alternativa legÃ­tima en ese informe.
- **SÃ­ se aplicÃ³**: compilaciÃ³n de producciÃ³n sin mapas de cÃ³digo, sin paquetes de
  prueba, sin secretos; hashes SHA-256 de todos los artefactos; lÃ³gica sensible
  (licencias) verificada con clave pÃºblica, nunca con la privada.
- **LimitaciÃ³n**: al ser Electron/JavaScript, el cÃ³digo del cliente es legible por
  quien se lo proponga. La protecciÃ³n real estÃ¡ en la arquitectura (backend +
  firma), no en ocultar el cliente.

---

## D. DistribuciÃ³n

Carpeta: `RESALEVAULT_RELEASE\`

### Windows

| Artefacto | TamaÃ±o | SHA-256 |
|---|---|---|
| `RESALEVAULT-Setup-0.5.0.exe` (NSIS, x64) | 117,67 MB | `39de1695e34c7b0d262864a6f8b545a0e6955239a381e30d97083999db7c4b51` |
| `RESALEVAULT-Store-0.5.0.appx` (Store, x64) | 160,98 MB | `448e7bc8ac42d6b2c9e15ef0c3518d4da3741bc4c53e9e08d257c2bca3e893d3` |

> Los hashes se calculan sobre **este** artefacto concreto. El instalador NSIS
> **no es reproducible byte a byte** (incrusta marcas de tiempo): una nueva
> compilaciÃ³n da un hash distinto aunque el cÃ³digo sea idÃ©ntico.

> **Vigencia (21/10/2026):** estos artefactos **ya incluyen el cliente online de
> licencias** y se comprobaron extrayendo el `app.asar` del instalador y del
> `.appx`: contienen la lÃ³gica del cliente (`seats_exhausted`, `online_verified`,
> el canal `license:refresh`), la clave **publishable** y **ningÃºn** `sb_secret_`.
> Los manifiestos de winget se regeneraron con el hash nuevo y **volvieron a pasar
> el validador oficial de Microsoft**.

- **Formato y arquitectura**: NSIS x64 y AppX x64.
- **Estado de firma**: el **instalador** estÃ¡ firmado con un certificado
  **autofirmado** (`Get-AuthenticodeSignature` â†’ `UnknownError`: la firma es
  vÃ¡lida, la raÃ­z no es de confianza pÃºblica). No hay certificado de CA, asÃ­ que
  lo previsible es un aviso de SmartScreen. El `.appx` se deja **sin firmar** a
  propÃ³sito para que lo firme Microsoft al publicarlo en la Store.
- **Compatibilidad comprobada**: arranque, datos y desinstalaciÃ³n probados en el
  propio PC de desarrollo. **InstalaciÃ³n desde cero en equipo limpio: pendiente.**

### macOS

| Artefacto | Estado |
|---|---|
| `.dmg` (x64/arm64) | **BLOQUEADO** â€” no compilable desde Windows |

- La configuraciÃ³n de compilaciÃ³n (`dist:mac`) y los *entitlements* estÃ¡n listos.
- No se incluye ningÃºn `.dmg` porque **no existe**: serÃ­a inventarlo.
- Detalle en `MACOS_STATUS.md`.

---

## E. Instrucciones de instalaciÃ³n

### Windows â€” instalador NSIS

1. Ejecuta `RESALEVAULT-Setup-0.5.0.exe`.
2. Windows mostrarÃ¡ un aviso de SmartScreen ("Windows protegiÃ³ su PC") porque el
   instalador **no estÃ¡ firmado**. Es esperado.
   - **No desactives ninguna protecciÃ³n.** Si SmartScreen bloquea la ejecuciÃ³n,
     usa la ruta de la Microsoft Store (paquete AppX), que Microsoft firma.
3. La aplicaciÃ³n se instala por usuario en
   `%LOCALAPPDATA%\Programs\RESALEVAULT`.
4. Los datos del usuario viven en `%APPDATA%\RESALEVAULT` y **no se borran** al
   desinstalar.
5. **Requisito**: Windows 10 1809 o superior, 64 bits.

### Windows â€” paquete AppX (Store)

1. Requiere activar el modo desarrollador o instalar desde la Store.
2. `Add-AppxPackage .\RESALEVAULT-Store-0.5.0.appx`

### VerificaciÃ³n de integridad

```
Get-FileHash .\RESALEVAULT-Setup-0.5.0.exe -Algorithm SHA256
```
Debe coincidir con el valor de `Windows\SHA256SUMS.txt`.

---

## F. DeclaraciÃ³n de calidad

### Windows

**COMPILADO, PERO NO VALIDADO COMPLETAMENTE.**

- Existe un instalador real y verificado (hash, formato, contenido sin secretos).
- Faltan: instalaciÃ³n desde cero en equipo limpio, y firma de confianza pÃºblica.
- Motivo: la polÃ­tica de este PC exige firma de nivel Enterprise; la alternativa
  gratuita (Microsoft Store) todavÃ­a no se ha publicado.

### macOS

**BLOQUEADO.**

- Falta una mÃ¡quina Apple con Xcode. No hay alternativa gratuita desde Windows.
- Se entrega la configuraciÃ³n de compilaciÃ³n y los permisos, listos para un Mac.
