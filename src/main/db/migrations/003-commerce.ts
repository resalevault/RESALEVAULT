/**
 * RESALEVAULT - Migracion 003: compras, pedidos, gastos, multimedia,
 * inteligencia, IA y licencias.
 *
 * Decisiones clave contra el doble conteo de gastos:
 *
 *  1. Una COMPRA es un documento (proveedor, albaran, envio). Su coste NO es un
 *     gasto del negocio: es el coste de adquisicion de sus articulos.
 *  2. Al aplicar una compra, el coste se REPARTE entre los articulos y se
 *     escribe en `products.purchase_price_cents` y
 *     `products.acquisition_fees_cents`. El producto es la unica fuente de
 *     verdad del coste de un articulo.
 *  3. La tabla `expenses` es SOLO para gastos generales del negocio (embalaje,
 *     cuotas, almacenamiento...). Nunca se mezcla con las compras.
 *  4. El envio que paga el comprador es un INGRESO, no un gasto. El envio que
 *     asumimos nosotros es un COSTE. Se guardan en campos separados.
 *
 * Coste de venta congelado: `order_items.unit_cost_cents` copia el coste del
 * articulo en el momento de la venta. Si despues se corrige el coste del
 * articulo, los pedidos ya cerrados no se alteran. Lo mismo con sku y titulo.
 */

import type { Database } from '../database'

const SQL = `
-- ---------------------------------------------------------------------------
-- Proveedores y compras
-- ---------------------------------------------------------------------------
CREATE TABLE suppliers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  contact    TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_suppliers_name ON suppliers(name COLLATE NOCASE);

CREATE TABLE purchases (
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL DEFAULT '',
  supplier_id       TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name     TEXT NOT NULL DEFAULT '',
  purchased_at      TEXT NOT NULL,
  shipping_cents    INTEGER NOT NULL DEFAULT 0,
  other_cents       INTEGER NOT NULL DEFAULT 0,
  discount_cents    INTEGER NOT NULL DEFAULT 0,
  -- 'by_cost' reparte proporcionalmente al coste, 'equal' a partes iguales.
  allocation_method TEXT NOT NULL DEFAULT 'by_cost'
                    CHECK (allocation_method IN ('by_cost','equal','none')),
  notes             TEXT NOT NULL DEFAULT '',
  is_demo           INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX ix_purchases_date ON purchases(purchased_at DESC);

CREATE TABLE purchase_items (
  id                    TEXT PRIMARY KEY,
  purchase_id           TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id            TEXT REFERENCES products(id) ON DELETE SET NULL,
  description           TEXT NOT NULL DEFAULT '',
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost_cents       INTEGER NOT NULL DEFAULT 0,
  allocated_extra_cents INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL
);

CREATE INDEX ix_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX ix_purchase_items_product ON purchase_items(product_id);

-- ---------------------------------------------------------------------------
-- Gastos generales del negocio (NUNCA costes de compra)
-- ---------------------------------------------------------------------------
CREATE TABLE expenses (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL DEFAULT 'other'
               CHECK (category IN ('packaging','shipping','platform_fees','subscriptions',
                                   'storage','transport','marketing','taxes','equipment','other')),
  description  TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  incurred_on  TEXT NOT NULL,
  recurring    TEXT NOT NULL DEFAULT 'none' CHECK (recurring IN ('none','monthly','yearly')),
  notes        TEXT NOT NULL DEFAULT '',
  is_demo      INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX ix_expenses_date ON expenses(incurred_on DESC);
CREATE INDEX ix_expenses_category ON expenses(category);

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id                    TEXT PRIMARY KEY,
  order_number          TEXT NOT NULL,
  platform_id           TEXT REFERENCES platforms(id) ON DELETE SET NULL,
  sold_at               TEXT NOT NULL,
  buyer                 TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','preparing','packed','shipped',
                                          'delivered','returned','cancelled')),
  -- Lo que paga el comprador por el envio: es INGRESO.
  shipping_charged_cents INTEGER NOT NULL DEFAULT 0,
  -- Lo que nos cuesta el envio: es COSTE.
  shipping_cost_cents   INTEGER NOT NULL DEFAULT 0,
  discount_cents        INTEGER NOT NULL DEFAULT 0,
  other_cents           INTEGER NOT NULL DEFAULT 0,
  payment_reference     TEXT NOT NULL DEFAULT '',
  tracking_number       TEXT NOT NULL DEFAULT '',
  carrier               TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  prepared_at           TEXT,
  shipped_at            TEXT,
  delivered_at          TEXT,
  is_demo               INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_orders_number ON orders(order_number);
CREATE INDEX ix_orders_date ON orders(sold_at DESC);
CREATE INDEX ix_orders_status ON orders(status);
CREATE INDEX ix_orders_platform ON orders(platform_id);

-- Lineas de pedido. sku, titulo y coste quedan CONGELADOS a proposito.
CREATE TABLE order_items (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       TEXT REFERENCES products(id) ON DELETE SET NULL,
  sku              TEXT NOT NULL DEFAULT '',
  title            TEXT NOT NULL DEFAULT '',
  quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  unit_cost_cents  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE INDEX ix_order_items_order ON order_items(order_id);
CREATE INDEX ix_order_items_product ON order_items(product_id);

-- Comisiones y cargos del pedido. Varias filas por pedido a proposito: una
-- plataforma puede cobrar comision de venta + comision de pago + promocion.
CREATE TABLE order_fees (
  id           TEXT PRIMARY KEY,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'commission'
               CHECK (kind IN ('commission','payment','promotion','shipping','other')),
  label        TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE INDEX ix_order_fees_order ON order_fees(order_id);

CREATE TABLE order_returns (
  id                 TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  returned_at        TEXT NOT NULL,
  reason             TEXT NOT NULL DEFAULT '',
  refund_cents       INTEGER NOT NULL DEFAULT 0,
  fee_refund_cents   INTEGER NOT NULL DEFAULT 0,
  shipping_lost_cents INTEGER NOT NULL DEFAULT 0,
  restock            INTEGER NOT NULL DEFAULT 1 CHECK (restock IN (0,1)),
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL
);

CREATE INDEX ix_order_returns_order ON order_returns(order_id);

-- ---------------------------------------------------------------------------
-- Preparacion de pedidos (checklist con comprobacion por escaneo)
-- ---------------------------------------------------------------------------
CREATE TABLE picking_checks (
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  picked_at   TEXT,
  packed_at   TEXT,
  scanned_sku TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (order_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Inteligencia: reglas descartadas y umbrales por regla
-- ---------------------------------------------------------------------------
CREATE TABLE intelligence_state (
  key       TEXT PRIMARY KEY,
  rule_id   TEXT NOT NULL,
  subject   TEXT NOT NULL DEFAULT '',
  action    TEXT NOT NULL DEFAULT 'dismissed',
  until_at  TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX ix_intelligence_rule ON intelligence_state(rule_id, subject);

-- ---------------------------------------------------------------------------
-- AI Studio (BYOK). La clave NUNCA se guarda en claro: secret_cipher es el
-- blob cifrado por el almacen de credenciales del sistema operativo.
-- ---------------------------------------------------------------------------
CREATE TABLE ai_connections (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL CHECK (provider IN ('gemini','openai','anthropic')),
  label         TEXT NOT NULL DEFAULT '',
  secret_cipher TEXT NOT NULL DEFAULT '',
  secret_hint   TEXT NOT NULL DEFAULT '',
  base_url      TEXT NOT NULL DEFAULT '',
  default_model TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  last_ok_at    TEXT,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE ai_routes (
  task          TEXT PRIMARY KEY,
  connection_id TEXT REFERENCES ai_connections(id) ON DELETE SET NULL,
  model         TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL
);

CREATE TABLE ai_usage (
  id            TEXT PRIMARY KEY,
  at            TEXT NOT NULL,
  connection_id TEXT,
  provider      TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL DEFAULT '',
  task          TEXT NOT NULL DEFAULT '',
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  -- Estimacion con el precio que configura el usuario, en millonésimas.
  cost_micros   INTEGER NOT NULL DEFAULT 0,
  ok            INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0,1)),
  error         TEXT,
  subject       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX ix_ai_usage_at ON ai_usage(at DESC);
CREATE INDEX ix_ai_usage_task ON ai_usage(task);

-- Precios por millon de tokens. Los configura el usuario porque las tarifas de
-- los proveedores cambian: no se codifican valores que caducarian.
CREATE TABLE ai_prices (
  id                          TEXT PRIMARY KEY,
  provider                    TEXT NOT NULL,
  model                       TEXT NOT NULL,
  input_per_million_micros    INTEGER NOT NULL DEFAULT 0,
  output_per_million_micros   INTEGER NOT NULL DEFAULT 0,
  updated_at                  TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Licencias y planes
-- ---------------------------------------------------------------------------
CREATE TABLE device_identity (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE licenses (
  id           TEXT PRIMARY KEY,
  plan         TEXT NOT NULL CHECK (plan IN ('free','pro','business')),
  kind         TEXT NOT NULL CHECK (kind IN ('perpetual','subscription','founder')),
  payload      TEXT NOT NULL DEFAULT '',
  signature    TEXT NOT NULL DEFAULT '',
  code_hash    TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'inactive'
               CHECK (status IN ('inactive','active','expired','revoked')),
  activated_at TEXT,
  expires_at   TEXT,
  last_check_at TEXT,
  device_id    TEXT NOT NULL DEFAULT '',
  seats        INTEGER NOT NULL DEFAULT 1,
  holder       TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX ix_licenses_status ON licenses(status);

CREATE TABLE license_events (
  id         TEXT PRIMARY KEY,
  license_id TEXT,
  at         TEXT NOT NULL,
  event      TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX ix_license_events_at ON license_events(at DESC);
`

export const migration003 = {
  version: 3,
  name: 'compras-pedidos-ia-licencias',
  up: (db: Database): void => {
    db.exec(SQL)

    // Numeracion de pedidos: contador ya creado en la migracion 002.
    db.run("INSERT OR IGNORE INTO counters (key, value) VALUES ('expense_count', 0)")
  }
}
