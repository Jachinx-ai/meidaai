-- ============================================================
-- 美搭 · 埋点事件表（在 Supabase SQL Editor 里跑一次）
-- 只存行为事件，不存图片/密码等敏感数据。写入用 service key，
-- 前端只经我们自己的 /api/track，绝不直连库。务必开 RLS 让匿名 key 碰不到。
-- ============================================================

create table if not exists events (
  id         bigserial primary key,
  ts         timestamptz not null default now(),
  event      text        not null,        -- 事件名：page_view / tryon_submit / quota_block ...
  email      text,                         -- 登录用户；匿名为 null
  session_id text,                         -- 前端生成，贯穿一次会话（跨页面复用）
  page       text,                         -- 来源页 如 tryon.html
  props      jsonb       not null default '{}',  -- 事件参数 {scene,itemCount,kind ...}
  ua         text                          -- User-Agent（已截断，脱敏用）
);

-- 看板按 事件+时间、用户+时间 查，建两个索引
create index if not exists idx_events_event_ts on events (event, ts desc);
create index if not exists idx_events_email_ts on events (email, ts desc);

-- 开 RLS：无策略 = 只有 service key 能读写，匿名 anon key 完全碰不到
alter table events enable row level security;

-- 可选：只保留最近 90 天，避免无限膨胀（需要 pg_cron 扩展；不开也不影响）
-- select cron.schedule('purge-events', '0 4 * * *',
--   $$ delete from events where ts < now() - interval '90 days' $$);
