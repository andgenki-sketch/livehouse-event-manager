-- STAGED MIGRATION: DO NOT APPLY UNTIL ALL CLIENTS USE SAFE COLUMN PROJECTIONS.
-- PostgREST select('*') will fail for anon/authenticated after column SELECT is revoked.
-- This migration intentionally does not remove or rewrite existing records.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_event_contracts(p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = auth.uid()
      AND tm.role IN ('owner','member')
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_event_contracts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_event_contracts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_event_contracts(p_event_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT jsonb_build_object(
   'hall_rental_fee',e.hall_rental_fee,
   'hall_equipment_fee',e.hall_equipment_fee,
   'attendance_guarantee',e.attendance_guarantee,
   'video_shooting',e.video_shooting,
   'after_party',e.after_party,
   'hall_rental_memo',e.hall_rental_memo,
   'memo',e.memo,
   'revenue_budget',e.revenue_budget
 )
 FROM public.events e
 WHERE e.id=p_event_id AND public.can_view_event_contracts(e.team_id)
$$;
REVOKE ALL ON FUNCTION public.get_event_contracts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_contracts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_event_artist_contracts(p_event_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',ea.id,'guarantee',ea.guarantee,
   'ticket_quota_price',ea.ticket_quota_price,
   'ticket_quota_count',ea.ticket_quota_count,
   'expected_attendance',ea.expected_attendance,
   'equipment_fee_enabled',ea.equipment_fee_enabled,
   'memo',ea.memo,'notes',ea.notes
 )), '[]'::jsonb)
 FROM public.event_artists ea
 WHERE ea.event_id=p_event_id AND public.can_view_event_contracts(ea.team_id)
$$;
REVOKE ALL ON FUNCTION public.get_event_artist_contracts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_artist_contracts(uuid) TO authenticated;

-- Column-level privileges: preserve safe columns, revoke all table-wide SELECT.
-- Run only after deploying the safe-projection application and validating
-- every public-facing API consumer; the existing production UI still uses SELECT *.
-- WARNING: verify all API clients and public website no longer use select('*').
REVOKE SELECT ON public.events FROM anon, authenticated;
REVOKE SELECT ON public.event_artists FROM anon, authenticated;

GRANT SELECT (
 id,user_id,title,event_date,open_time,start_time,venue,organizer,capacity,
 advance_price,door_price,status,description,created_at,updated_at,team_id,
 website_published,public_description,calendar_sort_order,event_genre,flyer_path,
 booking_staff_id,day_notes,website_pickup,website_pickup_order
) ON public.events TO anon,authenticated;
GRANT SELECT (
 id,user_id,event_id,artist_id,booking_status,performance_time,
 created_at,updated_at,team_id,sort_order
) ON public.event_artists TO anon,authenticated;

-- events.memo and events.revenue_budget are also protected via the contract RPC.
-- Verify all readers and writers of these fields before activation.
-- Contract fields remain writable only according to existing UPDATE RLS policies;
-- this migration is specifically a read-access restriction.
-- Abort migration if a sensitive field remains readable by anonymous or authenticated clients.
DO $$
BEGIN
 IF has_column_privilege('anon','public.events','hall_rental_fee','SELECT')
 OR has_column_privilege('authenticated','public.events','hall_rental_fee','SELECT')
 OR has_column_privilege('anon','public.event_artists','guarantee','SELECT')
 OR has_column_privilege('authenticated','public.event_artists','guarantee','SELECT')
 OR has_column_privilege('authenticated','public.events','revenue_budget','SELECT')
 THEN RAISE EXCEPTION 'Sensitive contract column SELECT privilege remains';
 END IF;
END;
$$;
COMMIT;
