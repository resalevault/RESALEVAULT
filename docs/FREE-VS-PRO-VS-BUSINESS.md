# RESALEVAULT — Free vs Pro vs Business

Matriz real de lo que hace cada plan. **Fuente única de verdad del código:**
`src/shared/plans.ts` (si cambia ahí, cambia aquí).

Leyenda de estados:

- ✅ **Implementada y verificada** — hay pruebas automatizadas que la cubren.
- 🟡 **Implementada, verificación parcial** — funciona, pero no tiene prueba
  propia dedicada o su verificación depende de un entorno no disponible.
- ⛔ **No disponible en este plan** — el límite está aplicado en el proceso
  principal, no solo oculto en la interfaz.
- 🔶 **Pendiente** — anunciada por el producto, aún no está hecha.
- 🧱 **Bloqueada por infraestructura** — necesita un backend que no existe (y
  que no se ha desplegado porque costaría dinero o no está verificado).

---

## 1. Límites numéricos

| Límite | Free | Pro | Business |
|---|---|---|---|
| Artículos (no archivados) | **150** | 20.000 | Ilimitado |
| Archivos (imágenes) | **200** | 50.000 | Ilimitado |
| Llamadas de IA al mes | **0** | 2.000 | Ilimitado |

Estos tres límites se comprueban en **`src/main/ipc/register*.ts`** con
`LicenseService.assertProductQuota()`, `assertUploadQuota()` y
`assertFeature('aiStudio')`. Si alguien usara el canal IPC directamente,
seguiría recibiendo el rechazo.

---

## 2. Free — inventario y ciclo de compra-venta

| Función | Estado |
|---|---|
| Inventario persistente (SQLite, WAL, claves foráneas) | ✅ 501 pruebas + humo |
| Productos, campos, categorías, etiquetas | ✅ |
| Fotos por artículo con miniaturas (hasta 5) | ✅ |
| SKU con dígito de control EAN-13 | ✅ |
| Búsqueda, filtros, orden, paginación (50/pág.) | ✅ medido con 50.000 artículos |
| Compras y costes (gastos de envío, otros, descuento) | ✅ |
| Ventas y pedidos con reserva de stock | ✅ |
| Devoluciones y cancelaciones con reposición | ✅ |
| Bloqueo de ventas duplicadas | ✅ |
| Beneficio y margen (fórmulas documentadas) | ✅ `docs/FORMULAS.md` |
| Gastos e ingresos varios | ✅ |
| Ubicaciones jerárquicas con ruta y stock | ✅ |
| Códigos de barras y etiquetas (Code128 + QR) | ✅ |
| Exportar a CSV (artículos, pedidos, finanzas) | ✅ |
| Copias de seguridad ZIP + restauración en dos fases | ✅ |
| Preferencias e idiomas es/en | ✅ |
| Funciona sin conexión | ✅ |
| Datos persistentes tras reiniciar | ✅ |
| Estados vacíos y errores comprensibles | ✅ |

⛔ **Límites del plan gratuito (aplicados en el proceso principal):**

- ❌ Más de 150 artículos → `PRODUCT_QUOTA_EXCEEDED`
- ❌ Más de 200 archivos → `UPLOAD_QUOTA_EXCEEDED`
- ❌ Importación de CSV → `PLAN_FEATURE_REQUIRED`
- ❌ Edición masiva → `PLAN_FEATURE_REQUIRED`
- ❌ Analítica / informe financiero → `PLAN_FEATURE_REQUIRED`
- ❌ Inteligencia (12 reglas) → `PLAN_FEATURE_REQUIRED`
- ❌ AI Studio → `PLAN_FEATURE_REQUIRED`

Cuando el usuario intenta una función bloqueada, la pantalla muestra una
explicación con enlace a la pestaña **Licencias** (`PlanGate`), no un error
técnico ni una pantalla rota.

> El plan gratuito **no** se recorta para forzar la compra: inventario,
> compras, pedidos, ubicaciones, códigos y copias de seguridad funcionan
> completos.

---

## 3. Pro — todo lo anterior más

| Función | Estado |
|---|---|
| Artículos hasta 20.000 | ✅ |
| Archivos hasta 50.000 | ✅ |
| Edición masiva (cambiar estado, categoría, precio…) | ✅ |
| Importación de CSV con previsualización y duplicados | ✅ |
| Analítica y reporte financiero completo | ✅ |
| Inteligencia: 12 reglas de negocio | ✅ |
| AI Studio BYOK (OpenAI, Anthropic, Gemini) | 🟡 funcional; los proveedores **no se han probado con claves reales** |
| 2.000 llamadas de IA al mes | ✅ medido en `LicenseService` |
| Informes y exportaciones avanzadas | 🟡 exportación CSV completa; **PDF/XLSX 🔶** |
| Alertas de stock estancado y pedidos sin enviar | ✅ reglas locales |
| Previsualización antes de cualquier acción destructiva | ✅ |

**AI Studio — cómo funciona de verdad:**

- La clave la introduce el usuario y se guarda **en el almacén cifrado del
  sistema** (Windows Credential Manager / Keychain / Secret Service). No viaja
  a ningún servidor de RESALEVAULT porque RESALEVAULT no tiene servidor.
- Cada llamada la hace **la aplicación del usuario** a **la API del proveedor
  que él haya elegido**, y esas llamadas **pueden costar dinero en SU cuenta**.
  La interfaz lo advierte antes de ejecutar.
- Sin clave válida no se llama a ningún proveedor. No hay respuestas simuladas.

---

## 4. Business — todo lo anterior más

| Función | Estado |
|---|---|
| Artículos y archivos ilimitados | ✅ |
| Llamadas de IA ilimitadas | ✅ |
| Varios almacenes (ubicaciones jerárquicas con ruta) | ✅ |
| `multiUser: true` y `sync: true` declarados en el plan | ⚠️ **el límite existe, la función no** |
| Roles owner / manager / operator / viewer | 🔶 **pendiente** |
| Auditoría de acciones por usuario | 🔶 **pendiente** (hay tablas y registro de actividad, pero no la UI ni los permisos) |
| Organizaciones multiempresa | 🔶 **pendiente** |
| Sincronización y colaboración en tiempo real | 🧱 **bloqueada** |

### ⚠️ Advertencia honesta sobre Business

El plan Business **está declarado** en `src/shared/plans.ts` y se puede activar
con una licencia válida, pero **la colaboración multiusuario NO funciona**:

- No hay backend desplegado.
- No existe sesión de usuario, ni invitaciones, ni roles aplicados.
- **No se ha desplegado ningún servidor** porque cualquier opción gratuita
  tendría límites que no se pueden prometer a largo plazo, y subir una base de
  datos de clientes a un servicio de terceros sin haber revisado sus condiciones
  sería imprudente.

**Lo que sí hace Business hoy:** mismas capacidades que Pro sin límites de
volumen. Nada más. Esto se indica también en la propia pantalla de licencias.

**Qué haría falta para multiusuario real** (sin coste asegurado, sin prometer):

1. Elegir backend (Cloudflare Workers + D1 o Supabase) y leer sus condiciones
   gratuitas actuales.
2. Modelo de organizaciones con permisos en el servidor, no solo en la app.
3. Sincronización por operaciones identificadas y ordenadas, con control de
   conflictos explícito. **Nunca** copiando la base SQLite activa por carpetas
   compartidas, y **nunca** *last-write-wins* sobre stock o dinero.

---

## 5. Funciones anunciadas que aún no existen

Ninguna de estas aparece como disponible en la aplicación, pero conviene dejarlo
por escrito para que nadie las dé por hechas:

| Función | Estado |
|---|---|
| Publicación automática en Vinted / eBay / Wallapop | 🔶 sin API autorizada, **sin scraping** |
| Seguimiento automático de envíos | 🔶 solo manual/confirmado; ver `docs/SEGUIMIENTO.md` |
| Actualizaciones automáticas | 🔶 ver `docs/FIRMA.md` y Fase 5 |
| Envío de emails de aviso | 🔶 requeriría un servicio de pago |
| Informes PDF y exportación XLSX | 🔶 |
| Devoluciones parciales por línea | 🔶 |
| Multi-divisa con tipos de cambio | 🔶 |

---

## 6. Qué pasa si cambia de plan

- **Cambiar de plan no borra datos.** El plan es una etiqueta sobre la licencia;
  la base de datos no se toca.
- **Caducar una licencia no borra el inventario.** Solo vuelven a aplicarse los
  límites del plan gratuito (y si hay más artículos que el límite, los que ya
  existen **siguen ahí**: no se borra nada, solo se impide crear más).
- **Si el servicio de licencias no responde**, no hay ningún efecto: las
  licencias se verifican **localmente** con criptografía, sin red. Inventario,
  compras, pedidos, ubicaciones, copias y funciones de pago siguen igual (ver
  `docs/LICENCIAS.md`).
- **Nunca se bloquea el acceso del usuario a sus propios datos.** Exportar y
  hacer copia están siempre disponibles.
