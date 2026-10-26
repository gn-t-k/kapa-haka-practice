# kapa-haka-practice

ハカ（kapa haka）練習用の Web ページです。ビルド不要の静的サイトで、GitHub Pages で公開しています。

- 公開URL: https://gn-t-k.github.io/kapa-haka-practice/
- 曲一覧: `index.html`
- 練習プレーヤー: `player.html#<曲ID>`（例: `player.html#tika-tonu`）

## 主な機能

- YouTube 動画（youtube-nocookie.com）の埋め込み再生と、JSON で指定した区間の無限ループ
- カタカナ＋マオリ語原文の字幕と、次のフレーズの表示（タイミング未設定の曲は全フレーズを一覧表示）
- タブが非表示になったら自動で一時停止

## 曲の追加手順

1. `songs/<曲ID>.json` を作る（曲IDは半角英小文字・数字・ハイフンのみ。例: `ka-mate`）

   ```json
   {
     "title": "Ka Mate",
     "youtubeId": "YouTubeの動画ID",
     "loop": { "start": 0, "end": 60 },
     "phrases": [
       {"kana": "カ・マテ", "text": "Ka mate", "start": null},
       {"kana": "カ・オラ", "text": "Ka ora", "start": null}
     ]
   }
   ```

   - `youtubeId`: `https://www.youtube.com/watch?v=XXXX` の `XXXX` の部分
   - `loop`: ループする区間（秒）
   - `phrases`: フレーズを順番に並べる。`start` はそのフレーズの開始秒。わからなければ `null` のままでよい

2. `songs/index.json` に1行足す

   ```json
   [
     { "id": "tika-tonu", "title": "Tika Tonu" },
     { "id": "ka-mate", "title": "Ka Mate" }
   ]
   ```

3. コミットして push すれば、数分で GitHub Pages に反映されます。

## 字幕タイミング

タイミングは曲の JSON（`songs/<曲ID>.json` の各フレーズの `start`、秒）で決まります。
変えたいときは、フレーズ番号と開始秒を Claude に伝えて JSON を更新してもらってください。

## キャッシュ対策

GitHub Pages はファイルを10分間キャッシュさせるため、`player.js` や `style.css` を変更したら、
`player.html` / `index.html` の `?v=2` の数字を1つ増やしてください（古いJSと新しいHTMLが混ざって画面が真っ暗になるのを防ぎます）。

## ローカルでの動作確認

YouTube IFrame API は `file://` では動かないことがあるため、ローカルサーバー経由で開いてください。

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```
