// assets/palette/oto-64.hex の64色建築ファンタジーパレット共有ヘルパー（後方互換32キー＋新設階調）
import fs from 'node:fs';

export const hex = (h) => {
  const s = h.replace(/^#/, '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

export function loadPaletteHex(file = 'assets/palette/oto-64.hex') {
  return fs.readFileSync(file, 'utf8').split(/\s+/).filter(Boolean).map((h) => h.toLowerCase());
}

/** 名前付きパレット（すべて oto-64.hex の 64 色のみ） */
export const PAL = {
  // 後方互換 32 キー（重厚・自然な欧州建築トーンへ調色）
  black: hex('1a1c2c'),
  ink: hex('1a1c2c'),
  plum: hex('3b2a3a'),
  purple: hex('5d275d'),
  crimson: hex('b13e53'),
  orange: hex('ef7d57'),
  yellowBright: hex('ffcd75'),
  plaster: hex('e6d7b9'),
  lime: hex('a7f070'),
  leaf: hex('4b8044'),
  waterDeep: hex('257179'),
  blueDark: hex('27356e'),
  blue: hex('3b5dc9'),
  sky: hex('41a6f6'),
  cyan: hex('73eff7'),
  white: hex('f4f4f4'),
  slateLight: hex('94b0c2'),
  slate: hex('566c86'),
  slateDark: hex('333c57'),
  woodDark: hex('5c3d26'),
  wood: hex('875936'),
  woodLight: hex('b38354'),
  tan: hex('d6bc95'),
  stoneDark: hex('72706c'),
  stone: hex('a39e93'),
  stoneLight: hex('c9c2b0'),
  charcoal: hex('4e4c54'),
  brickDark: hex('8c3a2e'),
  terracotta: hex('c25a3c'),
  pineDark: hex('284e34'),
  grass: hex('35633b'),
  gold: hex('dca93e'),

  // v7 拡張建築・自然・金属・人物階調キー
  stoneDeep: hex('4e4c54'),
  stoneMid: hex('8d8882'),
  stoneCream: hex('dfd7c5'),
  marble: hex('eae5d9'),

  plasterShade: hex('c5b394'),
  plasterLight: hex('eee3cb'),
  plasterWarm: hex('d6bc95'),
  daub: hex('b29b7a'),

  woodDeep: hex('3e281a'),
  woodPale: hex('c79d70'),
  oak: hex('6e4b2d'),
  bark: hex('4d3423'),

  tileDeep: hex('6a2b24'),
  tileWarm: hex('c25a3c'),
  tileSun: hex('da825b'),
  slateDeep: hex('23293b'),
  slatePale: hex('94b0c2'),
  blueDeep: hex('1c274f'),
  thatchDark: hex('8f7347'),
  thatchLight: hex('cbb07a'),

  pineDeep: hex('1d3828'),
  forest: hex('35633b'),
  leafMid: hex('4b8044'),
  leafSun: hex('77a855'),

  iron: hex('2b2f3a'),
  steel: hex('8593a6'),
  silver: hex('bcc8d6'),
  copper: hex('965239'),
  verdigris: hex('498a7e'),
  bronze: hex('967238'),
  goldBright: hex('f0cc6e'),
  burgundy: hex('6b2334'),

  skinShade: hex('c48f6c'),
  skin: hex('e0b08b'),
  skinLight: hex('f0c9ad'),
  leather: hex('653e25'),
  clothCream: hex('dfd7c5'),
  clothNavy: hex('2a3959'),
  clothOlive: hex('4a5e3f'),
  lanternGlow: hex('ffe08a'),
};

export function createRng(seed = 20261123) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
