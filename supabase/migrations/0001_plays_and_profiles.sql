-- Accounts and persistence: one table for people, one for systems.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.plays (
  id uuid primary key,
  owner_id uuid not null references auth.users on delete cascade,
  name text not null,
  court text not null,
  extent text not null,
  is_public boolean not null default false,
  schema_version int not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plays_owner_updated_idx on public.plays (owner_id, updated_at desc);
create index plays_public_updated_idx on public.plays (is_public, updated_at desc);

alter table public.profiles enable row level security;
alter table public.plays enable row level security;

-- Profiles: readable by anyone, written by their owner.
create policy "profiles are readable by everyone"
  on public.profiles for select
  using (true);

create policy "profiles are inserted by their owner"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles are updated by their owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles are deleted by their owner"
  on public.profiles for delete
  using (auth.uid() = id);

-- Plays: readable when public or owned, written by their owner alone.
create policy "plays are readable when public or owned"
  on public.plays for select
  using (is_public or owner_id = auth.uid());

create policy "plays are inserted by their owner"
  on public.plays for insert
  with check (owner_id = auth.uid());

create policy "plays are updated by their owner"
  on public.plays for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "plays are deleted by their owner"
  on public.plays for delete
  using (owner_id = auth.uid());

-- Keep updated_at honest on every update.
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger plays_set_updated_at
  before update on public.plays
  for each row execute function public.set_updated_at();
