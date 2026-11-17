create table public.tinavitrine_app_state (
  id text primary key check (id = 'main'),
  state jsonb not null,
  version bigint not null check (version >= 1),
  updated_at timestamptz not null default now()
);

alter table public.tinavitrine_app_state enable row level security;
revoke all on table public.tinavitrine_app_state from public, anon, authenticated;
grant select, insert, update on table public.tinavitrine_app_state to service_role;

create table public.tinavitrine_access_keys (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.tinavitrine_access_keys enable row level security;
revoke all on table public.tinavitrine_access_keys from public, anon, authenticated;
grant select on table public.tinavitrine_access_keys to service_role;

insert into public.tinavitrine_access_keys (key_hash)
values ('2cca96b1a3dcdcf7082d851df2675211012b53627434b8b5521c88265315466e');
