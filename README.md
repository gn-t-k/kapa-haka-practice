# kapa-haka-practice

ハカ（kapa haka）練習用の Web ページです。ビルド不要の静的サイトで、GitHub Pages で公開しています。

- 公開URL: https://gn-t-k.github.io/kapa-haka-practice/
- 曲一覧: `index.html`
- 練習プレーヤー: `player.html#<曲ID>`（例: `player.html#tika-tonu`）

## 主な機能

- YouTube 動画（youtube-nocookie.com）の埋め込み再生と、指定区間の無限ループ
- ループ区間・ループ回数上限（例: 10周で自動停止）を画面上で変更
- 再生速度 0.5 / 0.75 / 1 倍
- カタカナ＋マオリ語原文の字幕と、次のフレーズの表示
- ローカル動画モード：端末内の動画ファイルを選ぶと通信なしで同じループ・字幕が使える
- タブが非表示になったら自動で一時停止
- 字幕タイミング合わせモード（「次」ボタンで記録、±0.1秒の微調整、JSONコピー）

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

## 字幕タイミングを全員に共有する手順

1. プレーヤーで「タイミング合わせモード」をオンにする
2. 動画を再生し、各フレーズが始まった瞬間に「次」をタップ（必要なら ±0.1 秒で微調整）
   - 編集内容はその端末のブラウザ（localStorage）にだけ保存され、曲の JSON より優先されます
   - 「共有の設定に戻す」で編集内容を消して JSON の値に戻せます
3. 「JSONをコピー」を押し、`songs/<曲ID>.json` の中身をまるごと置き換えてコミット

## ローカルでの動作確認

YouTube IFrame API は `file://` では動かないことがあるため、ローカルサーバー経由で開いてください。

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```
