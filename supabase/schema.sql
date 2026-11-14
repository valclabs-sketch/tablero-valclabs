-- =========================================================
--  Tablero ValClabs — esquema de base de datos (Supabase)
--  Pega TODO este archivo en Supabase > SQL Editor > Run
-- =========================================================

create extension if not exists "pgcrypto";

-- Personas del equipo
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  color text default '#5e35b1',
  created_at timestamptz default now()
);

-- Proyectos
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text default '#9575cd',
  created_at timestamptz default now()
);

-- Tareas (tarjetas del kanban)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  status text not null default 'pendiente'
    check (status in ('pendiente','en_progreso','revision','hecho')),
  priority text not null default 'media'
    check (priority in ('baja','media','alta')),
  assignee_id uuid references members(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  due_date date,
  reminder_at timestamptz,
  reminder_sent boolean default false,
  position double precision default 0,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Notas de reuniones
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meeting_date date not null default current_date,
  project_id uuid references projects(id) on delete set null,
  attendees uuid[] default '{}',
  content text default '',
  agreements text default '',
  created_by uuid references members(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Notificaciones dentro de la app
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  text text not null,
  task_id uuid references tasks(id) on delete cascade,
  read boolean default false,
  created_at timestamptz default now()
);

-- Suscripciones para notificaciones push en el celular
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  endpoint text unique not null,
  subscription jsonb not null,
  created_at timestamptz default now()
);

-- Archivos adjuntos (lista de {name, size, type, path})
alter table tasks add column if not exists attachments jsonb default '[]'::jsonb;
alter table notes add column if not exists attachments jsonb default '[]'::jsonb;

-- Avisos automáticos de entrega (N días antes y el mismo día)
alter table tasks add column if not exists remind_days_before int default 1;
alter table tasks add column if not exists due_warned_before boolean default false;
alter table tasks add column if not exists due_warned_today boolean default false;

-- Carpeta privada para los archivos (Supabase Storage)
insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;
drop policy if exists "equipo_adjuntos_select" on storage.objects;
drop policy if exists "equipo_adjuntos_insert" on storage.objects;
drop policy if exists "equipo_adjuntos_delete" on storage.objects;
create policy "equipo_adjuntos_select" on storage.objects for select to authenticated using (bucket_id = 'adjuntos');
create policy "equipo_adjuntos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'adjuntos');
create policy "equipo_adjuntos_delete" on storage.objects for delete to authenticated using (bucket_id = 'adjuntos');

-- Seguridad: solo usuarios con sesión iniciada pueden leer y escribir
alter table members            enable row level security;
alter table projects           enable row level security;
alter table tasks              enable row level security;
alter table notes              enable row level security;
alter table notifications      enable row level security;
alter table push_subscriptions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members','projects','tasks','notes','notifications','push_subscriptions'] loop
    execute format('drop policy if exists "equipo_%1$s" on %1$s', t);
    execute format('create policy "equipo_%1$s" on %1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Tiempo real (el tablero se actualiza solo en todos los dispositivos)
do $$
declare t text;
begin
  foreach t in array array['members','projects','tasks','notes','notifications'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

