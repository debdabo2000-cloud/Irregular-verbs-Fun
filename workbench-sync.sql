create table if not exists public.workbench_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);

alter table public.workbench_snapshots enable row level security;
revoke all on public.workbench_snapshots from anon, authenticated;
grant select, insert, update on public.workbench_snapshots to authenticated;

drop policy if exists "Read own workbench" on public.workbench_snapshots;
create policy "Read own workbench" on public.workbench_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Create own workbench" on public.workbench_snapshots;
create policy "Create own workbench" on public.workbench_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Update own workbench" on public.workbench_snapshots;
create policy "Update own workbench" on public.workbench_snapshots for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
