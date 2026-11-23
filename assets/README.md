# assets/

Vite の publicDir。ここに置いた物は `/stacks/...` のように配信される。

| フォルダ | 中身 |
|---|---|
| `stacks/buildings/` | 本番の建物（`bld_*.png` + `.json`）。王城・大聖堂は 32×32 以下のモジュールに分ける |
| `stacks/props/` | 小物（`prop_*`）：木・樽・街灯・井戸など |
| `stacks/characters/` | キャラ（`chr_*`）。行＝歩きのフレーム |
| `stacks/terrain/` | 段差・橋など地形のスタック（`ter_*`） |
| `stacks/_dummy/` | コードで作ったダミー（`npm run gen:dummy` で作り直せる。消してよい） |
| `views/` | 四面図の元画像（`<id>_views.png`）。描画には使わない |
| `ground/` | 地面の 1 枚絵・タイル（`oto_ground.png`、`tile_<名前>.png`） |
| `palette/` | 共通パレット `oto-64.hex` / `oto-32.hex` |

## 命名
- id は `^(bld|prop|chr|ter)_[a-z0-9]+(_[a-z0-9]+)*$`。ファイル名 = id（`bld_shop_corner.png` と `bld_shop_corner.json`）。
- 変種は末尾に `_a` `_b` …、動作は `_walk` など。

## PNG
- 横一列、**左が z=0（地面）**、右が天辺。行＝アニメのフレーム。
- 1 スライス = 上から見た水平断面。**正面は下（+y）**。
- RGBA / 8-bit インデックスカラー、アルファは 0 か 255 だけ。輪郭線・落ち影は入れない。
- 枚数は 2〜128（`density: 2`）。

## JSON（例）
```json
{ "id": "bld_house_gable_a", "category": "buildings", "sliceWidth": 16, "sliceHeight": 24, "sliceCount": 22,
  "frames": 1, "layout": "horizontal", "order": "bottom-first", "front": "+y", "pivot": [8, 12],
  "footprint": [16, 24], "source": "procedural", "palette": "oto-32", "notes": "" }
```
MagicaVoxel の Slice 書き出しなど縦並び・上が先の PNG は、`"layout": "vertical"`、`"order": "top-first"` と書けば読み込み時に直す。

## 検査
`npm run check:assets`（パレットまで見るなら `-- --strict`）
