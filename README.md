# sprite-stacking-oto

Canvas2D の Sprite Stacking 技法で中世魔導王都を歩いて探索できるブラウザプロトタイプ。
3D メッシュや WebGL 透視投影を使わず、水平スライスの回転・縦つぶし（`squash`）・整数積み上げと合成キャッシュによって立体的な街並みを描画する。

## ローカル起動
必要なもの：Node.js 20 以上（`npm install` で `vite`・`vitest`・`typescript`・`pngjs` を利用）。

```powershell
npm install
npm run dev
```

ブラウザで `http://127.0.0.1:5173/` （既定 `?scene=oto`）を開く。

| URL パラメータ | 内容 |
|---|---|
| `?scene=oto` | **王都探索シーン（既定、PC `2x`・モバイル `1x`・`density: 2`・`squash=0.65`・色馴染み輪郭線 ON）**。城壁半径 820px（`2560×2560` 平坦シームレス大地）・4 城門・建築史基準住宅 26 種・ランドマーク/魔導施設・環状魔導トラム 4 両＆専用駅 4 ヶ所・転移陣 5 拠点・水車/風車/流水/噴水/風揺らぎ FX・NPC 64 人 |
| `?scene=single` | 建物 1 棟と向き確認矢印の単体表示 |
| `?scene=single&asset=buildings/<id>` | 指定アセット単体プレビュー（`assets/stacks/buildings/<id>.png`） |
| `?scene=few` | 小規模リング城壁・木箱・歩行確認シーン |
| `?scene=stress&n=400` | 400 スタック並列描画の負荷計測シーン |
| `&bench=1` | 自動回転しながら 300 フレーム描画時間を計測（`&spin=0` で静止計測） |
| `&cache=0` | 合成キャッシュ無効化時の比較用 |
| `&yaw=37&spin=0&squash=1&hud=0` | カメラ角・自動回転・つぶし率・HUD 表示の固定 |
| `&zoom=3&outline=0&time=evening` | 整数ズーム倍率（1〜8）・輪郭線・時間帯（`day` / `evening` / `night`）の指定 |

## 操作方法
- **移動**: `WASD` / 矢印キー（`Shift` でダッシュ）
- **転移陣**: `Space`（5 拠点間のワープ）
- **カメラ**: `Q` / `E`・ドラッグで水平回転、`T` で自動回転切替、マウスホイール・`Z` / `X` で整数ズーム、`R` / `F` で俯角（`squash`）調整
- **表示・デバッグ**: `1` / `2` / `0`（層間隔切替）、`Y`（厚み）、`C`（キャッシュ切替）、`O`（輪郭線）、`G`（地面影）、`N`（時間帯）、`M`（ミニマップ＆クリックワープ）、`H`（HUD 表示切替）
- **タッチ操作**: タッチ端末または `&touch=1` で仮想パッドを表示

## コマンド
| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm test` | 投影数式・配置・衝突・探索の Vitest テスト実行 |
| `npm run check:assets` | 全スタックアセットの寸法・アルファ二値化・水平断面連続性チェック |
| `npm run build` | TypeScript 型チェック＋本番ビルド（`dist/`） |
| `npm run gen:assets` | 全本番スタック＆地面（`oto_ground.png`）の手続き生成 |
| `npm run gen:dummy` | 最小テスト用ダミー素材生成＋四面図カービング自己テスト |
| `npm run carve -- ...` | 四面図 PNG → 水平スライスシート生成 |

## Cloudflare Workers 静的アセット配信
`dist/` の純粋静的ビルド成果物を Cloudflare Workers Static Assets で公開配信する構成に対応している（設定：`cloudflare.config.ts`）。

```powershell
npm run build
cf deploy
```

## ディレクトリ構成
```
src/stack/math.ts         数式（worldToScreen・持ち上げ・向き・ソート）。DOM なし
src/stack/render.ts       Canvas2D 描画（サブステップ分割・6°×16位相 LRU キャッシュ・色馴染み輪郭線）
src/stack/loader.ts       スライスシート＆地面画像ローダー
src/stack/softwareRef.ts  テスト用参照ラスタライザ
src/terrain.ts            河川・水堀・運河・街区評価（DOM なし）
src/collision.ts          回転矩形(OBB)×円の衝突解決・城門/堀/河川/ランドマーク判定（DOM なし）
src/ambient.ts            環状魔導トラム運行・レイライン/儀式円/結界描画・流水/噴水/風揺らぎ FX
src/npc.ts                王都 NPC 64 人の立ち番・巡回制御（DOM なし）
src/oto.ts                王都レイアウト・転移陣・アセットマニフェスト
src/world.ts              地面＋オーバーレイ＋接地分離影＋スタック描画統合
src/scenes.ts             参照シーン（single / few / stress）
src/data/                 地形（oto-terrain.json）＆配置定義（oto-layout.json）
scripts/                  建築パーツ・各種アセット生成・四面図カービング・検査
assets/                   静的配信アセット（Vite publicDir：パレット・地面・各種スライス）
tests/                    Vitest テスト（stack.test.ts / oto.test.ts）
```
