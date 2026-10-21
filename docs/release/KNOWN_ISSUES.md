# RESALEVAULT — Problemas conocidos (21/10/2026)

Lista honesta de lo que no funciona, no está probado o está bloqueado. Ordenada
por impacto para el usuario.

---

## 1. El instalador de Windows no está firmado

- **Qué pasa**: al ejecutar `RESALEVAULT-Setup-0.5.0.exe`, SmartScreen muestra
  «Windows protegió su PC» y, en equipos con políticas estrictas, puede bloquearlo.
- **Por qué**: no hay certificado de firma de CA pública (150–300 €/año; el
  presupuesto del proyecto es 0 €).
- **Qué NO se hace**: **no se desactiva ninguna protección de Windows** ni se
  aplican técnicas para eludir SmartScreen. Eso sería inseguro e ineficaz.
- **Solución gratuita prevista**: publicar en la **Microsoft Store** (cuenta de
  desarrollador gratuita); Microsoft firma el paquete él mismo.
- **Mientras tanto**: la instalación es posible, pero el usuario debe aceptar el
  aviso. Nunca se pide desactivar Defender ni Smart App Control.

## 2. Bloqueo de instalación en equipos con política Enterprise

- **Qué pasa**: en **este** PC de desarrollo, CodeIntegrity (evento 3033) rechaza
  los instaladores por «Enterprise signing level requirements».
- **Por qué**: una política de la máquina exige firma de nivel Enterprise, que
  solo da un certificado de CA pública.
- **Verificado**: Smart App Control está desactivado y Defender no detecta nada;
  no existe `SiPolicy.p7b`. El bloqueo es de política, no de malware.
- **Cómo se resuelve de verdad**: solo con una firma de CA pública (de pago) o
  distribuyendo por la Microsoft Store.

## 3. Integración en línea de licencias: alcance real (offline-first)

- **Qué hace hoy**: la app **sí** llama al backend. Al activar una licencia y de
  forma periódica (canal `license:refresh`), confirma el puesto y descarga la
  lista de revocaciones contra la Edge Function (Supabase), **verificando siempre
  la firma en local**.
- **Diseño deliberado (offline-first)**: si no hay conexión, la licencia **sigue
  validándose en local**. El servidor controla **puestos y revocaciones**, nunca
  concede el plan; y un fallo de red **nunca** bloquea la app ni borra datos.
- **Por qué**: un usuario sin internet debe poder trabajar, y una caída del
  servicio gratuito no puede dejarle sin acceso a su inventario.
- **Consecuencia honesta**: revocar una licencia surte efecto cuando el equipo
  tiene conexión y refresca (al arrancar o al pulsar «Comprobar ahora» en la
  pantalla de Licencia). Un equipo permanentemente sin conexión no recibirá la
  revocación hasta que conecte.

## 4. Verificación en equipo limpio pendiente

- Toda la verificación se ha hecho en el PC de desarrollo.
- Falta ejecutar `verify-install.ps1` en un equipo o máquina virtual **limpia**.
- Hasta entonces, no se afirma que la instalación esté validada de extremo a
  extremo en un sistema ajeno.

## 5. macOS bloqueado

- No se puede compilar, firmar ni notarizar desde Windows.
- Ver `MACOS_STATUS.md`.

## 6. AI Studio no probado contra proveedores reales

- La construcción de peticiones (cabeceras, forma del cuerpo, mapeo de errores,
  estimación de coste) está **probada con dobles**.
- No se ha llamado a Gemini/OpenAI/Anthropic de verdad (requiere una clave).
- Las recomendaciones de precio se muestran como **estimaciones**; no se afirma
  disponer de datos de mercado reales.

## 7. No hay actualización automática

- **Qué pasa**: la aplicación **no comprueba ni instala actualizaciones**. No
  incluye `electron-updater` ni ningún mecanismo equivalente.
- **Consecuencia**: para actualizar, el usuario descarga la nueva versión desde
  la página de Releases (o la Store, cuando esté publicada) y la instala encima.
  Sus datos se conservan (viven en su carpeta de usuario, no en la de instalación).
- **Por qué no está ahora**: un actualizador automático necesita un canal de
  publicación firmado. Sin certificado de CA pública ni infraestructura propia,
  hacerlo mal (descargar y ejecutar sin verificar) sería **peor** que no tenerlo.
- **Decisión pendiente**: añadirlo más adelante con verificación de firma/hash, o
  dejarlo manual. Mientras tanto, es **manual y documentado**, no prometido.

## 8. El instalador NSIS no es reproducible byte a byte

- Dos compilaciones del mismo código dan hashes distintos (marcas de tiempo).
- **Implicación**: el hash publicado corresponde a **un** artefacto concreto. Si
  se recompila, hay que volver a publicar el hash.

## 9. Limpieza cosmética del humo de interfaz

- A veces no se puede borrar la carpeta temporal (`EPERM` en Windows).
- No afecta a la app ni a los resultados; es ruido de la herramienta de prueba.

## 10. Datos de prueba en el backend

- El proyecto de Supabase contiene activaciones y licencias de **prueba**
  (máquinas A/B/C). Son inofensivas y se pueden borrar cuando se quiera.

---

## Lo que **no** es un problema (aclaración)

- **No hay telemetría**. La app solo hace peticiones de red en tres casos, todos
  iniciados por el usuario o por su licencia: (1) comprobar el puesto de licencia
  y revocaciones (opcional, con una licencia activa); (2) las llamadas de AI
  Studio, con **tu propia clave** (BYOK); y (3) abrir la página de seguimiento de
  un transportista cuando tú lo pides. **Ningún** dato de inventario, pedidos o
  clientes sale del equipo.
- **No hay pagos integrados**. La compra de licencia se gestiona en Discord.
- **No se pierden datos** al desinstalar: viven en `%APPDATA%\RESALEVAULT`
  (instalador NSIS) o en la carpeta privada del paquete (versión de la Store).
- **No se piden permisos innecesarios** en macOS (ver *entitlements*).
