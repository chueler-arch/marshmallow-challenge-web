# Marshmallow Challenge Web

PowerPoint版「マシュマロ・チャレンジ」を、ブラウザだけで進行できる静的Webアプリに再構成したものです。

## 機能

- 参加者名の編集と3チームへのランダム振り分け
- 30秒、3分、18分のタイマー（終了音つき）
- 備品・ルールの確認チェック
- 各チームの高さ入力と順位の自動計算
- 発表チームの切り替え
- 全画面表示、左右キーでのページ移動
- 参加者・チーム・計測値のブラウザ保存

## ローカルで確認

`index.html` をブラウザで開くだけで動作します。ローカルサーバーを使う場合は次のコマンドを実行します。

```powershell
python -m http.server 8000
```

その後、`http://localhost:8000` を開きます。

## Cloudflare Pages

このアプリにはビルド処理がありません。Cloudflare Pagesの設定は次のとおりです。

- Framework preset: `None`
- Build command: 空欄
- Build output directory: `/`（または空欄）
- Production branch: `main`

リポジトリが一覧に出ない場合は、GitHubの **Settings → Applications → Installed GitHub Apps → Cloudflare Pages** を開き、Repository accessで `marshmallow-challenge-web` を許可してからCloudflare側で再読み込みします。

