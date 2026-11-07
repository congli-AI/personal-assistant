-- 个人助理 · Supabase 初始化脚本
-- 在 Supabase 控制台 → SQL Editor 里整段执行

-- 1) 每个用户一行，整份数据存成 JSONB（待办 / 课表 / 聊天 / 设置）
create table if not exists public.app_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) 行级权限：只能读写自己的那一行
alter table public.app_state enable row level security;

drop policy if exists "own state" on public.app_state;
create policy "own state"
  on public.app_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) updated_at 自动更新
create or replace function public.touch_app_state()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_app_state on public.app_state;
create trigger trg_touch_app_state
  before update on public.app_state
  for each row execute function public.touch_app_state();

-- 4) 索引（按更新时间排序时用得上）
create index if not exists app_state_updated_idx on public.app_state (updated_at desc);

-- ---------------------------------------------------------------
-- 说明：
-- * 目前用「整份 JSON 存一行」的方式，好处是同步逻辑极简、加字段不用改表。
-- * 用户量上来、需要按条查询/统计时，再把 todos / courses 拆成独立表，
--   详见 docs/architecture.md 的数据模型。
-- ---------------------------------------------------------------
