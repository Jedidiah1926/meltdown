// 책상 = 만지는 것: 좌우에 기본 조작, 가운데에 모듈 슬롯 (GDD 6장, 8.6, 12장)
import { Container, Graphics, Sprite, type FederatedPointerEvent, type FederatedWheelEvent, type Text, type Texture } from 'pixi.js';
import { CATEGORY_NAME, MODULES, type ModuleId } from '../sim/data';
import {
  LEVER_NOTCHES, SLOT_COLS, abandon, capacity, installModule, scram, setLever, setPump, setValve, uninstallModule, useModule,
  type Game, type ModuleRef,
} from '../sim/game';
import { C, CATEGORY_COLOR, H, WALL_H, W, label } from './theme';

// 위치는 모두 책상 아트(desk_bg.png, 1280×380)에서 잰 값. 책상 위쪽 끝이 화면 y=340
/** 제어봉 레버 홈 (책상 x 111~135, y 68~270) */
const LEVER = { x: 123, top: 410, bottom: 608 };
/** SCRAM 하우징 안쪽 (책상 212~323 × 92~192) */
const SCRAM_BOX = { x: 212, y: 432, w: 112, h: 100 };
/** 펌프 다이얼 판 중심 (책상 968, 160), 눈금 반지름 약 58 → 손잡이는 그 안쪽 */
const DIAL = { x: 968, y: 500, r: 44 };
/** 터빈 휠 받침 중심 (책상 1129, 161), 받침 반지름 66 */
const WHEEL = { x: 1129, y: 501, r: 58 };
/** 슬롯 소켓 중심 (책상 x 450/575/700/822, y 112/222), 안쪽 크기 약 96×86 */
const SLOT = { xs: [450, 575, 700, 822], ys: [452, 562], w: 96, h: 86 };
/** 포기 레버 홈 (책상 x 18~43 / 1232~1255, y 68~270) */
const ABANDON_LEVERS = [{ x: 30, side: 'L' }, { x: 1244, side: 'R' }] as const;
const ABANDON_TRACK = { top: 408, bottom: 610 };
/** 손잡이 중심이 오갈 수 있는 범위 (홈 끝에서 손잡이 반 높이만큼 안쪽) */
const ABANDON_SPAN = { top: ABANDON_TRACK.top + 12, bottom: ABANDON_TRACK.bottom - 12 };
/** 포기 상자 안쪽: SCRAM 바로 아래 (책상 212~324 × 237~267). 좌우 레버를 내리면 여기서 Π자 손잡이가 솟아오른다 */
const ABANDON_BOX = { x: 212, y: 577, w: 112, h: 31 };
/** Π자(거꾸로 뒤집은 U자) 손잡이: 상자 위로 rise만큼 솟고, 85% 이상 끌어내리면 포기. legs = 기둥 간격의 절반 */
const PULL_HANDLE = { x: ABANDON_BOX.x + ABANDON_BOX.w / 2, base: ABANDON_BOX.y + 4, rise: 34, legs: 30 };

/** 손에 든 모듈: 책상 아래 띠에 작은 카드로 늘어놓는다 (최대 8장) */
const HAND = { x: 212, y: 656, w: 100, h: 56, gap: 8 };
const HAND_TRAY = { x: HAND.x - 8, y: HAND.y - 6, w: 8 * (HAND.w + HAND.gap) + 8, h: HAND.h + 12 };

const DIAL_MIN = -225 * Math.PI / 180, DIAL_MAX = 45 * Math.PI / 180;

type Drag = { kind: 'lever' } | { kind: 'dial' } | { kind: 'wheel'; last: number } | { kind: 'handle'; startY: number }
  | { kind: 'slot' | 'hand'; from: number; startX: number; startY: number; moved: boolean }
  | { kind: 'abandon'; side: 'L' | 'R'; startY: number; moved: boolean };

/** 책상 부품 아트 (docs/art-prompts.md 2-2 ~ 2-6). 없는 것은 임시 그래픽 */
export interface DeskParts { rodHandle?: Texture; wheel?: Texture }

export interface DeskHooks {
  isPaused(): boolean;
  /** 보급 교체 모드: 자리가 꽉 찼을 때 버릴 모듈(슬롯 또는 손)을 고른다 */
  replacing(): boolean;
  onReplace(ref: ModuleRef): void;
  hover(text: string): void;
}

export function slotRect(i: number) {
  const r = Math.floor(i / SLOT_COLS), c = i % SLOT_COLS;
  return { x: SLOT.xs[c] - SLOT.w / 2, y: SLOT.ys[r] - SLOT.h / 2, w: SLOT.w, h: SLOT.h };
}

export function handRect(i: number) {
  return { x: HAND.x + i * (HAND.w + HAND.gap), y: HAND.y, w: HAND.w, h: HAND.h };
}

const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export class Desk extends Container {
  scramCoverOpen = false;
  /** 포기 레버: 제어봉 레버와 같은 손잡이지만 위(꺼짐)·아래(켜짐) 두 곳에만 걸린다 */
  abandonPulled = { L: false, R: false };
  /** 화면상 손잡이 위치 0(위)..1(아래). 끄는 동안 따라오고, 놓으면 가까운 끝으로 미끄러진다 */
  abandonPos = { L: 0, R: 0 };
  /** Π자 손잡이가 솟아오른 정도 0..1, 끌어내린 거리 */
  handleRise = 0;
  handlePull = 0;
  /** 끝까지 당겨서 걸린 상태 (다시 올라오지 않는다) */
  handleLocked = false;
  private lastNow = 0;
  private sprites: { rod?: Sprite; wheel?: Sprite; levers?: Sprite[] } = {};
  private drag: Drag | null = null;
  private lastPos = { x: 0, y: 0 };
  private dyn = new Graphics();
  private slotLayer = new Container();
  private slotTexts: Text[] = [];
  private handTexts: Text[] = [];
  /** 끌고 있는 모듈 카드 (맨 위에 그린다) */
  private ghost = new Graphics();
  private ghostText: Text;
  private texts: Record<string, Text> = {};
  /** 책상 아트(desk_bg.png)가 들어오면 숨기는 임시 책상 */
  private placeholder = new Graphics();
  private hasArt = false;

  constructor(private g: () => Game, private hooks: DeskHooks) {
    super();
    const bg = this.placeholder
      .rect(0, WALL_H, W, H - WALL_H).fill(C.desk)
      .rect(0, WALL_H, W, 14).fill(C.deskEdge);
    // 슬롯 베이
    const first = slotRect(0), last = slotRect(7);
    bg.roundRect(first.x - 14, first.y - 14, last.x + last.w - first.x + 28, last.y + last.h - first.y + 28, 8).fill(C.wallDark);
    this.addChild(bg, this.dyn, this.slotLayer);
    this.ghostText = label('', 13, C.text, { align: 'center' });
    this.ghostText.anchor.set(0.5);

    const t = (key: string, s: string, x: number, y: number, size = 13, fill: number = C.textDim) => {
      const tx = label(s, size, fill);
      tx.position.set(x, y);
      this.texts[key] = tx;
      this.addChild(tx);
      return tx;
    };
    t('leverTitle', '제어봉 [Q 빼기 / A 넣기]', 60, 366);
    t('lever', '', 60, 638, 13, C.amber);
    t('scramTitle', 'SCRAM [X]', 238, 404);
    t('dialTitle', '냉각 펌프 [W/S]', 922, 404);
    t('dial', '', 922, 580, 14, C.amber);
    t('wheelTitle', '터빈 밸브 [E/D]', 1082, 404);
    t('wheel', '', 1066, 580, 13, C.amber);
    t('abandonL', '포기', 18, 616, 12);
    t('abandonR', '포기', 1232, 616, 12);
    t('info', '', 340, 612, 13, C.text);
    this.texts.info.style.wordWrap = true;
    this.texts.info.style.wordWrapWidth = 560;
    t('handCount', '', HAND_TRAY.x + HAND_TRAY.w + 10, HAND.y + 4, 12, C.amber);

    for (let i = 0; i < 8; i++) {
      const r = slotRect(i);
      const hit = new Graphics().rect(0, 0, r.w, r.h).fill({ color: 0, alpha: 0.001 });
      hit.position.set(r.x, r.y);
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointerdown', () => this.slotDown(i));
      hit.on('pointerover', () => this.slotHover(i));
      hit.on('pointerout', () => this.hooks.hover(''));
      const tx = label('', 13, C.text, { align: 'center', wordWrap: true, wordWrapWidth: r.w - 8 });
      tx.anchor.set(0.5);
      tx.position.set(r.x + r.w / 2, r.y + r.h / 2 + 8);
      // 글자가 슬롯 클릭을 가로채지 않게 한다 (글자가 있는 칸은 클릭이 안 먹던 문제)
      tx.eventMode = 'none';
      this.slotTexts.push(tx);
      this.slotLayer.addChild(hit, tx);
    }
    for (let i = 0; i < 8; i++) {
      const r = handRect(i);
      const hit = new Graphics().rect(0, 0, r.w, r.h).fill({ color: 0, alpha: 0.001 });
      hit.position.set(r.x, r.y);
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointerdown', (e) => this.handDown(i, e));
      hit.on('pointerover', () => this.handHover(i));
      hit.on('pointerout', () => this.hooks.hover(''));
      const tx = label('', 12, C.text, { align: 'center' });
      tx.anchor.set(0.5);
      tx.position.set(r.x + r.w / 2, r.y + r.h / 2 + 8);
      tx.eventMode = 'none';
      this.handTexts.push(tx);
      this.slotLayer.addChild(hit, tx);
    }

    this.hit(LEVER.x - 30, LEVER.top - 10, 60, LEVER.bottom - LEVER.top + 20, (e) => { this.drag = { kind: 'lever' }; this.dragMove(e); }, '제어봉 레버: 위로 빼면 출력↑, 아래로 넣으면 출력↓. 한 칸씩 움직인다.');
    this.hit(SCRAM_BOX.x, SCRAM_BOX.y, SCRAM_BOX.w, SCRAM_BOX.h, () => this.pressScram(), 'SCRAM: 덮개를 열고 버튼을 누르면 제어봉 전량 삽입 → 냉온 정지. 되돌릴 수 없다.');
    this.hit(DIAL.x - DIAL.r, DIAL.y - DIAL.r, DIAL.r * 2, DIAL.r * 2, (e) => { this.drag = { kind: 'dial' }; this.dragMove(e); }, '냉각 펌프 다이얼: 드래그 또는 휠. 85% 이상은 펌프가 닳는다.', (e) => setPump(this.g(), this.g().pumpCmd - Math.sign(e.deltaY) * 0.03));
    this.hit(WHEEL.x - WHEEL.r, WHEEL.y - WHEEL.r, WHEEL.r * 2, WHEEL.r * 2, (e) => { this.drag = { kind: 'wheel', last: this.angleTo(WHEEL, e) }; }, '터빈 밸브 휠: 돌려서 연다/닫는다. 실제 밸브는 천천히 따라온다.', (e) => setValve(this.g(), this.g().valveTarget - Math.sign(e.deltaY) * 0.03));
    for (const lv of ABANDON_LEVERS) {
      this.hit(lv.x - 28, ABANDON_TRACK.top, 56, ABANDON_TRACK.bottom - ABANDON_TRACK.top, (e) => {
        this.drag = { kind: 'abandon', side: lv.side, startY: this.toLocal(e.global).y, moved: false };
      }, '포기 레버: 위·아래 두 곳에만 걸린다. 좌우 레버를 모두 내리면 SCRAM 아래에서 Π자 손잡이가 솟아오른다.');
    }
    this.hit(ABANDON_BOX.x, PULL_HANDLE.base - PULL_HANDLE.rise - 12, ABANDON_BOX.w, ABANDON_BOX.h + PULL_HANDLE.rise + 12, (e) => {
      if (this.handleRise < 0.95 || this.handleLocked) return;
      this.drag = { kind: 'handle', startY: this.toLocal(e.global).y - this.handlePull };
    }, 'Π자 손잡이: 끝까지 끌어내리면 운전원은 대피하고 원자로는 폭발한다. 발전량 몰수, 이후 체포.');

    this.addChild(this.ghost, this.ghostText);
    this.ghost.eventMode = 'none';
    this.ghostText.eventMode = 'none';

    this.eventMode = 'static';
    this.on('globalpointermove', (e) => { this.lastPos = this.toLocal(e.global); this.dragMove(e); });
    window.addEventListener('pointerup', () => this.dragEnd());
  }

  private hit(x: number, y: number, w: number, h: number, down: (e: FederatedPointerEvent) => void, tip: string, wheel?: (e: FederatedWheelEvent) => void) {
    const g = new Graphics().rect(0, 0, w, h).fill({ color: 0, alpha: 0.001 });
    g.position.set(x, y);
    g.eventMode = 'static';
    g.cursor = 'pointer';
    g.on('pointerdown', down);
    g.on('pointerover', () => this.hooks.hover(tip));
    g.on('pointerout', () => this.hooks.hover(''));
    if (wheel) g.on('wheel', wheel);
    this.addChild(g);
  }

  bothPulled() { return this.abandonPulled.L && this.abandonPulled.R; }

  pressScram() {
    if (!this.scramCoverOpen) this.scramCoverOpen = true;
    else scram(this.g());
  }

  private angleTo(c: { x: number; y: number }, e: FederatedPointerEvent) {
    const p = this.toLocal(e.global);
    return Math.atan2(p.y - c.y, p.x - c.x);
  }

  private dragMove(e: FederatedPointerEvent) {
    if (!this.drag) return;
    const g = this.g();
    const p = this.toLocal(e.global);
    if (this.drag.kind === 'lever') {
      const v = (p.y - LEVER.top) / (LEVER.bottom - LEVER.top);
      setLever(g, v * LEVER_NOTCHES);
    } else if (this.drag.kind === 'dial') {
      let a = this.angleTo(DIAL, e);
      if (a > DIAL_MAX + 0.4) a -= Math.PI * 2;
      setPump(g, (a - DIAL_MIN) / (DIAL_MAX - DIAL_MIN));
    } else if (this.drag.kind === 'wheel') {
      const a = this.angleTo(WHEEL, e);
      let d = a - this.drag.last;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.drag.last = a;
      setValve(g, g.valveTarget + d / (Math.PI * 4)); // 두 바퀴 = 완전 개방
    } else if (this.drag.kind === 'abandon') {
      if (Math.abs(p.y - this.drag.startY) > 4) this.drag.moved = true;
      if (this.drag.moved) this.abandonPos[this.drag.side] = Math.max(0, Math.min(1, (p.y - ABANDON_SPAN.top) / (ABANDON_SPAN.bottom - ABANDON_SPAN.top)));
    } else if (this.drag.kind === 'slot' || this.drag.kind === 'hand') {
      if (Math.hypot(p.x - this.drag.startX, p.y - this.drag.startY) > 6) this.drag.moved = true;
    } else if (this.drag.kind === 'handle') {
      this.handlePull = Math.max(0, Math.min(PULL_HANDLE.rise, p.y - this.drag.startY));
      // 끝까지 내려야만 걸리고 포기가 실행된다
      if (this.handlePull >= PULL_HANDLE.rise) {
        this.handleLocked = true;
        this.drag = null;
        abandon(g);
      }
    }
  }

  private dragEnd() {
    if (this.drag?.kind === 'abandon') {
      const side = this.drag.side;
      // 그냥 누르면 반대쪽 끝으로, 끌었으면 가까운 끝으로 걸린다
      this.abandonPulled[side] = this.drag.moved ? this.abandonPos[side] > 0.5 : !this.abandonPulled[side];
    }
    const g = this.g();
    const p = this.lastPos;
    const to = [...Array(8).keys()].find((i) => inside(p, slotRect(i)));
    if (this.drag?.kind === 'slot' && this.drag.moved) {
      // 일시정지 중: 다른 슬롯으로 옮기거나, 손으로 빼 놓는다
      if (to !== undefined && to !== this.drag.from) {
        [g.slots[this.drag.from], g.slots[to]] = [g.slots[to], g.slots[this.drag.from]];
      } else if (inside(p, HAND_TRAY)) {
        uninstallModule(g, this.drag.from);
      }
    }
    if (this.drag?.kind === 'hand') {
      // 끌어서 놓은 슬롯에 끼운다. 그냥 누르면 첫 빈 슬롯에. 차 있는 슬롯과 바꾸기는 일시정지 중에만
      const target = this.drag.moved ? to : g.slots.indexOf(null);
      if (target !== undefined && target >= 0 && (!g.slots[target] || this.hooks.isPaused())) installModule(g, this.drag.from, target);
    }
    this.drag = null;
  }

  private slotDown(i: number) {
    const g = this.g();
    if (this.hooks.replacing()) { if (g.slots[i]) this.hooks.onReplace({ slot: i }); return; }
    if (this.hooks.isPaused()) {
      // 재배치·빼기는 일시정지 중에만 (GDD 8.6)
      if (g.slots[i]) this.drag = { kind: 'slot', from: i, startX: this.lastPos.x, startY: this.lastPos.y, moved: false };
      return;
    }
    useModule(g, i);
  }

  private slotHover(i: number) {
    const id = this.g().slots[i];
    if (!id) { this.hooks.hover('빈 슬롯 — 손에 든 모듈을 끌어다 끼운다'); return; }
    this.hooks.hover(moduleTip(id));
  }

  private handDown(i: number, e: FederatedPointerEvent) {
    const g = this.g();
    if (!g.hand[i] || g.ending) return;
    if (this.hooks.replacing()) { this.hooks.onReplace({ hand: i }); return; }
    const p = this.toLocal(e.global);
    this.lastPos = p;
    this.drag = { kind: 'hand', from: i, startX: p.x, startY: p.y, moved: false };
  }

  private handHover(i: number) {
    const id = this.g().hand[i];
    if (!id) return;
    this.hooks.hover(`(손) ${moduleTip(id)}  — 슬롯으로 끌어다 끼운다 (누르면 빈 슬롯에)`);
  }

  setInfo(text: string) { this.texts.info.text = text; }

  /** 레버 손잡이(제어봉·포기 레버 공용)·휠 아트 적용 */
  useParts(parts: DeskParts) {
    const add = (t: Texture, scale: number) => {
      const sp = new Sprite(t);
      sp.anchor.set(0.5);
      sp.scale.set(scale);
      this.addChildAt(sp, this.getChildIndex(this.slotLayer));
      return sp;
    };
    if (parts.rodHandle) this.sprites.rod = add(parts.rodHandle, 2);
    if (parts.wheel) this.sprites.wheel = add(parts.wheel, (WHEEL.r * 2) / parts.wheel.width);
    // 포기 레버도 제어봉 레버와 같은 손잡이를 쓴다
    if (parts.rodHandle) this.sprites.levers = ABANDON_LEVERS.map(() => add(parts.rodHandle!, 2));
  }

  /** 책상 아트 적용: 그림 폭에 맞춰 책상 영역에 깐다 (docs/art-prompts.md 2-1) */
  useBackground(texture: Texture) {
    const bg = new Sprite(texture);
    bg.position.set(0, WALL_H);
    bg.scale.set(W / texture.width);
    this.addChildAt(bg, 0);
    this.placeholder.visible = false;
    this.hasArt = true;
  }

  update(now: number) {
    const g = this.g();
    const d = this.dyn.clear();

    // 제어봉 레버: 홈과 눈금, 손잡이(목표), 실제 위치 표시
    if (!this.hasArt) {
      d.roundRect(LEVER.x - 10, LEVER.top - 6, 20, LEVER.bottom - LEVER.top + 12, 6).fill(C.black);
      for (let n = 0; n <= LEVER_NOTCHES; n++) {
        const y = LEVER.top + n / LEVER_NOTCHES * (LEVER.bottom - LEVER.top);
        d.rect(LEVER.x - 24, y, n % 5 === 0 ? 12 : 7, 2).fill(C.textDim);
      }
    }
    const ly = LEVER.top + g.lever / LEVER_NOTCHES * (LEVER.bottom - LEVER.top);
    if (this.sprites.rod) {
      this.sprites.rod.position.set(LEVER.x, ly);
      this.sprites.rod.tint = g.scrammed ? 0xaa5555 : 0xffffff;
    } else {
      d.roundRect(LEVER.x - 20, ly - 8, 40, 16, 4).fill(g.scrammed ? C.redDark : C.metal).stroke({ width: 2, color: C.black });
    }
    const ry = LEVER.top + g.rods * (LEVER.bottom - LEVER.top);
    d.poly([LEVER.x + 24, ry, LEVER.x + 34, ry - 6, LEVER.x + 34, ry + 6]).fill(C.amber);
    this.texts.lever.text = `삽입 ${g.lever}/${LEVER_NOTCHES}  실제 ${(g.rods * 100).toFixed(0)}%`;

    // SCRAM: 경고 줄무늬 + 덮개
    const s = SCRAM_BOX;
    if (!this.hasArt) {
      d.rect(s.x, s.y, s.w, s.h).fill(C.hazard);
      // 테두리를 따라 노랑·검정 경고 블록
      for (let k = 0; k < s.w; k += 20) {
        d.rect(s.x + k, s.y, 10, 12).fill(C.black);
        d.rect(s.x + k + 10, s.y + s.h - 12, 10, 12).fill(C.black);
      }
      for (let k = 0; k < s.h; k += 20) {
        d.rect(s.x, s.y + k + 10, 12, 10).fill(C.black);
        d.rect(s.x + s.w - 12, s.y + k, 12, 10).fill(C.black);
      }
      d.rect(s.x + 12, s.y + 12, s.w - 24, s.h - 24).fill(C.wallDark);
    }
    d.circle(s.x + s.w / 2, s.y + s.h / 2, 32).fill(g.scrammed ? C.redDark : C.red);
    if (!this.scramCoverOpen) d.rect(s.x + 6, s.y + 6, s.w - 12, s.h - 12).fill({ color: 0xb8d4e0, alpha: 0.55 }).stroke({ width: 2, color: 0xe0f0f8 });
    else d.rect(s.x + 6, s.y - 30, s.w - 12, 26).fill({ color: 0xb8d4e0, alpha: 0.55 });

    // 펌프 다이얼
    if (!this.hasArt) {
      d.circle(DIAL.x, DIAL.y, DIAL.r + 10).fill(C.wallDark);
      for (let k = 0; k <= 10; k++) {
        const a = DIAL_MIN + k / 10 * (DIAL_MAX - DIAL_MIN);
        d.moveTo(DIAL.x + Math.cos(a) * (DIAL.r + 2), DIAL.y + Math.sin(a) * (DIAL.r + 2))
          .lineTo(DIAL.x + Math.cos(a) * (DIAL.r + 9), DIAL.y + Math.sin(a) * (DIAL.r + 9))
          .stroke({ width: 2, color: k >= 9 ? C.red : C.textDim });
      }
    }
    d.circle(DIAL.x, DIAL.y, DIAL.r - 6).fill(C.metal).stroke({ width: 3, color: C.black });
    const pa = DIAL_MIN + g.pumpCmd * (DIAL_MAX - DIAL_MIN);
    d.moveTo(DIAL.x, DIAL.y).lineTo(DIAL.x + Math.cos(pa) * (DIAL.r - 10), DIAL.y + Math.sin(pa) * (DIAL.r - 10)).stroke({ width: 5, color: C.amber });
    this.texts.dial.text = `${(g.pumpCmd * 100).toFixed(0)}%  유량 ${(g.flow * 100).toFixed(0)}`;

    // 터빈 밸브 휠: 실제 개도만큼 돌아가 있다
    const rot = g.valve * Math.PI * 4;
    if (this.sprites.wheel) {
      this.sprites.wheel.position.set(WHEEL.x, WHEEL.y);
      this.sprites.wheel.rotation = rot;
    } else {
      d.circle(WHEEL.x, WHEEL.y, WHEEL.r).stroke({ width: 10, color: C.rust });
      for (let k = 0; k < 4; k++) {
        const a = rot + k * Math.PI / 2;
        d.moveTo(WHEEL.x, WHEEL.y).lineTo(WHEEL.x + Math.cos(a) * WHEEL.r, WHEEL.y + Math.sin(a) * WHEEL.r).stroke({ width: 6, color: C.rust });
      }
      d.circle(WHEEL.x, WHEEL.y, 12).fill(C.metal);
    }
    this.texts.wheel.text = `목표 ${(g.valveTarget * 100).toFixed(0)}%  실제 ${(g.valve * 100).toFixed(0)}%${g.t < g.tripUntil ? '\n터빈 트립!' : ''}`;

    // 포기 레버 2개: 둘 다 내리면 SCRAM 아래 상자에서 Π자 손잡이가 솟아오른다
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    ABANDON_LEVERS.forEach((lv, i) => {
      const side = lv.side;
      const dragging = this.drag?.kind === 'abandon' && this.drag.side === side && this.drag.moved;
      if (!dragging) {
        const target = this.abandonPulled[side] ? 1 : 0;
        const pos = this.abandonPos[side];
        this.abandonPos[side] = pos + Math.max(-dt * 5, Math.min(dt * 5, target - pos));
      }
      const y = ABANDON_SPAN.top + this.abandonPos[side] * (ABANDON_SPAN.bottom - ABANDON_SPAN.top);
      const sp = this.sprites.levers?.[i];
      if (sp) {
        sp.position.set(lv.x, y);
        return;
      }
      if (!this.hasArt) d.rect(lv.x - 6, ABANDON_TRACK.top, 12, ABANDON_TRACK.bottom - ABANDON_TRACK.top).fill(C.black);
      d.roundRect(lv.x - 20, y - 8, 40, 16, 4).fill(C.metal).stroke({ width: 2, color: C.black });
    });
    if (this.handleLocked) {
      this.handleRise = 1;
      this.handlePull = PULL_HANDLE.rise;
    } else {
      this.handleRise = Math.max(0, Math.min(1, this.handleRise + (this.bothPulled() ? dt : -dt) * 2));
      if (this.drag?.kind !== 'handle') this.handlePull = Math.max(0, this.handlePull - 160 * dt); // 끝까지 안 당기고 놓으면 다시 올라온다
      if (!this.bothPulled()) this.handlePull = 0;
    }
    const b = ABANDON_BOX;
    if (!this.hasArt) d.rect(b.x, b.y, b.w, b.h).fill(C.black).stroke({ width: 2, color: C.hazard });
    if (this.handleRise > 0) {
      const top = PULL_HANDLE.base - PULL_HANDLE.rise * this.handleRise + this.handlePull;
      const glow = Math.floor(now / 250) % 2 ? C.red : C.redDark;
      // 기둥 두 개 + 위쪽 가로 손잡이 = Π
      for (const side of [-1, 1]) {
        d.rect(PULL_HANDLE.x + side * PULL_HANDLE.legs - 4, top, 8, PULL_HANDLE.base - top).fill(C.metalDark).stroke({ width: 2, color: C.black });
      }
      d.roundRect(PULL_HANDLE.x - PULL_HANDLE.legs - 8, top - 8, (PULL_HANDLE.legs + 8) * 2, 14, 5).fill(glow).stroke({ width: 2, color: C.black });
    }

    // 모듈 슬롯
    const blink = Math.floor(now / 300) % 2 ? C.amber : C.red;
    for (let i = 0; i < 8; i++) {
      const r = slotRect(i);
      const id = g.slots[i];
      // 아트가 있으면 빈 소켓은 그림 그대로 둔다
      if (!this.hasArt) d.roundRect(r.x, r.y, r.w, r.h, 6).fill(0x140806).stroke({ width: 2, color: 0x4a2a20 });
      const dragged = this.drag?.kind === 'slot' && this.drag.moved && this.drag.from === i;
      if (id && !dragged) {
        const def = MODULES[id];
        card(d, r.x + 5, r.y + 5, r.w - 10, r.h - 10, id);
        // 노심 한계 측정기는 이번 판의 멜트다운 지점을 카드 위에 보여 준다
        const extra = def.fixes ? '\n[클릭: 사용]' : id === 'coreLimit' ? `\n한계 ${g.meltPoint.toFixed(0)}%` : '';
        this.slotTexts[i].text = `${CATEGORY_NAME[def.category]}\n${def.short}${extra}`;
      } else {
        this.slotTexts[i].text = '';
      }
      if (this.hooks.replacing() && id) d.roundRect(r.x, r.y, r.w, r.h, 6).stroke({ width: 3, color: blink });
      // 손의 모듈을 끄는 중: 끼울 수 있는 슬롯을 표시
      if (this.drag?.kind === 'hand' && this.drag.moved && (!id || this.hooks.isPaused())) {
        d.roundRect(r.x, r.y, r.w, r.h, 6).stroke({ width: 3, color: inside(this.lastPos, r) ? C.green : C.amber });
      }
    }

    // 손에 든 모듈
    const dragHand = this.drag?.kind === 'slot' && this.drag.moved;
    d.roundRect(HAND_TRAY.x, HAND_TRAY.y, HAND_TRAY.w, HAND_TRAY.h, 6).fill({ color: C.black, alpha: 0.55 })
      .stroke({ width: 2, color: dragHand && inside(this.lastPos, HAND_TRAY) ? C.green : dragHand ? C.amber : 0x4a2a20 });
    for (let i = 0; i < 8; i++) {
      const r = handRect(i);
      const id = g.hand[i];
      const dragged = this.drag?.kind === 'hand' && this.drag.moved && this.drag.from === i;
      if (id && !dragged) {
        card(d, r.x, r.y, r.w, r.h, id);
        this.handTexts[i].text = MODULES[id].short;
        if (this.hooks.replacing()) d.roundRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 6).stroke({ width: 3, color: blink });
      } else {
        this.handTexts[i].text = '';
      }
    }
    const installed = g.slots.filter(Boolean).length;
    this.texts.handCount.text = `손 ${g.hand.length}\n설치 ${installed}\n최대 ${capacity(g)}`;

    // 끌고 있는 카드
    const gd = this.ghost.clear();
    this.ghostText.text = '';
    if ((this.drag?.kind === 'hand' || this.drag?.kind === 'slot') && this.drag.moved) {
      const id = this.drag.kind === 'hand' ? g.hand[this.drag.from] : g.slots[this.drag.from];
      if (id) {
        const { x, y } = this.lastPos;
        card(gd, x - HAND.w / 2, y - HAND.h / 2, HAND.w, HAND.h, id);
        this.ghostText.text = MODULES[id].short;
        this.ghostText.position.set(x, y + 8);
      }
    }
  }
}

/** 모듈 카드: 계통 색 테두리 + 위쪽 색 띠 (고위험은 줄무늬) */
function card(d: Graphics, x: number, y: number, w: number, h: number, id: ModuleId) {
  const def = MODULES[id];
  const col = CATEGORY_COLOR[def.category];
  d.roundRect(x, y, w, h, 5).fill(0x2a1a14).stroke({ width: 3, color: col });
  d.rect(x, y, w, 16).fill(col);
  if (def.category === 'risky') for (let k = 0; k < w; k += 12) d.rect(x + k, y, 6, 16).fill(C.black);
}

export function moduleTip(id: ModuleId): string {
  const def = MODULES[id];
  return `[${CATEGORY_NAME[def.category]}] ${def.name} — ${def.desc}${def.side ? `  ▲ 부작용: ${def.side}` : ''}`;
}
