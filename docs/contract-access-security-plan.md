# 出演条件・ホールレンタル契約情報のアクセス制御

## 対象権限
- owner / member（制作スタッフ）: 契約情報を閲覧・編集可能
- general_staff / technical_manager / viewer: 契約情報は取得不可
- anon: 公開イベントの一般情報のみ

## 現状の危険箇所（本番未修正）
- public.events の hall_rental_fee, hall_equipment_fee, attendance_guarantee, video_shooting, after_party, hall_rental_memo, revenue_budget, memo は通常の SELECT * で取得される
- public.event_artists の guarantee, ticket_quota_price, ticket_quota_count, expected_attendance, equipment_fee_enabled, memo, notes は通常の SELECT * で取得される
- 両テーブルとも anon / authenticated にテーブル単位 SELECT が付与され、RLS は同一チーム内で権限を区別していない
- 公開イベントの SELECT ポリシーも存在するため、公開イベントの契約情報が外部に見えるリスクがある
- app/page.js と当日画面、公開ウェブサイトが SELECT * を使用している

## 安全な実装順序
1. 対象の契約情報カラムを private テーブルに移し、既存行をバックフィルする。team_id + event_id / event_artist_id で参照整合性を維持する。
2. SECURITY DEFINER の専用 RPC を用意し、auth.uid() による team_members.role の owner/member チェックをサーバー側で実施。anon に EXECUTE を与えない。
3. 書き込みも専用 RPC に移し、制作スタッフ以外による更新を拒否する。
4. app/page.js の全 SELECT * を監査し、公開イベント・一般スタッフ・当日画面は安全な通常カラムだけを取得。制作スタッフのみ専用 RPC で契約情報を合成する。
5. 公開ウェブサイトとカレンダー、ブッキング、イベント複製、収支、当日画面を回帰テストする。
6. テストが通った後に旧テーブルの契約カラムを削除し、旧 SELECT * で取得できないことを確認する。
7. 実アカウント（owner/member/general_staff/technical_manager/viewer/anon）でアクセス検証し、本番に段階的に反映する。

## リリース前の必須検証
- general_staff / technical_manager / viewer / anon の REST API から契約金額・契約メモを取得できない
- owner/member は過去データを含めて契約情報を確認・更新できる
- 一般スタッフはイベント名・日時・出演者・タイムテーブルを閲覧できる
- 公開サイトのイベント・出演者表示が壊れない
- 既存の収支計算、ホールレンタル編集、出演条件編集が壊れない

**注意：UI だけの PR #27 は本番マージ禁止。データベースの安全な移行と同時に実施する。**
