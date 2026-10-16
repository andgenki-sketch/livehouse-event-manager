# Owner staff management

チーム管理 is owner-only and contains basic profiles, multiple position tags, effective-month salary settings, coaching records, and monthly production goals linked to event booking_staff_id.

Shift candidates stay on one page: テクニカル (PA, 照明, SS, 映像), 運営スタッフ, 担当未設定. Multiple tags place a staff member in both relevant groups with one shared selection. Tags and authorization roles are independent. Technical-manager shift permissions cover the four technical positions.

Private records use owner-only database RLS; tags are team-readable and owner-editable. Compound staff/team foreign keys prevent cross-team association. Existing compensation has a 0001-01-01 baseline. Payroll selects the latest rate effective at the start of its target month. A SECURITY INVOKER trigger blocks edits to past months or confirmed periods. The old payroll form retains adjustments but directs rate changes to チーム管理.

Database setup: supabase/manual/team_management.sql, applied transactionally through execute_sql after the migration endpoint twice returned Invalid or expired requestState. Existing staff, events and attendance were retained. All added tables are in public and included in the existing backup.

Validation: Next.js build, candidate-group tests, and rolled-back SQL tests of owner access, non-owner private-data isolation, tags read-only, outsider isolation, future-rate isolation and past-write rejection. Existing two pay records retained as two baselines; test staff cleaned by rollback. Security advisors reported no findings on new tables/trigger. Authenticated desktop/mobile browser interaction remains to be verified.
