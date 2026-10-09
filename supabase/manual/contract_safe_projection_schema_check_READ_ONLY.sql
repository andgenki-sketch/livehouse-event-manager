-- READ ONLY: verify that every safe-projection field exists before activating
-- 20261008_contract_column_security_STAGED.sql.
WITH expected(table_name,column_name) AS (
 SELECT 'events',unnest(string_to_array(
 'id,user_id,title,event_date,open_time,start_time,venue,organizer,capacity,advance_price,door_price,status,description,created_at,updated_at,team_id,website_published,public_description,calendar_sort_order,event_genre,flyer_path,booking_staff_id,day_notes,website_pickup,website_pickup_order',','))
 UNION ALL
 SELECT 'event_artists',unnest(string_to_array(
 'id,user_id,event_id,artist_id,booking_status,performance_time,created_at,updated_at,team_id,sort_order',','))
)
SELECT e.table_name,e.column_name AS missing_column
FROM expected e
LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
WHERE c.column_name IS NULL;

-- Empty result is required. This does not prove the web client is compatible.
