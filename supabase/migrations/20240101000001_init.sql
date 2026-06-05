-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- TENANTS  (multi-tenant foundation from Day 1)
-- ─────────────────────────────────────────────
create table if not exists tenants (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  is_active   boolean not null default true,
  settings    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

insert into tenants (name, slug)
values ('TEDx Pune', 'tedxpune')
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('USER', 'ADMIN', 'SUPER_ADMIN');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_status as enum ('PENDING_APPROVAL', 'ACTIVE', 'BLOCKED');
exception when duplicate_object then null;
end $$;

create table if not exists users (
  id               uuid primary key default uuid_generate_v4(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  linkedin_id      text,
  email            text not null,
  full_name        text not null,
  avatar_url       text,
  headline         text,
  role             user_role not null default 'USER',
  status           user_status not null default 'PENDING_APPROVAL',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, email)
);

create index if not exists idx_users_tenant  on users(tenant_id);
create index if not exists idx_users_status  on users(tenant_id, status);

-- ─────────────────────────────────────────────
-- POSTS
-- ─────────────────────────────────────────────
do $$ begin
  create type post_status as enum ('ACTIVE', 'DELETED');
exception when duplicate_object then null;
end $$;

create table if not exists posts (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  author_id   uuid not null references users(id) on delete cascade,
  body        text not null check (char_length(body) <= 3000),
  status      post_status not null default 'ACTIVE',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_posts_tenant_feed
  on posts(tenant_id, created_at desc) where status = 'ACTIVE';

-- ─────────────────────────────────────────────
-- COMMENTS  (max 2 levels: comment → reply)
-- ─────────────────────────────────────────────
create table if not exists comments (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  post_id     uuid not null references posts(id) on delete cascade,
  author_id   uuid not null references users(id) on delete cascade,
  parent_id   uuid references comments(id) on delete cascade,
  body        text not null check (char_length(body) <= 1000),
  depth       smallint not null default 0 check (depth <= 1),
  is_deleted  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_comments_post on comments(post_id, created_at);

-- ─────────────────────────────────────────────
-- LIKES  (posts only for MVP)
-- ─────────────────────────────────────────────
create table if not exists likes (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (post_id, user_id)
);

-- ─────────────────────────────────────────────
-- UPDATED_AT trigger helper
-- ─────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_posts_updated_at on posts;
create trigger trg_posts_updated_at before update on posts
  for each row execute function set_updated_at();
