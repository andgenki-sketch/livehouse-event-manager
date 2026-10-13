# 暗号化バックアップ

本番への操作は読み取りのみ。public / auth / storage と、存在する場合は supabase_migrations の構造・データを PostgreSQL 17 のカスタム形式で取得します。ロール定義はパスワードなしで別途保存します。Storage の実ファイルも取得し、元のバケット名・オブジェクト名と対応表を暗号化アーカイブに保存します。

## 初期設定

Repository secrets に以下を登録します。値をソースコード・ログ・スクリーンショットに載せないでください。

- SUPABASE_DB_PASSWORD: 既存のデータベースパスワード
- BACKUP_ENCRYPTION_PASSWORD: 32文字以上のランダムな専用パスワード。復元用にパスワード管理アプリにも保管
- SUPABASE_SERVICE_ROLE_KEY: 対象プロジェクトの legacy service_role キー。Storage 読み取りに使用。強い権限があるため Secrets にのみ登録

Actions → Encrypted Supabase backup → Run workflow で手動実行します。成功・成果物の存在を確認し、成果物をダウンロードして下記の復号確認を行います。最初は定期実行を無効にしています。確認後、Repository variables に BACKUP_SCHEDULE_ENABLED=true を登録すると毎日 04:17 JST の実行が有効になります。

## 復号・確認

暗号化ファイルは公開リポジトリの Actions artifact に30日保存します。外部の認証済み利用者がダウンロードできる前提のため、暗号化パスワードを必ず別途保管してください。平文はアップロードしません。

ダウンロードしたZIPを展開し、ローカルで以下を実行します。gpg が対話式にパスワードを尋ねます。

```sh
shasum -a 256 -c backup.tar.gz.gpg.sha256
gpg --output backup.tar.gz --decrypt backup.tar.gz.gpg
tar -xzf backup.tar.gz
pg_restore --list backup/database.dump
```

manifest.json に Storage の元の名前と backup_file、サイズ、SHA256 が入ります。checksums.json は平文ファイルのチェックサムです。ワークフローはDBアーカイブ全体の読み取りと、暗号化後の復号・ハッシュ一致を確認します。これは復元試験の代替ではありません。

## 復元試験と対象外

本番に直接 pg_restore を実行しないでください。別のSupabaseプロジェクトで、プラットフォーム既定の auth / storage オブジェクトや予約ロールと競合しないよう、アーカイブのTOCをレビューしてから復元します。必要な拡張・カスタムロールを用意し、アプリの構造・認証データ・権限・カスタムトリガーを順番に復元して、ログイン、イベント、収支、給与、Storage表示を確認します。Storageは対応表を用いてStorage API経由でアップロードし、metadataだけの復元で完了扱いにしないでください。

認証プロバイダー設定、メール設定、APIキー、環境変数、ロールのパスワード、Vault暗号化ルートキー、Edge Functions、Realtime publication設定は別途再設定・保管が必要です。バックアップは特定スキーマの論理エクスポートで、完全なプロジェクト複製ではありません。新しいスキーマやPostgresメジャーバージョンを追加した場合はスクリプトを更新してください。

StorageとDBは単一の原子的スナップショットではありません。ファイルの一覧・バージョンが途中で変化した場合は失敗させるため、更新の少ない時間帯に再実行してください。GitHubの定期実行には遅延・停止の可能性があります（公開リポジトリは長期間操作がない場合にscheduleが無効になります）。Actionsの失敗通知を有効にし、毎週成功履歴を確認してください。GitHubアカウントの障害に備え、暗号化バックアップを定期的に別の場所にもダウンロードしてください。無料枠の使用量や保存上限は監視してください。
