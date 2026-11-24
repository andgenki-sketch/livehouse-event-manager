# v0.2.9 一括更新・1件限定検証手順

## 状態（2026-11-24）
- WordPressサイトで実際にインストール済みなのはユーザー申告のv0.2.6。**v0.2.9は未導入**。
- v0.2.9 ZIP: `tsa-event-sync-v0.2.9-final-test-candidate.zip`
- SHA-256 `c6928b91d486b76278cdc2b049c08f6cb5c4f2200695c9bdf1919ed2018dd75e`
- 配布PHPとリポジトリ内 `wordpress/tsa-event-sync-receiver/tsa-event-sync-receiver.php` は統一。
- PHPモックテスト23件と構文検査: PASS。GitHub Actionsワークフローに組み込み済み。
- Vercelプレビューの最新ビルド確認要、Productionへの公開書込は未許可。
- PR #48 はdraft、**本番mainにマージしない**。
- ホームページのPICK UPはXO Slider ID 6647で手動管理。

## テスト手順（ここからは実サイト操作が必要）
1. WordPressバックアップが最新であることを確認。
2. v0.2.9 ZIPを既存プラグインの更新としてアップロード。WordPress「ツール→TSA Event Sync」が「接続テストのみ（dry_run）」にリセットされているか確認。
3. 開催日が既存の手動イベントと重ならない、**新規のダミーイベント1件**を開発版アプリで作成。画像・開催日・OPEN/START・料金を登録。イベントIDを控える。既存のテスト投稿10096は過去バージョンのため使用しない。
4. WordPress側を「指定イベント1件だけ許可」にして、そのイベントIDを設定。Vercel **Previewだけ**に `WORDPRESS_SYNC_TEST_EVENT_ID` を同じIDで設定し `WORDPRESS_SYNC_LIVE_ENABLED=true`、Previewを再デプロイ。
5. 初回登録の確認：WordPressの投稿ID、月間スケジュール、開始日・開始時刻（JST/UTC）、OPEN/START・料金・アイキャッチ・公開状態を確認。
6. 同じアプリイベントの名称・日付・時刻・料金・画像を更新。**同じWordPress投稿IDで更新**され、二重登録がないことを確認。日時メタと月間表示も再確認。
7. 同じアプリイベントで「ホームページ公開」をOFFにして保存。WordPress投稿が下書きになったことを確認。TSA Event Sync管理画面で「新規登録」「更新」「公開解除」がすべてOKであることを確認。
8. テスト終了後にWordPress側「接続テストのみ」、Vercel Preview `WORDPRESS_SYNC_LIVE_ENABLED=false`、テスト投稿は下書き。
9. トラブル時は再送を繰り返さず、エラー内容・WordPress投稿ID・直前の変更を確認。機密情報は共有しない。

## 本番公開の別承認
単一イベントの検証、既存手動イベントの重複運用の確認、権限レビューが完了するまで有効化しない。実行する場合は、管理者がWordPress側の「全イベント許可」にチェックし、**別途**Vercel Productionに `WORDPRESS_SYNC_PRODUCTION_ENABLED=true` を設定する。プレビュー用フラグは本番には適用しない。繰り返すが、設定前にPRレビューとmainマージが必要。

## 制限・注意
- 同日付に既存の手動投稿がある場合は、安全のため自動追加・日付移動を拒否する。スタッフによる手動照合が必要。
- 既存のv0.2.6連携投稿には同期スナップショットがない。内容が一致する状態での初回ベースライン記録のみ許可。
- 更新中は一時的に下書きになる。失敗時は下書きのままであり、自動復帰はしない。
- 終演時刻はアプリ未提供のためTECの技術上の仮の+1時間。公演の実際の終了時刻を意味しない。
- テスト時にWordPress投稿を手動で編集すると、自動上書き防止で次回同期が停止する。
