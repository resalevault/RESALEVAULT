-- RESALEVAULT - registro online de licencias.
--
-- Regla de oro: la clave privada Ed25519 NO vive aqui. La firma se genera en la
-- maquina del emisor (`npm run license:new`) y este registro solo guarda el
-- codigo ya firmado, su hash y el estado. Asi, una filtracion de la base de
-- datos no permite emitir licencias nuevas.
--
-- RLS activado y SIN politicas: solo el service_role (que salta RLS) puede leer
-- o escribir. El cliente de escritorio nunca habla con estas tablas: llama a la
-- Edge Function, que aplica las reglas de negocio.

create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  payload_id text not null unique,
  code text not null,
  code_hash text not null unique,
  plan text not null check (plan in ('free', 'pro', 'business')),
  kind text not null check (kind in ('perpetual', 'subscription', 'founder')),
  holder text not null default '',
  seats integer not null default 1 check (seats >= 1 and seats <= 10000),
  status text not null default 'active' check (status in ('active', 'revoked', 'suspended')),
  issued_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint licenses_revoked_consistency check (status <> 'revoked' or revoked_at is not null),
  constraint licenses_hash_format check (code_hash ~ '^[0-9a-f]{64}$')
);

create index licenses_status_idx on public.licenses (status);
create index licenses_revoked_at_idx on public.licenses (revoked_at) where revoked_at is not null;

create table public.license_activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses (id) on delete cascade,
  machine_id text not null check (length(machine_id) between 8 and 128),
  machine_label text not null default '',
  app_version text not null default '',
  os text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (license_id, machine_id)
);

create index license_activations_license_idx on public.license_activations (license_id);

alter table public.licenses enable row level security;
alter table public.license_activations enable row level security;

-- Sin politicas a proposito. No anadir `using (true)`: expondria los hashes y
-- permitiria a cualquiera ocupar puestos.

comment on table public.licenses is
  'Licencias emitidas. `code` es el codigo firmado que ya tiene el cliente; no es un secreto.';
comment on table public.license_activations is
  'Equipos activados por licencia. El limite de puestos se aplica en la Edge Function.';
