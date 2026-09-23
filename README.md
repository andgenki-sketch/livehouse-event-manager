# LIVE HOUSE EVENT MANAGER Ver.1

## 起動
1. Node.js 20+ を用意
2. `npm install`
3. `npm run dev`
4. http://localhost:3000 を開く

## クラウドDB
Supabaseで新規プロジェクトを作り、`supabase.sql` をSQL Editorで実行します。`.env.example` を `.env.local` にコピーしてURLとAnon Keyを設定してください。

現時点のUIはローカルstateで即操作できるプロトタイプです。`supabase.sql` に events / artists / bookings / tasks のクラウド保存スキーマを同梱しています。次工程でSupabase AuthとCRUDを接続できます。
