/**
 * RESALEVAULT - Migracion 001: esquema inicial.
 *
 * Decisiones de integridad:
 *  - El dinero se guarda como INTEGER en centimos (nunca REAL).
 *  - Los identificadores son UUID v4 en TEXT, generados en el proceso
 *    principal. Esto permite fusionar bases de datos o sincronizar en el
 *    futuro sin colisiones (a diferencia de un AUTOINCREMENT).
 *  - Las fechas son TEXT en ISO-8601 UTC, ordenables lexicograficamente.
 *  - Las claves foraneas estan activadas y se declaran explicitamente.
 *  - Los estados de producto viven en una tabla propia (`product_statuses`)
 *    para que puedan personalizarse sin modificar el codigo.
 *  - Se incluyen las tablas de organizacion/usuarios desde el principio para
 *    no tener que rehacer el modelo cuando llegue el modo multiusuario, y se
 *    usan realmente: cada registro de actividad e historial apunta al usuario
 *    que lo provoco.
 */

import type { Database } from '../database'

const SQL = `
-- ---------------------------------------------------------------------------
-- Organizacion y usuarios (base para el plan Business)
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner'
                CHECK (role IN ('owner','manager','operator','viewer')),
  created_at    TEXT NOT NULL
);

CREATE INDEX ix_users_org ON users(organization_id);

-- ---------------------------------------------------------------------------
-- Ajustes de la aplicacion (clave/valor; los valores no sensibles)
-- Las claves de API NUNCA se guardan aqui: van al almacen de credenciales
-- del sistema operativo.
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Estados de producto configurables
-- ---------------------------------------------------------------------------
CREATE TABLE product_statuses (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL DEFAULT '',
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  is_terminal INTEGER NOT NULL DEFAULT 0 CHECK (is_terminal IN (0,1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- Categorias jerarquicas
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_categories_parent_slug
  ON categories(COALESCE(parent_id, ''), slug);
CREATE INDEX ix_categories_parent ON categories(parent_id);

-- ---------------------------------------------------------------------------
-- Plataformas de venta (configurables)
-- ---------------------------------------------------------------------------
CREATE TABLE platforms (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_platforms_code ON platforms(code COLLATE NOCASE);

-- ---------------------------------------------------------------------------
-- Ubicaciones fisicas: Almacen > Estanteria > Caja > Compartimento
-- La columna path se recalcula al mover y siempre coincide con la jerarquia real.
-- ---------------------------------------------------------------------------
CREATE TABLE locations (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES locations(id) ON DELETE RESTRICT,
  kind       TEXT NOT NULL
             CHECK (kind IN ('warehouse','shelf','box','compartment')),
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL,
  depth      INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_locations_code ON locations(code COLLATE NOCASE);
CREATE UNIQUE INDEX ux_locations_path ON locations(path COLLATE NOCASE);
CREATE INDEX ix_locations_parent ON locations(parent_id);

-- ---------------------------------------------------------------------------
-- Etiquetas libres
-- ---------------------------------------------------------------------------
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_tags_name ON tags(name COLLATE NOCASE);

-- ---------------------------------------------------------------------------
-- Definiciones de atributos personalizados
-- ---------------------------------------------------------------------------
CREATE TABLE attributes (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL
             CHECK (type IN ('text','number','boolean','date','select')),
  options    TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_attributes_key ON attributes(key COLLATE NOCASE);

-- ---------------------------------------------------------------------------
-- Articulos
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  id                      TEXT PRIMARY KEY,
  sku                     TEXT NOT NULL COLLATE NOCASE,
  name                    TEXT NOT NULL,
  description             TEXT NOT NULL DEFAULT '',
  category_id             TEXT REFERENCES categories(id) ON DELETE SET NULL,
  brand                   TEXT NOT NULL DEFAULT '',
  model                   TEXT NOT NULL DEFAULT '',
  size                    TEXT NOT NULL DEFAULT '',
  color                   TEXT NOT NULL DEFAULT '',
  condition               TEXT NOT NULL DEFAULT 'unknown'
                          CHECK (condition IN ('unknown','new','like_new','good','used','fair','for_parts')),
  status                  TEXT NOT NULL DEFAULT 'to_prepare'
                          REFERENCES product_statuses(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  attributes              TEXT NOT NULL DEFAULT '{}',
  purchase_date           TEXT,
  purchase_price_cents    INTEGER NOT NULL DEFAULT 0,
  acquisition_fees_cents  INTEGER NOT NULL DEFAULT 0,
  expected_sale_price_cents INTEGER NOT NULL DEFAULT 0,
  final_sale_price_cents  INTEGER,
  location_id             TEXT REFERENCES locations(id) ON DELETE SET NULL,
  private_notes           TEXT NOT NULL DEFAULT '',
  -- Marca de demostracion: permite borrar los datos de ejemplo sin tocar los
  -- articulos reales del usuario.
  is_demo                 INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  archived_at             TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  created_by              TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX ux_products_sku ON products(sku);
CREATE INDEX ix_products_status ON products(status);
CREATE INDEX ix_products_category ON products(category_id);
CREATE INDEX ix_products_location ON products(location_id);
CREATE INDEX ix_products_updated ON products(updated_at);
CREATE INDEX ix_products_purchase_date ON products(purchase_date);
CREATE INDEX ix_products_archived ON products(archived_at);

CREATE TABLE product_tags (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);

CREATE INDEX ix_product_tags_tag ON product_tags(tag_id);

-- ---------------------------------------------------------------------------
-- Fotografias y documentos
-- ---------------------------------------------------------------------------
CREATE TABLE product_media (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('photo','document')),
  file_name     TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  sha256        TEXT NOT NULL,
  width         INTEGER,
  height        INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_cover      INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0,1)),
  created_at    TEXT NOT NULL
);

CREATE INDEX ix_media_product ON product_media(product_id, sort_order);
CREATE INDEX ix_media_sha ON product_media(sha256);

-- ---------------------------------------------------------------------------
-- Anuncios por plataforma (multicanal)
-- ---------------------------------------------------------------------------
CREATE TABLE product_listings (
  id                 TEXT PRIMARY KEY,
  product_id         TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform_id        TEXT NOT NULL REFERENCES platforms(id) ON DELETE RESTRICT,
  external_id        TEXT NOT NULL DEFAULT '',
  url                TEXT NOT NULL DEFAULT '',
  listed_price_cents INTEGER,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','active','paused','sold','ended')),
  listed_at          TEXT,
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX ix_listings_product ON product_listings(product_id);
CREATE INDEX ix_listings_platform ON product_listings(platform_id);
-- Un anuncio externo no puede duplicarse en la misma plataforma, salvo que no
-- tenga identificador (varios anuncios manuales sin ID son legitimos).
CREATE UNIQUE INDEX ux_listings_external
  ON product_listings(platform_id, external_id) WHERE external_id <> '';

-- ---------------------------------------------------------------------------
-- Historial de cambios por articulo
-- ---------------------------------------------------------------------------
CREATE TABLE product_history (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  action     TEXT NOT NULL,
  field      TEXT,
  old_value  TEXT,
  new_value  TEXT,
  note       TEXT,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX ix_history_product ON product_history(product_id, at DESC);

-- ---------------------------------------------------------------------------
-- Registro de actividad global
-- ---------------------------------------------------------------------------
CREATE TABLE activity_log (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  action     TEXT NOT NULL,
  summary    TEXT NOT NULL,
  details    TEXT,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX ix_activity_at ON activity_log(at DESC);

-- ---------------------------------------------------------------------------
-- Contadores (secuencias de SKU y numeracion de pedidos)
-- ---------------------------------------------------------------------------
CREATE TABLE counters (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
`

export const migration001 = {
  version: 1,
  name: 'esquema-inicial',
  up: (db: Database): void => {
    db.exec(SQL)
  }
}
