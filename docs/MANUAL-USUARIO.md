# RESALEVAULT — Manual de usuario

Guía para usar la aplicación día a día. No hace falta saber nada técnico.

---

## 1. Primer inicio

1. Abre **RESALEVAULT**. Se abre el **Panel**.
2. La primera vez, la base de datos está vacía. Verás estados vacíos con un
   botón para empezar; no hay datos de ejemplo que puedan confundirse con los
   tuyos (los de demostración se añaden solo si tú lo pides desde
   **Ajustes**, y se pueden borrar de golpe).
3. Elige el idioma en **Ajustes → Idioma** (español o inglés).

Todo funciona **sin conexión a internet**.

---

## 2. Antes de empezar: conceptos

| Concepto | Qué es |
|---|---|
| **Artículo** | Cada pieza única que compras y vendes (una camiseta, un móvil…) |
| **SKU** | Código único del artículo. Se genera solo, con dígito de control |
| **Compra** | Lo que pagaste por el artículo (y sus gastos) |
| **Pedido** | La venta. Puede tener varias líneas |
| **Ubicación** | Dónde está guardado (estantería, caja, almacén…) |
| **Beneficio** | Precio de venta − coste − comisiones − envío |

**Todos los importes se guardan en céntimos enteros.** No hay errores de
redondeo con decimales. Las fórmulas exactas están en `docs/FORMULAS.md`.

---

## 3. Crear inventario

### 3.1 Un artículo a mano

**Inventario → Nuevo artículo**

- Obligatorios: **nombre** y **precio de compra**.
- Recomendados: categoría, marca, talla, color, estado, precio de venta
  esperado y fecha de compra.
- El **SKU** se genera automáticamente, pero puedes escribir el tuyo.

### 3.2 Fotos

En el artículo, arrastra o selecciona imágenes. Se aceptan JPG, PNG, WebP y GIF.
Se genera una **miniatura** automáticamente para que las listas vayan rápidas.
Hasta 30 fotos por artículo (25 MB por archivo). El límite es el mismo en todos
los planes; lo que cambia por plan es el total de archivos (200 en Free).

### 3.3 Muchos artículos a la vez (importar CSV)

**Importar/Exportar** (plan **Pro**):

1. Elige el archivo CSV.
2. Revisa la **previsualización**: columnas detectadas y primeras filas.
3. Decide qué hacer con los **duplicados** (omitir, actualizar o crear nuevo).
4. Importa. Si algo falla, se indica **qué fila y por qué**; las filas buenas se
   importan igual.

### 3.4 Categorías y etiquetas

**Categorías** permite crear un árbol. Al filtrar por una categoría se incluyen
también sus subcategorías.

### 3.5 Ubicaciones

**Ubicaciones** es un árbol (Almacén → Estantería → Caja). Al mover una ubicación
se recalcula la ruta de todo lo que hay dentro. El artículo guarda su ruta
completa, que es lo que se ve en la etiqueta.

---

## 4. Comprar y vender

### 4.1 Registrar una compra

**Compras → Nueva compra**

Indica proveedor, fecha, artículos y costes: envío, otros gastos y descuento.
El coste real de cada artículo se calcula prorrateando esos gastos según el
método que elijas (mayoría, minoría o mixto según el caso).

### 4.2 Registrar una venta

**Pedidos → Nuevo pedido**

1. Elige la plataforma (define comisión y tarifa fija).
2. Busca los artículos y añádelos.
3. Ajusta precio y gastos de envío.
4. Guarda.

Al crear el pedido, los artículos pasan a **reservado**; al marcarlo como
**enviado**, a **vendido**. Si lo cancelas, vuelven a estar disponibles.

**Un mismo artículo no puede venderse dos veces.** Si intentas venderlo otra vez,
la aplicación lo bloquea.

### 4.3 Devoluciones y cancelaciones

Desde el pedido puedes registrar una devolución o cancelarlo. En ambos casos el
stock se recalcula y el beneficio se ajusta. **La misma devolución no se puede
registrar dos veces.**

---

## 5. Preparar los envíos

**Picking** (Preparación): lista los pedidos pendientes de enviar, con la
ubicación real de cada artículo y sus códigos. Se puede imprimir la hoja para
recorrer el almacén.

**Etiquetas y códigos de barras:** desde un artículo o una ubicación se genera
una etiqueta con **Code128** y **QR**. Se imprimen o se guardan.

---

## 6. Shipping Tracker (seguimiento de envíos)

**Shipping Tracker** tiene dos partes:

### 6.1 Directorio de transportistas

46 transportistas con buscador y agrupados por región. A cada uno se le puede
editar la URL de seguimiento. Los transportistas con dominio sin verificar
aparecen **marcados** como tales.

> No se usan logotipos de terceros: los transportistas se identifican con un
> distintivo propio de iniciales y color. Los logotipos son marcas registradas.

### 6.2 Tus códigos de seguimiento

- **Añadir**: código + transportista + notas. Se guarda en tu equipo.
- **Seguir ahora**: abre la web del transportista dentro de la aplicación,
  rellenando el código si el transportista lo admite en la URL. Si no, copia el
  código al portapapeles para que lo pegues.
- **Estado**: cada código tiene estado **manual** (lo pones tú) o
  **confirmado** (solo si una fuente oficial lo ha devuelto). **La aplicación no
  inventa eventos de envío.**
- **Cerrar**: se cierra el navegador integrado; los códigos siguen guardados.

El navegador integrado es una ventana aislada: la web del transportista no tiene
acceso a tu equipo, no puede abrir ventanas ni descargar archivos, y solo se
permite HTTPS. Detalles y limitaciones en `docs/SEGUIMIENTO.md`.

---

## 7. Entender los números

**Panel**: resumen del negocio (capital invertido, valor esperado, beneficio del
periodo, artículos estancados).

**Analítica** (plan **Pro**): informe financiero con filtros de fecha,
desglose por plataforma y rentabilidad.

**Inteligencia** (plan **Pro**): 12 reglas que avisan de lo que conviene mirar
(stock estancado, margen bajo, precios desactualizados…). Cada aviso enlaza con
la pantalla donde se arregla.

---

## 8. IA (AI Studio) — opcional

**AI Studio** (plan **Pro**) puede redactar descripciones, sugerir categorías,
etc. **Necesita tu propia clave** de OpenAI, Anthropic o Gemini:

1. Consigue una clave en el proveedor que elijas y mira sus precios.
2. Pégala en AI Studio. Se guarda **cifrada en tu sistema**, no en la base de
   datos.
3. Elige proveedor y modelo.
4. Antes de ejecutar, revisa la **estimación de coste** y confirma.

⚠️ **Las llamadas pueden consumir saldo en TU cuenta del proveedor.** La
aplicación avisa antes de cada lote. Sin clave, no se llama a nadie y el resto
del programa sigue funcionando igual.

---

## 9. Copias de seguridad

**Ajustes → Copias** (según versión) o **Importar/Exportar**:

- **Crear copia**: genera un ZIP con la base y las imágenes. Se puede hacer
  cuando quieras.
- **Copias automáticas**: mientras la aplicación está abierta, según la
  frecuencia configurada. ⚠️ **Con la aplicación cerrada no se hacen**: no hay
  ningún servicio en segundo plano que las ejecute.
- **Verificar** una copia: comprueba el CRC de cada archivo y la integridad de
  la base dentro del ZIP.
- **Restaurar**: es un proceso en **dos fases** (validar → reiniciar → aplicar)
  para que un fallo a mitad no te deje sin base. La base anterior se conserva
  como `resalevault.antes-de-restaurar-<fecha>.sqlite`.

Más detalles en `docs/RECUPERACION.md`.

---

## 10. Licencias

**Licencias**: pega el código que se te haya entregado y pulsa **Activar**.

- La firma de la licencia se verifica **siempre en local**. Además, si hay
  conexión, la app confirma tu puesto y consulta revocaciones contra el servicio
  de licencias (ver `docs/LICENCIAS.md` §6). Ese paso no concede el plan.
- **Sin conexión la licencia sigue funcionando**: es *offline-first*.
- Cambiar de plan **nunca borra datos**.
- Si tu licencia de suscripción caduca, el inventario sigue ahí; solo se
  bloquean las funciones de pago (y **no se borra nada** de lo que ya existe
  aunque superes los límites del plan gratuito).
- Exportar y hacer copia **siempre** están disponibles.

Comparativa de planes: `docs/FREE-VS-PRO-VS-BUSINESS.md`.

---

## 11. Actualizar el programa

**Hoy no hay actualización automática** (no hay servidor, y no se finge uno).
Para actualizar:

1. Descarga el instalador nuevo.
2. **Comprueba el SHA-256** que se publique junto a él:
   ```powershell
   Get-FileHash .\RESALEVAULT-Setup-x.y.z.exe -Algorithm SHA256
   ```
3. Ejecuta el instalador. Se instala encima; **tus datos no se tocan**.
4. Al abrir, la aplicación aplica las migraciones necesarias de la base de datos.

Si algo fuera mal, tus copias están en `backups\` y la restauración no borra la
base anterior.

---

## 12. Desinstalar sin perder datos

1. **Ajustes del sistema → Aplicaciones → RESALEVAULT → Desinstalar.**
2. El desinstalador **no borra** `%APPDATA%\RESALEVAULT`.
3. Si de verdad quieres borrar todo, elimina esa carpeta a mano.
4. Si vuelves a instalar, tus datos siguen ahí.

---

## 13. Solución de problemas

| Síntoma | Qué hacer |
|---|---|
| «No se puede abrir la base de datos» | Cierra el programa por completo (puede quedar un proceso abierto) y vuelve a abrir. Si persiste, restaura una copia con `docs/RECUPERACION.md` |
| Windows bloquea el instalador | Está sin certificado de confianza pública. Ver `docs/FIRMA.md` |
| La web del transportista no carga | Puede exigir CAPTCHA o bloquear visores integrados. Usa **copiar código** y abre la web en tu navegador |
| Un transportista dice «dominio sin verificar» | Su URL no se ha confirmado todavía. Puedes corregirla a mano en el directorio |
| Las copias automáticas no se hacen | Solo ocurren con la aplicación abierta |
| La IA no responde | Revisa que la clave sea válida y que el proveedor te dé saldo |
| Todo se ve pequeño o grande | Usa el zoom del sistema o el tamaño de fuente de Windows |

---

## 14. Privacidad en una frase

**Nada sale de tu equipo** salvo lo que tú pidas: abrir una web de seguimiento o
usar tu propia clave de IA. Ni telemetría, ni analíticas, ni cuentas. Ver
`docs/PRIVACIDAD.md`.
