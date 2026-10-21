/**
 * RESALEVAULT - Migracion 005: estado del cliente de licencias online.
 *
 * Anade a `licenses` los datos que necesita la comprobacion remota, sin tocar
 * las columnas existentes ni borrar nada:
 *
 *  - `online_state`   : ultimo resultado conocido de la comprobacion online.
 *  - `online_error`   : motivo del ultimo fallo (vacio si no hubo).
 *  - `revocation_cursor`: fecha del ultimo barrido de revocaciones. Permite
 *                       pedir al servidor solo lo que ha cambiado desde entonces.
 *
 * Se usa `ALTER TABLE ADD COLUMN`, que en SQLite es una operacion segura: las
 * filas existentes toman el valor por defecto. Los datos del usuario jamas se
 * tocan.
 *
 * Nueva tabla `license_revocations`: cache LOCAL de los hashes revocados. Guardar
 * los hashes (no los codigos) permite que una revocacion surta efecto aunque el
 * equipo este sin conexion en el momento de la consulta.
 */

import type { Database } from '../database'

const SQL = `
ALTER TABLE licenses ADD COLUMN online_state TEXT NOT NULL DEFAULT 'unknown'
  CHECK (online_state IN ('unknown','verified','offline','rejected'));
ALTER TABLE licenses ADD COLUMN online_error TEXT NOT NULL DEFAULT '';
ALTER TABLE licenses ADD COLUMN revocation_cursor TEXT;

CREATE TABLE license_revocations (
  code_hash   TEXT PRIMARY KEY,
  revoked_at  TEXT NOT NULL,
  seen_at     TEXT NOT NULL
);

CREATE INDEX ix_license_revocations_seen ON license_revocations(seen_at DESC);
`

export const migration005 = {
  version: 5,
  name: 'licencias-online',
  up: (db: Database): void => {
    db.exec(SQL)
  }
}
