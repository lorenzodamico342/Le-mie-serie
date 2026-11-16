-- Le mie serie: tabella delle serie, una riga per serie e per utente.
-- Da eseguire una volta in Supabase > SQL Editor > New query > Run.

create table if not exists public.shows (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tmdb_id     integer,
  title       text not null,
  status      text not null default 'watching'
              check (status in ('watching', 'paused', 'todo', 'done')),
  platform    text,
  seasons     integer[] not null default '{}',  -- episodi per stagione, es. {10,10,8}
  season      integer not null default 1,        -- stagione attuale
  episode     integer not null default 0,        -- ultimo episodio visto (0 = nessuno)
  year        text,
  genre       text,
  plot        text,
  poster      text,                              -- percorso poster TMDB, es. /abc.jpg
  ongoing     boolean,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shows_user_idx on public.shows (user_id, updated_at desc);

-- Ognuno vede e modifica solo le proprie serie.
alter table public.shows enable row level security;

drop policy if exists "shows: solo le mie" on public.shows;
create policy "shows: solo le mie" on public.shows
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
