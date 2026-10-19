# RESALEVAULT — Fórmulas financieras

Todas las cifras del programa proceden de estas fórmulas. **No hay ninguna
estimación presentada como dato real.**

> **Todo el dinero se almacena en céntimos enteros** (`INTEGER`). En la interfaz
> se convierte a texto solo al pintar. Motivo: con números en coma flotante,
> `0.1 + 0.2` no es `0.3`, y en contabilidad ese error se acumula.

---

## 1. Costes

| Concepto | Fórmula | Dónde |
|---|---|---|
| Coste total de un artículo | `purchase_price_cents + acquisition_fees_cents` | `ProductSummary.totalCostCents` |
| Gastos de adquisición | Lo que el usuario registra: envío de la compra, tasas, portes | Campo del artículo |

`acquisition_fees_cents` existe separado del precio de compra precisamente para
poder analizar cuánto se lleva el envío de la compra. Sumarlos en un solo campo
haría ese análisis imposible.

## 2. Beneficio y margen

### Artículo no vendido (previsión)

| Concepto | Fórmula |
|---|---|
| Beneficio previsto | `expected_sale_price_cents − totalCostCents` |
| Margen previsto (%) | `(expected_sale_price_cents − totalCostCents) / expected_sale_price_cents × 100` |

Esta cifra es una **previsión**, y así se etiqueta en la interfaz («Margen
previsto»). No es dinero ganado.

### Artículo vendido (realizado)

| Concepto | Fórmula |
|---|---|
| Beneficio bruto realizado | `final_sale_price_cents − totalCostCents` |
| Margen bruto (%) | `(final_sale_price_cents − totalCostCents) / final_sale_price_cents × 100` |

> **Aviso de honestidad.** Esta cifra es **BENEFICIO BRUTO**. Todavía **no**
> descuenta las comisiones de la plataforma, el envío que asume el vendedor ni
> otros gastos del pedido, porque el módulo de pedidos pertenece a la Fase 3. La
> interfaz lo llama «Beneficio bruto realizado» para no confundirlo con el
> beneficio neto. Cuando llegue la Fase 3, el neto se calculará restando a esta
> base las comisiones y gastos del pedido.

El margen se calcula **sobre el precio de venta**, no sobre el coste. Es el
criterio habitual en comercio: responde a «de cada 100 € que ingreso, cuántos me
quedo».

Si `final_sale_price_cents` es `NULL`, la fórmula devuelve `NULL` y la interfaz
muestra «—». No se inventa un cero, porque «no vendido» y «vendido a 0 €» son
cosas distintas.

## 3. Panel de resumen

Definiciones exactas de cada indicador:

| Indicador | Fórmula | Universo |
|---|---|---|
| Capital invertido | `SUM(totalCostCents)` | Artículos **no vendidos** ni archivados |
| Valor previsto del inventario | `SUM(expected_sale_price_cents)` | Mismos artículos |
| Beneficio potencial | `valor previsto − capital invertido` | Mismos artículos |
| Ventas brutas | `SUM(COALESCE(final_sale_price_cents, 0))` | Artículos en estado `sold` o `shipped` |
| Beneficio bruto realizado | `SUM(final_sale_price_cents − totalCostCents)` | Mismos artículos |

Dónde:

```
no vendidos ni archivados  →  archived_at IS NULL AND status NOT IN ('sold','shipped')
vendidos                   →  status IN ('sold','shipped')
```

Un artículo **devuelto** cuenta como capital inmovilizado (vuelve a estar en el
almacén), no como venta.

### Distinción de conceptos

Deliberadamente **no** se suman ni se confunden:

- **Ingresos** (dinero cobrado) ≠ **beneficio** (ingresos menos costes).
- **Beneficio bruto** (sin comisiones ni envíos) ≠ **beneficio neto** (Fase 3).
- **Margen** (porcentaje) ≠ **beneficio** (importe absoluto).
- **Capital invertido** (dinero ya gastado, inmovilizado) ≠ **dinero
  disponible** (efectivo en la cuenta). RESALEVAULT calcula lo primero; no
  pretende conocer el banco del usuario.

## 4. Antigüedad y stock estancado

```
ageDays = CAST(julianday('now') − julianday(COALESCE(purchase_date, created_at)) AS INTEGER)
```

Se usa la fecha de compra si existe; si no, la de creación del artículo. Nunca
es negativa (una fecha futura devuelve 0).

Las franjas se construyen con los umbrales configurables en Ajustes (por
defecto 30, 60 y 90 días):

| Umbrales | Franjas |
|---|---|
| `[30, 60, 90]` | `0-30`, `30-60`, `60-90`, `90+` |

Cada franja suma el **capital inmovilizado** de los artículos que caen en ella.
Así se ve dónde está el dinero parado, no solo cuántos artículos hay.

Los umbrales se normalizan antes de usarlos: se ordenan, se eliminan duplicados
y se descartan los valores no positivos (hay pruebas para ello).

## 5. Ajuste de precios en la edición masiva

| Modo | Fórmula | Ejemplo |
|---|---|---|
| `set` | `valor` (céntimos) | Fijar en 95,00 € → `9500` |
| `delta` | `actual + valor` (mínimo 0) | Subir 5,00 € → `actual + 500` |
| `percent` | `round(actual × (1 + valor/100))` | +10 % sobre `10000` → `11000` |

Nunca baja de cero. El redondeo es al céntimo.

## 6. Conversión de importes introducidos por el usuario

El parseo de importes es una fuente clásica de errores contables, así que la
regla está fijada y probada:

1. Se ignoran espacios, símbolos de moneda y separadores de millar.
2. Si aparecen `.` y `,` juntos, **el último** es el separador decimal.
3. Si solo aparece uno y no es el separador decimal del idioma activo, se trata
   como separador de millar.
4. Un texto vacío devuelve `null`, para poder distinguir «vacío» de «cero».
5. El redondeo se hace sobre la **representación decimal**, con aritmética
   entera: `4,005 → 401` céntimos, no `400`.

| Entrada | Idioma | Resultado |
|---|---|---|
| `19,99` | es | `1999` |
| `1.234,56` | es | `123456` |
| `1.234` | es | `123400` |
| `19.99` | en | `1999` |
| `$1,299.00` | en | `129900` |
| `(12,50)` | es | `−1250` |
| `abc` | es | `null` |

## 8. Beneficio NETO de un pedido (Fase 3)

A partir de aquí el programa distingue **bruto** de **neto**, que era la
limitación de la Fase 1:

```
goodsRevenue   = SUM(precioUnitario × cantidad)
netRevenue     = goodsRevenue − descuento + envioCobrado
goodsCost      = SUM(costeUnitario × cantidad)      <- CONGELADO en la venta
fees           = SUM(comisiones y cargos del pedido)
refunds        = SUM(reembolsos de devoluciones)
feesRefunded   = SUM(comisiones devueltas por la plataforma)
shippingLost   = SUM(envios perdidos por devoluciones)

Beneficio BRUTO = netRevenue − goodsCost

Beneficio NETO  = netRevenue − goodsCost − fees − envioPagado − otrosCostes
                  − refunds + feesRefunded − shippingLost

Margen (%)      = Beneficio NETO / netRevenue × 100
```

**Beneficio neto del negocio** (en Analítica) = beneficio neto de pedidos −
gastos generales del periodo.

### Por qué el coste se congela

`order_items.unit_cost_cents` copia el coste del artículo **en el momento de la
venta**. Si después se corrige el coste del artículo, los pedidos ya cerrados no
cambian. Lo mismo ocurre con el SKU y el título: un pedido es un documento
histórico y no debe reescribirse solo.

### Dos implementaciones de la misma fórmula

La fórmula está implementada dos veces:

1. **TypeScript** (`shared/finance-extended.ts`) para un pedido concreto.
2. **SQL agregado** (`main/services/finance.ts`) para informes de miles de
   pedidos sin hacer miles de consultas.

Para que no diverjan, hay una prueba que recalcula cada pedido con las dos y
compara **al céntimo**:

```
tests/finance-report.test.ts > el calculo agregado en SQL coincide al centimo
                             con el detalle en TypeScript
```

Además, la interfaz incluye un botón «Comprobar coherencia del cálculo» que hace
esa misma comparación sobre un pedido real.

---

## 9. Reparto de costes de una compra

```
extra = envio + otros − descuento

by_cost : extra × (costeLinea / costeTotal)
equal   : extra / numeroDeLineas
none    : no se reparte

El residuo del redondeo se asigna a la ULTIMA linea,
de modo que SUM(repartido) = extra exactamente.
```

Sin ese ajuste se perderían céntimos y el coste de los artículos no cuadraría
con lo pagado.

---

## 10. Calculadora de rentabilidad (antes de comprar)

```
costeTotal    = compra + envio + otros
ingresoNeto(P) = P × (1 − comision%) − comisionFija
beneficio(P)   = ingresoNeto(P) − costeTotal
margen(P)      = beneficio(P) / P × 100
roi            = beneficio / costeTotal × 100      <- sobre lo invertido

breakEven     = (comisionFija + costeTotal) / (1 − comision%)
precioMinBeneficio = (beneficioMinimo + comisionFija + costeTotal) / (1 − comision%)
precioMinMargen    = (comisionFija + costeTotal) / (1 − comision% − margenObjetivo)
precioMinVenta     = max(los dos anteriores, 0)
compraMaxima       = ingresoNeto(P) − max(beneficioMinimo, P × margenObjetivo)
                     − envio − otros
```

Si `comision% + margenObjetivo ≥ 100`, **ningún precio** alcanza ese margen: la
calculadora lo avisa y **no publica un precio mínimo que no cumpliría lo
pedido**. Si falta el precio de venta, avisa en lugar de inventarlo.

Recordatorio permanente en la interfaz: son **estimaciones basadas en los datos
del usuario**, no precios de mercado verificados.

---

## 11. Indicadores de inventario

| Indicador | Fórmula | Nota |
|---|---|---|
| Capital inmovilizado | `SUM(coste)` de no vendidos ni archivados | Un artículo **devuelto** sí cuenta: está en el almacén |
| Rotación anual | `costeDeLoVendido / capitalActual` | Aproximación: no hay histórico de capital |
| Antigüedad media | media **ponderada por capital** | 10 camisetas de 5 € no pesan como 10 móviles de 300 € |

---

## 12. Lo que este documento NO afirma

- No se estima el valor de mercado de ningún artículo: RESALEVAULT no inventa
  precios comparables.
- No se promete ningún aumento de beneficio.
- Las cifras de estas fórmulas se basan **solo** en los datos que el usuario ha
  registrado. Si un gasto no se ha registrado, no aparece.
- La Fase 3 (pedidos) introducirá comisiones, envíos y devoluciones; entonces
  este documento se ampliará con el beneficio **neto** y se dejará claro en la
  interfaz cuál es bruto y cuál neto.
