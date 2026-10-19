/**
 * RESALEVAULT - Migracion 004: seguimiento de envios.
 *
 * Diseno:
 *  - `carriers` es una tabla, no una constante: el usuario puede corregir una URL
 *    que haya cambiado o anadir su transportista sin esperar una actualizacion.
 *  - `trackcodes` guarda el codigo y su estado. `status_source` distingue lo que
 *    ha dicho el usuario (`manual`) de lo que vendria de una API real
 *    (`confirmed`). Hoy no hay ninguna integracion de API activa, asi que todo
 *    estado es manual o `none` (solo se abrio la pagina).
 *  - `tracking_events` queda preparada para cuando exista una API autorizada.
 *    No se rellena con datos inventados.
 *  - El indice unico parcial impide duplicar un codigo del mismo transportista,
 *    pero solo entre los NO archivados: archivar y volver a anadir es legitimo.
 */

import type { Database } from '../database'

const SQL = `
CREATE TABLE carriers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  region       TEXT NOT NULL CHECK (region IN ('ES','EU','INT')),
  country      TEXT NOT NULL DEFAULT '',
  track_url    TEXT NOT NULL,
  url_template TEXT NOT NULL DEFAULT '',
  strategy     TEXT NOT NULL DEFAULT 'copy' CHECK (strategy IN ('url','copy')),
  verified     INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  integration  TEXT NOT NULL DEFAULT 'browser' CHECK (integration IN ('browser','api')),
  notes        TEXT NOT NULL DEFAULT '',
  enabled      INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  is_custom    INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0,1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_carriers_name ON carriers(name COLLATE NOCASE);
CREATE INDEX ix_carriers_region ON carriers(region, sort_order);

CREATE TABLE trackcodes (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL COLLATE NOCASE,
  carrier_id    TEXT NOT NULL REFERENCES carriers(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL DEFAULT '',
  order_ref     TEXT NOT NULL DEFAULT '',
  order_id      TEXT REFERENCES orders(id) ON DELETE SET NULL,
  purchase_date TEXT,
  expected_date TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_transit','delivered','incident','archived')),
  -- 'none' = solo se abrio la pagina; 'manual' = lo escribio el usuario;
  -- 'confirmed' = lo dijo una fuente real (reservado para APIs autorizadas).
  status_source TEXT NOT NULL DEFAULT 'none'
                CHECK (status_source IN ('none','manual','confirmed')),
  last_opened_at  TEXT,
  last_checked_at TEXT,
  notes         TEXT NOT NULL DEFAULT '',
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_trackcodes_active
  ON trackcodes(code, carrier_id) WHERE archived_at IS NULL;
CREATE INDEX ix_trackcodes_carrier ON trackcodes(carrier_id);
CREATE INDEX ix_trackcodes_status ON trackcodes(status);
CREATE INDEX ix_trackcodes_created ON trackcodes(created_at DESC);

CREATE TABLE tracking_events (
  id           TEXT PRIMARY KEY,
  trackcode_id TEXT NOT NULL REFERENCES trackcodes(id) ON DELETE CASCADE,
  at           TEXT NOT NULL,
  occurred_at  TEXT,
  description  TEXT NOT NULL,
  location     TEXT NOT NULL DEFAULT '',
  status_code  TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'api' CHECK (source IN ('api','manual'))
);

CREATE INDEX ix_tracking_events_code ON tracking_events(trackcode_id, at DESC);
`

export const migration004 = {
  version: 4,
  name: 'shipping-tracker',
  up: (db: Database): void => {
    db.exec(SQL)
  }
}
