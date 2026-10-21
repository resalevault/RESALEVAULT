# RESALEVAULT — Auditoría inicial (21/10/2026)

Informe previo a los cambios de este bloque. Cada afirmación está respaldada por
una comprobación real sobre el repositorio, no por la existencia de una pantalla.

---

## 1. Arquitectura real

| Capa | Tecnología | Ubicación |
|---|---|---|
| Proceso principal | Electron 44.9 + TypeScript 5.9 estricto | `src/main` |
| Preload (puente) | contexto aislado, `sandbox: true`, sin `invoke` genérico | `src/preload/index.ts` |
| Código compartido | tipos, esquemas zod, canales IPC, planes | `src/shared` |
| Interfaz | React 19 + Vite 7 (sin dependencias de UI) | `src/renderer/src` |
| Persistencia | `node:sqlite` (integrado en Electron), WAL, FKs ON | `src/main/db` |
| Empaquetado | electron-builder 26 (NSIS + AppX) | `electron-builder*.yml` |
| Pruebas | Vitest + pruebas de humo dentro de Electron real | `tests/`, `scripts/` |

**Decisión clave:** el proceso principal es el único que toca la base de datos.
El renderer sólo puede llamar a canales declarados uno a uno; no existe un
`invoke` genérico. Todas las comprobaciones de plan se hacen en el proceso
principal (una comprobación solo en la interfaz no sería un límite real).

---

## 2. Estado de Git y protección del proyecto

- Repositorio en `C:\Users\16ray\Desktop\RESALEVAULT`; HEAD local en `master`.
- **Nada publicado** (sin remoto, sin releases).
- El historial se conserva íntegro: no se reescribe ni se borra nada.
- `.gitignore` excluye `out/`, `release/`, `dist-winget/`, `coverage/`, `.tmp/`.
- `.env.local` (URL + clave de servicio de Supabase) está **ignorado por Git** y
  **no** se incluye en ningún paquete.

---

## 3. Inventario funcional

### IMPLEMENTADO Y VERIFICADO (con pruebas que lo ejecutan)

Inventario (CRUD, SKU único, ubicaciones jerárquicas, fotos y documentos,
importación/exportación CSV); compras con reparto de costes y materialización de
lotes; pedidos con **beneficio NETO** (descuenta comisiones, envíos, cargos y
devoluciones), devoluciones y cancelación; impedir vender dos veces; informe
financiero; códigos y etiquetas; preparación de pedidos con escaneo; Intelligence
(12 reglas locales); AI Studio BYOK (claves cifradas con el almacén del sistema);
planes Free/Pro/Business con límites aplicados en el proceso principal; licencia
Ed25519 (verificación pura probada); copias de seguridad; Shipping Tracker con
navegador aislado.

### IMPLEMENTADO, PERO NO VERIFICADO CONTRA EL SERVICIO REAL

- **AI Studio contra proveedores reales**: la construcción de peticiones está
  probada (cabeceras, forma del cuerpo, mapeo de errores, coste), pero no se ha
  llamado a Gemini/OpenAI/Anthropic de verdad (requiere clave).
- **Cliente online de licencias**: el backend Supabase está desplegado y probado
  en vivo, **y la app se conecta a él** (canal `license:refresh`, verificado al
  arrancar y bajo demanda desde la pantalla de Licencia), con reglas
  *offline-first*: la firma se verifica siempre en local y un fallo de red nunca
  bloquea la app ni borra datos.
- **Firma con CA de confianza pública**: no existe (0 €). Instalación local
  bloqueada por política de nivel de firma Enterprise.

### INCOMPLETO O AUSENTE (alcance de este bloque)

1. **Botón «Comprar licencia» / «Buy license»** en la pantalla de licencias →
   **no existe**. Es un requisito obligatorio de este bloque.
2. **Mecanismo IPC para abrir el enlace externo** desde la interfaz → no existe
   un canal dedicado; hoy solo existe el manejador de `window.open` en el proceso
   principal (para enlaces internos del navegador integrado), no invocable desde
   React.
3. **Copia del enlace al portapapeles** con confirmación al usuario → no existe
   canal dedicado (el módulo de seguimiento escribe al portapapeles, pero no hay
   uno reutilizable desde la interfaz de licencias).
4. **Configuración de compilación para macOS** → no existe objetivo `mac` en
   electron-builder.
5. **Auditoría de rutas exclusivas de Windows** → pendiente de revisar.
6. **Carpeta `RESALEVAULT_RELEASE`** → no existe.

---

## 4. Riesgos detectados en la auditoría

| Riesgo | Estado |
|---|---|
| Obfuscación solicitada en FASE 7 | **Se rechaza** (ver informe de protección). Es una técnica de packer/crypter, y en este proyecto **aumenta** las detecciones heurísticas, lo que perjudica la validación de winget y la certificación de la Store. |
| Compilación de macOS en Windows | **Bloqueado**: `codesign`/`notarytool` solo existen en macOS. Se prepara la configuración y se documenta el bloqueo. |
| Sin certificado de CA | Distribución limitada a GitHub + winget + Store (ruta gratuita). |

---

## 5. Plan de este bloque

1. Implementar el botón de compra por Discord (IPC dedicado, i18n es/en, pruebas).
2. Añadir configuración de compilación para macOS y auditar rutas Windows-only.
3. Aplicar higiene de producción (sin mapas de código en el paquete, sin
   secretos) y generar hashes de los artefactos.
4. Ejecutar toda la batería de pruebas y registrar resultados.
5. Crear `RESALEVAULT_RELEASE` en el escritorio real con artefactos verificados y
   documentación; bloques bloqueados, documentados honestamente.
