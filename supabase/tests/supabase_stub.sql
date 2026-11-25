-- Minimal stub av det Supabase-projektet har innan 20261121170000_game_server.sql,
-- för att testa migrationen mot en lokal Postgres. Speglar docs/backend/supabase-current-setup.md.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create type public.app_role as enum ('platform_admin');
create type public.campaign_role as enum ('gm', 'player');
create type public.campaign_status as enum ('setup', 'active', 'paused', 'completed', 'archived');
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade, role public.app_role not null, unique (user_id, role));
create function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;
create table public.campaigns (id uuid primary key default gen_random_uuid(), name text not null, description text, status public.campaign_status not null default 'setup', current_round integer not null default 0, max_players integer not null default 20, created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.campaign_members (id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns (id) on delete cascade, user_id uuid not null, role public.campaign_role not null, display_name text, joined_at timestamptz not null default now(), unique (campaign_id, user_id));
create function public.is_campaign_member(_user_id uuid, _campaign_id uuid) returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.campaign_members where user_id = _user_id and campaign_id = _campaign_id) $$;
create function public.is_campaign_gm(_user_id uuid, _campaign_id uuid) returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.campaign_members where user_id = _user_id and campaign_id = _campaign_id and role = 'gm') $$;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
create policy "members can view their campaigns" on public.campaigns for select to authenticated using (public.is_campaign_member(auth.uid(), id));
create policy "members can view co-members" on public.campaign_members for select to authenticated using (public.is_campaign_member(auth.uid(), campaign_id));
create policy "creator becomes first gm" on public.campaign_members for insert to authenticated with check ((auth.uid() = user_id) or public.is_campaign_gm(auth.uid(), campaign_id));
-- Som i Supabase: nya tabeller och funktioner i public får rättigheter för anon/authenticated som standard.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
