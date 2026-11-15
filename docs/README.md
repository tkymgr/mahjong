# 画面サンプルと検証資料

v1.1.0の代表画面を掲載しています。和了・流局の画像は、表示確認用の固定局面です。

| 内容 | 画像 |
| --- | --- |
| タイトル | [タイトル画面](playcanvas-landscape-salon-title.png) |
| 対局・歯車メニュー | [対局画面](playcanvas-landscape-board.png) |
| キャラクターと右端の試聴ボタン | [雀士一覧](playcanvas-landscape-character-roster.png) |
| 音量設定・閉じるボタン | [卓内メニュー](playcanvas-landscape-table-menu.png) |
| 右側の相手の和了 | [左寄せの結果パネル](playcanvas-landscape-winner-1-visible.png) |
| 対面の相手の和了 | [下寄せの結果パネル](playcanvas-landscape-winner-2-visible.png) |
| 左側の相手の和了 | [右寄せの結果パネル](playcanvas-landscape-winner-3-visible.png) |
| 全員の手牌を開く流局 | [通常流局](playcanvas-landscape-draw-all-hands.png) |
| 九種九牌の手牌公開 | [九種九牌](playcanvas-landscape-nine-terminals-all-hands.png) |
| ドラ・裏ドラ・和了牌 | [和了の詳細](playcanvas-landscape-win-ura-dora.png) |
| 縦画面の回転案内 | [回転案内](pwa-portrait-gate.png) |
| 全キャラクターの表情・衣装差分 | [差分一覧](character-expression-preview.jpg) |
| 手牌の照明調整の比較 | [比較画像](hand-angle-patterns/b-lighting-comparison.png) |

## 画像の保持方針

- 現行機能を説明する代表画像を固定名で更新します。
- ブラウザーテストの全画面サイズ分の出力・検討中の比較画像は、Git管理外の `test-results/` に保存します。代表例だけをここへコピーします。
- 機能や説明が重複する古い画像は、参照を更新してから削除します。過去のコミット済み画像はGit履歴に保持されます。
- 制作元は `assets/`、ゲームの配布素材は `public/` に保持します。
- 画像を整理した際は、この一覧と検証資料のリンクも確認します。

## 検証・制作記録

- [検証記録](../VALIDATION.md)
- [エンジン・画面の検証データ](engine-validation.json)
- [素材の出自・生成元・ハッシュ](source-manifest.json)
- [照明調整の測定値](hand-angle-patterns/b-lighting-metrics.json)
- [手牌角度の測定値](hand-angle-patterns/patterns.json)

角度プレビューは `node scripts/preview-player-hand-angles.mjs` で `test-results/hand-angle-patterns/` に出力します。キャラクター差分の一覧は `scripts/prepare-character-expressions.py` で同じファイル名へ更新します。
