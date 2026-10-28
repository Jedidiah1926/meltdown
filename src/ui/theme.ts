// 임시 그래픽용 색과 글꼴. 정식 픽셀아트로 교체될 때까지 사용 (docs/art-prompts.md).
import { Text, type TextStyleOptions } from 'pixi.js';

export const W = 1280;
export const H = 720;
export const WALL_H = 340;

export const C = {
  bg: 0x0d0605,
  wall: 0x2a120d,
  wallDark: 0x1a0b08,
  desk: 0x3a1c13,
  deskEdge: 0x55291b,
  metal: 0x6b5a52,
  metalDark: 0x3b302b,
  rust: 0x7a3420,
  red: 0xff3b30,
  redDark: 0x7a1410,
  amber: 0xffb347,
  yellow: 0xf2d04b,
  green: 0x5fd35f,
  crt: 0x0a0404,
  crtLine: 0xff5a4e,
  crtDim: 0x8a2a24,
  text: 0xf3d9c7,
  textDim: 0x9c7d6e,
  hazard: 0xf2c230,
  black: 0x000000,
};

export const CATEGORY_COLOR = {
  stopgap: 0xd98a2b,
  fix: 0x3fa34d,
  info: 0x3f7fc0,
  support: 0x7d7d7d,
  risky: 0xc0392b,
} as const;

/** 마루미냐 한글 (SIL OFL 1.1, public/fonts/). 12px 픽셀 폰트 */
export const FONT_NAME = 'x12y12pxMaruMinyaHangul';
export const FONT = `"${FONT_NAME}", "Noto Sans Mono CJK KR", monospace`;

/** 픽셀 폰트가 선명하도록 글자 크기를 12의 배수로 맞춘다 */
export function pixelSize(size: number): number {
  if (size < 18) return 12;
  return Math.round(size / 12) * 12;
}

export function label(text: string, size = 14, fill: number = C.text, extra: TextStyleOptions = {}): Text {
  // 픽셀 폰트에는 굵은체가 없어서 가짜 굵게(번짐)를 쓰지 않는다
  const { fontWeight: _bold, ...rest } = extra;
  return new Text({ text, style: { fontFamily: FONT, fontSize: pixelSize(size), fill, ...rest } });
}
