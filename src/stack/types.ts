/** スライスシートのメタデータ（assets/stacks/<category>/<id>.json） */
export interface StackMeta {
  id: string;
  category: 'buildings' | 'props' | 'characters' | 'terrain' | string;
  sliceWidth: number;   // 1スライスの幅（px = ボクセル）。X
  sliceHeight: number;  // 1スライスの縦（px）。Y（奥行き）
  sliceCount: number;   // スライス枚数 = 高さ（ボクセル）。Z
  density?: number;     // 1ワールド単位あたりのボクセル密度（1=標準, 2=2倍高精細）
  frames: number;       // アニメフレーム数（シートの行数）
  layout: 'horizontal' | 'vertical'; // horizontal: 1行に z0..zN（左が地面）
  order: 'bottom-first' | 'top-first';
  front: '+y';          // シート上で正面は下向き(+y)に統一
  pivot: [number, number]; // 回転中心（スライス内 px）。既定は中心
  footprint: [number, number];
  source: string;
  palette: string;
  notes?: string;
}

export interface StackAsset {
  meta: StackMeta;
  image: CanvasImageSource; // 読み込んだシート
}

/** 描画パラメータ。カメラ由来で、全スタックに共通 */
export interface StackParams {
  squash: number;    // 縦つぶし（1 = 真上から。0.6〜1.0 を許容）
  spacing: number;   // スライス間の持ち上げ量（画面 px）。通常 1
  thickness: number; // 1スライスを何回重ねて描くか（整数、高さの倍率）。通常 1
}
