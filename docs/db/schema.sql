-- ============================================================================
-- 命理綜合分析平台 — V4 資料層草案（Postgres 15+ / Supabase）
-- ARCHITECTURE-V2 §10、§10.1；DECISIONS D-014、D-028、D-029、D-033
--
-- 狀態：設計稿，尚未在任何環境執行（目前沒有資料庫與帳號；D-029 本地優先，
-- 瀏覽器單機模式不需要這份 schema）。上線前須再審一次 RLS 與加密金鑰管理。
--
-- 原則
--   * 出生資料與人生事件是敏感個資：全部表啟用 RLS，只有本人可讀寫；
--     刪除使用者 → ON DELETE CASCADE 清掉所有衍生資料（一鍵刪除）。
--   * 規則／權重版本「只增不改」（D-028）：rules、trait_weights、weight_sets
--     以 trigger 禁止 UPDATE / DELETE，調整只能新增版本，舊報告可重現（D-014）。
--   * 回驗結果（backtest_runs）記錄方法版本、種子、切分與樣本數，n < 30 的
--     結果標記「樣本不足」，不得用來調整權重（§10.1）。
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- users：Supabase 的 auth.users 為帳號來源；這裡只放 app 端設定。
-- ---------------------------------------------------------------------------
create table public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  created_at    timestamptz not null default now(),
  -- 使用者同意把資料同步到伺服器的時間；null = 只用本機（D-029）。
  sync_consent_at timestamptz
);

-- ---------------------------------------------------------------------------
-- birth_profiles：敏感個資。
-- 欄位加密：birth_date / birth_time / birthplace_label 以 pgcrypto
--   pgp_sym_encrypt(value, key) 存成 bytea；key 不放在資料庫內
--   （Supabase Vault 或伺服器端環境變數，由 API 層在 session 中提供）。
--   查詢時 pgp_sym_decrypt(col, key)。lat/lng 只存到 0.01°（約 1 km）以降低識別度。
-- input_hash：sha256(正規化出生資料 + salt)，供 chart_snapshots 去重，不可逆。
-- ---------------------------------------------------------------------------
create table public.birth_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  label             text,                                  -- 使用者自訂暱稱（非必填）
  birth_date_enc    bytea not null,                        -- pgp_sym_encrypt('YYYY-MM-DD')
  birth_time_enc    bytea,                                 -- pgp_sym_encrypt('HH:MM')；null = 時辰不明
  time_accuracy     text not null check (time_accuracy in ('exact','approx15m','approx1h','unknown')),
  gender            text not null check (gender in ('male','female')),
  birthplace_label_enc bytea,                              -- pgp_sym_encrypt(城市名稱)
  lat_rounded       numeric(5,2),
  lng_rounded       numeric(6,2),
  timezone          text not null,                         -- IANA
  input_hash        text not null,
  created_at        timestamptz not null default now(),
  unique (user_id, input_hash)
);
create index on public.birth_profiles (user_id);

-- ---------------------------------------------------------------------------
-- chart_snapshots：(profile, system, calculator_version, input_hash) → chart
-- ---------------------------------------------------------------------------
create table public.chart_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.birth_profiles (id) on delete cascade,
  system             text not null check (system in ('bazi','ziwei','numerology','tzolkin','mingGua','jyotish','humanDesign')),
  calculator_version text not null,
  input_hash         text not null,
  chart              jsonb not null,
  warnings           text[] not null default '{}',
  created_at         timestamptz not null default now(),
  unique (profile_id, system, calculator_version, input_hash)
);

-- ---------------------------------------------------------------------------
-- rules / trait_weights / weight_sets：版本化，只增不改（D-028）
-- ---------------------------------------------------------------------------
create table public.rules (
  id          text not null,             -- e.g. 'bazi.branch.clash'
  version     integer not null check (version >= 1),
  system      text not null,
  scope       text not null check (scope in ('natal','decade','year','month')),
  definition  jsonb not null,            -- 條件資料（不含定性文字）
  created_at  timestamptz not null default now(),
  primary key (id, version)
);

create table public.trait_weights (
  rule_id      text not null,
  rule_version integer not null,
  version      integer not null check (version >= 1),
  emits        jsonb not null,           -- [{ domain, trait, intensity, valence }]
  parent_version integer,                -- 由哪一版調整而來（null = 初版）
  source_backtest_run uuid,              -- 若由回驗產生
  created_at   timestamptz not null default now(),
  primary key (rule_id, rule_version, version),
  foreign key (rule_id, rule_version) references public.rules (id, version)
);

-- 系統權重 wₛ、四段切點等全域參數（D-033 待回驗決定）。
create table public.weight_sets (
  version        integer primary key check (version >= 1),
  parent_version integer references public.weight_sets (version),
  system_weights jsonb not null,         -- { bazi: 1, ziwei: 1, ... }
  band_cuts      numeric[] not null default '{35,55,75}',
  rule_weight_multipliers jsonb not null default '{}',
  source_backtest_run uuid,
  created_at     timestamptz not null default now()
);

create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only (D-028): add a new version instead', tg_table_name;
end $$;

create trigger rules_append_only        before update or delete on public.rules         for each row execute function public.forbid_mutation();
create trigger trait_weights_append_only before update or delete on public.trait_weights for each row execute function public.forbid_mutation();
create trigger weight_sets_append_only  before update or delete on public.weight_sets   for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- signals：某 snapshot 在某時間窗發出的訊號（§6）
-- ---------------------------------------------------------------------------
create table public.signals (
  id            text not null,                    -- 決定性 hash（signalId）
  snapshot_id   uuid not null references public.chart_snapshots (id) on delete cascade,
  rule_id       text not null,
  rule_version  integer not null,
  weight_version integer not null references public.weight_sets (version),
  window_grain  text not null check (window_grain in ('natal','decade','year','month')),
  window_start  date not null,
  window_end    date not null,
  domain        text not null,
  trait         text not null,
  intensity     numeric(5,4) not null check (intensity between 0 and 1),
  valence       numeric(5,4) not null check (valence between -1 and 1),
  evidence      jsonb not null,
  primary key (snapshot_id, id),
  foreign key (rule_id, rule_version) references public.rules (id, version)
);
create index on public.signals (snapshot_id, window_start, domain);

-- ---------------------------------------------------------------------------
-- annual_cycles / monthly_cycles：timeline 快取（可隨時重算，刪了無妨）
-- ---------------------------------------------------------------------------
create table public.annual_cycles (
  profile_id     uuid not null references public.birth_profiles (id) on delete cascade,
  year           integer not null,
  weight_version integer not null references public.weight_sets (version),
  engine_version text not null,
  domains        jsonb not null,                  -- TimelineDomainCell[]
  created_at     timestamptz not null default now(),
  primary key (profile_id, year, weight_version, engine_version)
);

create table public.monthly_cycles (
  profile_id     uuid not null references public.birth_profiles (id) on delete cascade,
  month          date not null,                   -- 當月第一天
  weight_version integer not null references public.weight_sets (version),
  engine_version text not null,
  domains        jsonb not null,
  created_at     timestamptz not null default now(),
  primary key (profile_id, month, weight_version, engine_version)
);

-- ---------------------------------------------------------------------------
-- interpretations：AI 輸出 + prompt/model 版本 + citations（V5）
-- 送 AI 的 profile 必須去識別化（D-029）：不存、不送姓名與出生地標籤。
-- ---------------------------------------------------------------------------
create table public.interpretations (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.birth_profiles (id) on delete cascade,
  kind            text not null,                  -- 'report' | 'question' | ...
  prompt_version  text not null,
  model           text not null,
  weight_version  integer references public.weight_sets (version),
  output          text not null,
  citations       jsonb not null default '[]',    -- signal ids / component ids
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- life_events：使用者自填的人生事件（敏感）。description 加密。
-- ---------------------------------------------------------------------------
create table public.life_events (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.birth_profiles (id) on delete cascade,
  event_date      text not null check (event_date ~ '^\d{4}-\d{2}(-\d{2})?$'),   -- 'YYYY-MM' | 'YYYY-MM-DD'
  category        text not null check (category in ('job_change','startup_timing','relationship_timing','relocation',
                                                    'property_purchase','vehicle_purchase','investment','study_exam',
                                                    'education','health_event','other')),
  domains         text[] not null check (cardinality(domains) >= 1
                    and domains <@ array['self','career','wealth','relationship','family','movement','property','learning','contract','health']),
  description_enc bytea,                          -- pgp_sym_encrypt(description)
  confidence      text not null check (confidence in ('certain','approx')),
  created_at      timestamptz not null default now()
);
create index on public.life_events (profile_id);

-- ---------------------------------------------------------------------------
-- backtest_runs：每次回驗一筆；結果 jsonb = core runBacktest() 輸出（去掉 description）
-- ---------------------------------------------------------------------------
create table public.backtest_runs (
  id                  uuid primary key default gen_random_uuid(),
  -- null = 跨使用者匯總（需另行取得同意、只存聚合結果）
  profile_id          uuid references public.birth_profiles (id) on delete cascade,
  method_version      integer not null,
  weight_version      integer not null references public.weight_sets (version),
  engine_version      text not null,
  seed                text not null,
  validation_fraction numeric(3,2) not null,
  n_events            integer not null,
  n_validation_trials integer not null,
  overall_hit_rate    numeric(5,4),
  overall_baseline    numeric(5,4),
  status              text not null check (status in ('樣本不足','可評估')),
  result              jsonb not null,
  created_at          timestamptz not null default now()
);

alter table public.weight_sets   add constraint weight_sets_backtest_fk   foreign key (source_backtest_run) references public.backtest_runs (id);
alter table public.trait_weights add constraint trait_weights_backtest_fk foreign key (source_backtest_run) references public.backtest_runs (id);

-- ---------------------------------------------------------------------------
-- Row Level Security：只有本人。版本表（rules / trait_weights / weight_sets）
-- 所有登入者可讀，只有 service_role 可新增。
-- ---------------------------------------------------------------------------
alter table public.users            enable row level security;
alter table public.birth_profiles   enable row level security;
alter table public.chart_snapshots  enable row level security;
alter table public.signals          enable row level security;
alter table public.annual_cycles    enable row level security;
alter table public.monthly_cycles   enable row level security;
alter table public.interpretations  enable row level security;
alter table public.life_events      enable row level security;
alter table public.backtest_runs    enable row level security;
alter table public.rules            enable row level security;
alter table public.trait_weights    enable row level security;
alter table public.weight_sets      enable row level security;

create policy users_self on public.users
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_owner on public.birth_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 其餘個人資料表透過 profile_id 追溯擁有者。
create or replace function public.owns_profile(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.birth_profiles bp where bp.id = p and bp.user_id = auth.uid())
$$;

create policy snapshots_owner   on public.chart_snapshots for all using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
create policy annual_owner      on public.annual_cycles   for all using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
create policy monthly_owner     on public.monthly_cycles  for all using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
create policy interp_owner      on public.interpretations for all using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
create policy events_owner      on public.life_events     for all using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
create policy backtests_owner   on public.backtest_runs   for all using (profile_id is not null and public.owns_profile(profile_id))
                                                           with check (profile_id is not null and public.owns_profile(profile_id));
create policy signals_owner on public.signals for all
  using (exists (select 1 from public.chart_snapshots cs where cs.id = snapshot_id and public.owns_profile(cs.profile_id)))
  with check (exists (select 1 from public.chart_snapshots cs where cs.id = snapshot_id and public.owns_profile(cs.profile_id)));

create policy rules_read         on public.rules         for select to authenticated using (true);
create policy trait_weights_read on public.trait_weights for select to authenticated using (true);
create policy weight_sets_read   on public.weight_sets   for select to authenticated using (true);
-- 無 insert policy → 只有 service_role（繞過 RLS）能新增版本。

-- ---------------------------------------------------------------------------
-- 一鍵刪除：刪 auth.users → users → birth_profiles → 其餘全部 cascade。
-- 只刪某一份命盤：delete from birth_profiles where id = $1（同樣 cascade）。
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_data() returns void
language sql security definer set search_path = public as $$
  delete from public.users where id = auth.uid();
$$;

-- 初始權重版本（D-033：系統權重皆 1、切點 35/55/75）。
insert into public.weight_sets (version, parent_version, system_weights, band_cuts)
values (1, null, '{"bazi":1,"ziwei":1,"numerology":1,"jyotish":1,"humanDesign":1}', '{35,55,75}');
