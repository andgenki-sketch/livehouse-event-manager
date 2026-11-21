-- Applied to Supabase project via migration history 20261121073441.
-- Production team members can read monthly finance cashflow.
-- Insert/update/delete policies stay owner-only.
create policy cashflow_production_read on public.cashflow_monthly
 for select to authenticated
 using (public.can_view_event_contracts(team_id));
