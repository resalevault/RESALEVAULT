# RESALEVAULT â€” Free vs Pro vs Business

Matriz real de lo que hace cada plan. **Fuente Ãºnica de verdad del cÃ³digo:**
`src/shared/plans.ts` (si cambia ahÃ­, cambia aquÃ­).

Leyenda de estados:

- âœ… **Implementada y verificada** â€” hay pruebas automatizadas que la cubren.
- ðŸŸ¡ **Implementada, verificaciÃ³n parcial** â€” funciona, pero no tiene prueba
  propia dedicada o su verificaciÃ³n depende de un entorno no disponible.
- â›” **No disponible en este plan** â€” el lÃ­mite estÃ¡ aplicado en el proceso
  principal, no solo oculto en la interfaz.
- ðŸ”¶ **Pendiente** â€” anunciada por el producto, aÃºn no estÃ¡ hecha.
- ðŸ§± **Bloqueada por infraestructura** â€” necesita un backend que no existe (y
  que no se ha desplegado porque costarÃ­a dinero o no estÃ¡ verificado).

---

## 1. LÃ­mites numÃ©ricos

| LÃ­mite | Free | Pro | Business |
|---|---|---|---|
| ArtÃ­culos (no archivados) | **150** | 20.000 | Ilimitado |
| Archivos (imÃ¡genes) | **200** | 50.000 | Ilimitado |
| Llamadas de IA al mes | **0** | 2.000 | Ilimitado |

Estos tres lÃ­mites se comprueban en **`src/main/ipc/register*.ts`** con
`LicenseService.assertProductQuota()`, `assertUploadQuota()` y
`assertFeature('aiStudio')`. Si alguien usara el canal IPC directamente,
seguirÃ­a recibiendo el rechazo.

---

## 2. Free â€” inventario y ciclo de compra-venta

| FunciÃ³n | Estado |
|---|---|
| Inventario persistente (SQLite, WAL, claves forÃ¡neas) | âœ… 509 pruebas + humo |
| Productos, campos, categorÃ­as, etiquetas | âœ… |
| Fotos por artÃ­culo con miniaturas (hasta 30; 25 MB por archivo) | âœ… |
| SKU con dÃ­gito de control EAN-13 | âœ… |
| BÃºsqueda, filtros, orden, paginaciÃ³n (50/pÃ¡g.) | âœ… medido con 50.000 artÃ­culos |
| Compras y costes (gastos de envÃ­o, otros, descuento) | âœ… |
| Ventas y pedidos con reserva de stock | âœ… |
| Devoluciones y cancelaciones con reposiciÃ³n | âœ… |
| Bloqueo de ventas duplicadas | âœ… |
| Beneficio y margen (fÃ³rmulas documentadas) | âœ… `docs/FORMULAS.md` |
| Gastos e ingresos varios | âœ… |
| Ubicaciones jerÃ¡rquicas con ruta y stock | âœ… |
| CÃ³digos de barras y etiquetas (Code128 + QR) | âœ… |
| Exportar a CSV (artÃ­culos, pedidos, finanzas) | âœ… |
| Copias de seguridad ZIP + restauraciÃ³n en dos fases | âœ… |
| Preferencias e idiomas es/en | âœ… |
| Funciona sin conexiÃ³n | âœ… |
| Datos persistentes tras reiniciar | âœ… |
| Estados vacÃ­os y errores comprensibles | âœ… |

â›” **LÃ­mites del plan gratuito (aplicados en el proceso principal):**

Los cÃ³digos de error reales son dos: `plan_limit_reached` (lÃ­mite de cantidad) y
`license_required` (funciÃ³n reservada a un plan de pago). Fuente:
`src/shared/types.ts`.

- âŒ MÃ¡s de 150 artÃ­culos â†’ `plan_limit_reached`
- âŒ MÃ¡s de 200 archivos â†’ `plan_limit_reached`
- âŒ ImportaciÃ³n de CSV â†’ `license_required`
- âŒ EdiciÃ³n masiva â†’ `license_required`
- âŒ AnalÃ­tica / informe financiero â†’ `license_required`
- âŒ Inteligencia (12 reglas) â†’ `license_required`
- âŒ AI Studio â†’ `license_required`

Cuando el usuario intenta una funciÃ³n bloqueada, la pantalla muestra una
explicaciÃ³n con enlace a la pestaÃ±a **Licencias** (`PlanGate`), no un error
tÃ©cnico ni una pantalla rota.

> El plan gratuito **no** se recorta para forzar la compra: inventario,
> compras, pedidos, ubicaciones, cÃ³digos y copias de seguridad funcionan
> completos.

---

## 3. Pro â€” todo lo anterior mÃ¡s

| FunciÃ³n | Estado |
|---|---|
| ArtÃ­culos hasta 20.000 | âœ… |
| Archivos hasta 50.000 | âœ… |
| EdiciÃ³n masiva (cambiar estado, categorÃ­a, precioâ€¦) | âœ… |
| ImportaciÃ³n de CSV con previsualizaciÃ³n y duplicados | âœ… |
| AnalÃ­tica y reporte financiero completo | âœ… |
| Inteligencia: 12 reglas de negocio | âœ… |
| AI Studio BYOK (OpenAI, Anthropic, Gemini) | ðŸŸ¡ funcional; los proveedores **no se han probado con claves reales** |
| 2.000 llamadas de IA al mes | âœ… medido en `LicenseService` |
| Informes y exportaciones avanzadas | ðŸŸ¡ exportaciÃ³n CSV completa; **PDF/XLSX ðŸ”¶** |
| Alertas de stock estancado y pedidos sin enviar | âœ… reglas locales |
| PrevisualizaciÃ³n antes de cualquier acciÃ³n destructiva | âœ… |

**AI Studio â€” cÃ³mo funciona de verdad:**

- La clave la introduce el usuario y se guarda **en el almacÃ©n cifrado del
  sistema** (Windows Credential Manager / Keychain / Secret Service). No viaja
  a ningÃºn servidor de RESALEVAULT porque RESALEVAULT no tiene servidor.
- Cada llamada la hace **la aplicaciÃ³n del usuario** a **la API del proveedor
  que Ã©l haya elegido**, y esas llamadas **pueden costar dinero en SU cuenta**.
  La interfaz lo advierte antes de ejecutar.
- Sin clave vÃ¡lida no se llama a ningÃºn proveedor. No hay respuestas simuladas.

---

## 4. Business â€” todo lo anterior mÃ¡s

| FunciÃ³n | Estado |
|---|---|
| ArtÃ­culos y archivos ilimitados | âœ… |
| Llamadas de IA ilimitadas | âœ… |
| Varios almacenes (ubicaciones jerÃ¡rquicas con ruta) | âœ… |
| `multiUser: true` y `sync: true` declarados en el plan | âš ï¸ **el lÃ­mite existe, la funciÃ³n no** |
| Roles owner / manager / operator / viewer | ðŸ”¶ **pendiente** |
| AuditorÃ­a de acciones por usuario | ðŸ”¶ **pendiente** (hay tablas y registro de actividad, pero no la UI ni los permisos) |
| Organizaciones multiempresa | ðŸ”¶ **pendiente** |
| SincronizaciÃ³n y colaboraciÃ³n en tiempo real | ðŸ§± **bloqueada** |

### âš ï¸ Advertencia honesta sobre Business

El plan Business **estÃ¡ declarado** en `src/shared/plans.ts` y se puede activar
con una licencia vÃ¡lida, pero **la colaboraciÃ³n multiusuario NO funciona**:

- **No hay backend de colaboraciÃ³n.** (SÃ­ existe un backend, pero es **solo para
  licencias**: confirma puestos y revoca licencias. No aloja ni sincroniza
  inventario, ni usuarios, ni pedidos.)
- No existe sesiÃ³n de usuario, ni invitaciones, ni roles aplicados.
- Un backend de colaboraciÃ³n exigirÃ­a subir datos de clientes (inventario,
  pedidos) a un tercero y garantizar disponibilidad a largo plazo; con
  presupuesto **0 â‚¬** no se puede prometer eso, y el multiusuario local ya estÃ¡
  pendiente en la hoja de ruta.

**Lo que sÃ­ hace Business hoy:** mismas capacidades que Pro sin lÃ­mites de
volumen. Nada mÃ¡s. Esto se indica tambiÃ©n en la propia pantalla de licencias.

**QuÃ© harÃ­a falta para multiusuario real** (sin coste asegurado, sin prometer):

1. Elegir backend (Cloudflare Workers + D1 o Supabase) y leer sus condiciones
   gratuitas actuales.
2. Modelo de organizaciones con permisos en el servidor, no solo en la app.
3. SincronizaciÃ³n por operaciones identificadas y ordenadas, con control de
   conflictos explÃ­cito. **Nunca** copiando la base SQLite activa por carpetas
   compartidas, y **nunca** *last-write-wins* sobre stock o dinero.

---

## 5. Funciones anunciadas que aÃºn no existen

Ninguna de estas aparece como disponible en la aplicaciÃ³n, pero conviene dejarlo
por escrito para que nadie las dÃ© por hechas:

| FunciÃ³n | Estado |
|---|---|
| PublicaciÃ³n automÃ¡tica en Vinted / eBay / Wallapop | ðŸ”¶ sin API autorizada, **sin scraping** |
| Seguimiento automÃ¡tico de envÃ­os | ðŸ”¶ solo manual/confirmado; ver `docs/SEGUIMIENTO.md` |
| Actualizaciones automÃ¡ticas | ðŸ”¶ no existen todavÃ­a; la actualizaciÃ³n es manual. Ver `docs/release/KNOWN_ISSUES.md` Â§7 |
| EnvÃ­o de emails de aviso | ðŸ”¶ requerirÃ­a un servicio de pago |
| Informes PDF y exportaciÃ³n XLSX | ðŸ”¶ |
| Devoluciones parciales por lÃ­nea | ðŸ”¶ |
| Multi-divisa con tipos de cambio | ðŸ”¶ |

---

## 6. QuÃ© pasa si cambia de plan

- **Cambiar de plan no borra datos.** El plan es una etiqueta sobre la licencia;
  la base de datos no se toca.
- **Caducar una licencia no borra el inventario.** Solo vuelven a aplicarse los
  lÃ­mites del plan gratuito (y si hay mÃ¡s artÃ­culos que el lÃ­mite, los que ya
  existen **siguen ahÃ­**: no se borra nada, solo se impide crear mÃ¡s).
- **Si el servicio de licencias no responde**, no hay ningÃºn efecto: las
  licencias se verifican **localmente** con criptografÃ­a, sin red. Inventario,
  compras, pedidos, ubicaciones, copias y funciones de pago siguen igual (ver
  `docs/LICENCIAS.md`).
- **Nunca se bloquea el acceso del usuario a sus propios datos.** Exportar y
  hacer copia estÃ¡n siempre disponibles.
