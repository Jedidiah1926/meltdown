// 책상 = 만지는 것: 좌우에 기본 조작, 가운데에 모듈 슬롯 (GDD 6장, 8.6, 12장)
import { Container, Graphics, Sprite, type FederatedPointerEvent, type FederatedWheelEvent, type Text, type Texture } from 'pixi.js';
import { CATEGORY_NAME, MODULES, type ModuleId } from '../sim/data';
import {
  LEVER_NOTCHES, SLOT_COLS, abandon, scram, setLever, setPump, setValve, useModule, type Game,
} from '../sim/game';
import { C, CATEGORY_COLOR, H, WALL_H, W, label } from './theme';

const LEVER = { x: 130, top: 400, bottom: 660 };
const SCRAM_BOX = { x: 215, y: 430, w: 120, h: 120 };
const DIAL = { x: 985, y: 480, r: 52 };
const WHEEL = { x: 1135, y: 480, r: 62 };
/** 슬롯 위치는 책상 아트(desk_bg.png)의 소켓에 맞춘다: 원본 (202 + 60c, 40 / 101), 55×54 의 2배 */
const SLOT = { x: 404, y: 420, w: 110, h: 108, gapX: 10, gapY: 14 };
/** 포기 레버는 책상 양 끝의 홈(원본 x 6~20, y 38~148)에 들어간다 */
const ABANDON_LEVERS = [{ x: 26, side: 'L' }, { x: W - 26, side: 'R' }] as const;
const ABANDON_TRACK = { top: 416, bottom: 636 };
/** 포기 버튼은 SCRAM 바로 아래 빈 공간 (SCRAM과 같은 폭) */
const ABANDON_BOX = { x: 215, y: 584, w: 120, h: 44 };

const DIAL_MIN = -225 * Math.PI / 180, DIAL_MAX = 45 * Math.PI / 180;

type Drag = { kind: 'lever' } | { kind: 'dial' } | { kind: 'wheel'; last: number } | { kind: 'slot'; from: number };

export interface DeskHooks {
  isPaused(): boolean;
  /** 보급 교체 모드: 슬롯을 고르면 그 자리에 새 모듈을 꽂는다 */
  replacing(): boolean;
  onReplace(slot: number): void;
  hover(text: string): void;
}

export function slotRect(i: number) {
  const r = Math.floor(i / SLOT_COLS), c = i % SLOT_COLS;
  return { x: SLOT.x + c * (SLOT.w + SLOT.gapX), y: SLOT.y + r * (SLOT.h + SLOT.gapY), w: SLOT.w, h: SLOT.h };
}

export class Desk extends Container {
  scramCoverOpen = false;
  abandonPulled = { L: false, R: false };
  abandonCoverOpen = false;
  private drag: Drag | null = null;
  private lastPos = { x: 0, y: 0 };
  private dyn = new Graphics();
  private slotLayer = new Container();
  private slotTexts: Text[] = [];
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
    bg.roundRect(SLOT.x - 14, SLOT.y - 14, 4 * SLOT.w + 3 * SLOT.gapX + 28, 2 * SLOT.h + SLOT.gapY + 28, 8).fill(C.wallDark);
    this.addChild(bg, this.dyn, this.slotLayer);

    const t = (key: string, s: string, x: number, y: number, size = 13, fill: number = C.textDim) => {
      const tx = label(s, size, fill);
      tx.position.set(x, y);
      this.texts[key] = tx;
      this.addChild(tx);
      return tx;
    };
    t('leverTitle', '제어봉 [Q 빼기 / A 넣기]', 60, 366);
    t('lever', '', 82, 670, 13, C.amber);
    t('scramTitle', 'SCRAM [X]', 236, 404);
    t('dialTitle', '냉각 펌프 [W/S]', 930, 400);
    t('dial', '', 955, 545, 14, C.amber);
    t('wheelTitle', '터빈 밸브 [E/D]', 1080, 400);
    t('wheel', '', 1080, 555, 13, C.amber);
    t('abandonL', '포기', 14, 656, 12);
    t('abandonR', '포기', W - 38, 656, 12);
    t('info', '', SLOT.x, 654, 13, C.text);
    this.texts.info.style.wordWrap = true;
    this.texts.info.style.wordWrapWidth = 480;

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
      this.slotTexts.push(tx);
      this.slotLayer.addChild(hit, tx);
    }

    this.hit(LEVER.x - 30, LEVER.top - 10, 60, LEVER.bottom - LEVER.top + 20, (e) => { this.drag = { kind: 'lever' }; this.dragMove(e); }, '제어봉 레버: 위로 빼면 출력↑, 아래로 넣으면 출력↓. 한 칸씩 움직인다.');
    this.hit(SCRAM_BOX.x, SCRAM_BOX.y, SCRAM_BOX.w, SCRAM_BOX.h, () => this.pressScram(), 'SCRAM: 덮개를 열고 버튼을 누르면 제어봉 전량 삽입 → 냉온 정지. 되돌릴 수 없다.');
    this.hit(DIAL.x - DIAL.r, DIAL.y - DIAL.r, DIAL.r * 2, DIAL.r * 2, (e) => { this.drag = { kind: 'dial' }; this.dragMove(e); }, '냉각 펌프 다이얼: 드래그 또는 휠. 85% 이상은 펌프가 닳는다.', (e) => setPump(this.g(), this.g().pumpCmd - Math.sign(e.deltaY) * 0.03));
    this.hit(WHEEL.x - WHEEL.r, WHEEL.y - WHEEL.r, WHEEL.r * 2, WHEEL.r * 2, (e) => { this.drag = { kind: 'wheel', last: this.angleTo(WHEEL, e) }; }, '터빈 밸브 휠: 돌려서 연다/닫는다. 실제 밸브는 천천히 따라온다.', (e) => setValve(this.g(), this.g().valveTarget - Math.sign(e.deltaY) * 0.03));
    for (const lv of ABANDON_LEVERS) {
      this.hit(lv.x - 18, ABANDON_TRACK.top, 36, ABANDON_TRACK.bottom - ABANDON_TRACK.top, () => { this.abandonPulled[lv.side] = !this.abandonPulled[lv.side]; if (!this.bothPulled()) this.abandonCoverOpen = false; }, '포기 레버: 좌우 레버를 모두 당기면 포기 버튼이 나타난다.');
    }
    this.hit(ABANDON_BOX.x, ABANDON_BOX.y, ABANDON_BOX.w, ABANDON_BOX.h, () => {
      if (!this.bothPulled()) return;
      if (!this.abandonCoverOpen) this.abandonCoverOpen = true; else abandon(this.g());
    }, '포기 버튼: 운전원은 대피하고 원자로는 폭발한다. 발전량 몰수, 이후 체포.');

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
    }
  }

  private dragEnd() {
    if (this.drag?.kind === 'slot') {
      const p = this.lastPos;
      const to = [...Array(8).keys()].find((i) => {
        const r = slotRect(i);
        return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      });
      const g = this.g();
      if (to !== undefined && to !== this.drag.from) {
        [g.slots[this.drag.from], g.slots[to]] = [g.slots[to], g.slots[this.drag.from]];
      }
    }
    this.drag = null;
  }

  private slotDown(i: number) {
    const g = this.g();
    if (this.hooks.replacing()) { this.hooks.onReplace(i); return; }
    if (this.hooks.isPaused()) {
      // 재배치는 일시정지 중에만 (GDD 8.6)
      if (g.slots[i]) this.drag = { kind: 'slot', from: i };
      return;
    }
    useModule(g, i);
  }

  private slotHover(i: number) {
    const id = this.g().slots[i];
    if (!id) { this.hooks.hover('빈 슬롯'); return; }
    this.hooks.hover(moduleTip(id));
  }

  setInfo(text: string) { this.texts.info.text = text; }

  /** 책상 아트 적용: 원본 640×190을 2배로 책상 영역에 깐다 (docs/art-prompts.md 2-1) */
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
    d.roundRect(LEVER.x - 10, LEVER.top - 6, 20, LEVER.bottom - LEVER.top + 12, 6).fill(C.black);
    for (let n = 0; n <= LEVER_NOTCHES; n++) {
      const y = LEVER.top + n / LEVER_NOTCHES * (LEVER.bottom - LEVER.top);
      d.rect(LEVER.x - 24, y, n % 5 === 0 ? 12 : 7, 2).fill(C.textDim);
    }
    const ly = LEVER.top + g.lever / LEVER_NOTCHES * (LEVER.bottom - LEVER.top);
    d.roundRect(LEVER.x - 26, ly - 9, 52, 18, 4).fill(g.scrammed ? C.redDark : C.metal).stroke({ width: 2, color: C.black });
    const ry = LEVER.top + g.rods * (LEVER.bottom - LEVER.top);
    d.poly([LEVER.x + 30, ry, LEVER.x + 40, ry - 6, LEVER.x + 40, ry + 6]).fill(C.amber);
    this.texts.lever.text = `삽입 ${g.lever}/${LEVER_NOTCHES}  실제 ${(g.rods * 100).toFixed(0)}%`;

    // SCRAM: 경고 줄무늬 + 덮개
    const s = SCRAM_BOX;
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
    d.circle(s.x + s.w / 2, s.y + s.h / 2, 32).fill(g.scrammed ? C.redDark : C.red);
    if (!this.scramCoverOpen) d.rect(s.x + 6, s.y + 6, s.w - 12, s.h - 12).fill({ color: 0xb8d4e0, alpha: 0.55 }).stroke({ width: 2, color: 0xe0f0f8 });
    else d.rect(s.x + 6, s.y - 30, s.w - 12, 26).fill({ color: 0xb8d4e0, alpha: 0.55 });

    // 펌프 다이얼
    d.circle(DIAL.x, DIAL.y, DIAL.r + 10).fill(C.wallDark);
    for (let k = 0; k <= 10; k++) {
      const a = DIAL_MIN + k / 10 * (DIAL_MAX - DIAL_MIN);
      d.moveTo(DIAL.x + Math.cos(a) * (DIAL.r + 2), DIAL.y + Math.sin(a) * (DIAL.r + 2))
        .lineTo(DIAL.x + Math.cos(a) * (DIAL.r + 9), DIAL.y + Math.sin(a) * (DIAL.r + 9))
        .stroke({ width: 2, color: k >= 9 ? C.red : C.textDim });
    }
    d.circle(DIAL.x, DIAL.y, DIAL.r - 6).fill(C.metal).stroke({ width: 3, color: C.black });
    const pa = DIAL_MIN + g.pumpCmd * (DIAL_MAX - DIAL_MIN);
    d.moveTo(DIAL.x, DIAL.y).lineTo(DIAL.x + Math.cos(pa) * (DIAL.r - 10), DIAL.y + Math.sin(pa) * (DIAL.r - 10)).stroke({ width: 5, color: C.amber });
    this.texts.dial.text = `${(g.pumpCmd * 100).toFixed(0)}%  유량 ${(g.flow * 100).toFixed(0)}`;

    // 터빈 밸브 휠: 실제 개도만큼 돌아가 있다
    const rot = g.valve * Math.PI * 4;
    d.circle(WHEEL.x, WHEEL.y, WHEEL.r).stroke({ width: 10, color: C.rust });
    for (let k = 0; k < 4; k++) {
      const a = rot + k * Math.PI / 2;
      d.moveTo(WHEEL.x, WHEEL.y).lineTo(WHEEL.x + Math.cos(a) * WHEEL.r, WHEEL.y + Math.sin(a) * WHEEL.r).stroke({ width: 6, color: C.rust });
    }
    d.circle(WHEEL.x, WHEEL.y, 12).fill(C.metal);
    this.texts.wheel.text = `목표 ${(g.valveTarget * 100).toFixed(0)}%  실제 ${(g.valve * 100).toFixed(0)}%${g.t < g.tripUntil ? '\n터빈 트립!' : ''}`;

    // 포기 레버 2개와 포기 버튼
    for (const lv of ABANDON_LEVERS) {
      const pulled = this.abandonPulled[lv.side];
      if (!this.hasArt) d.rect(lv.x - 6, ABANDON_TRACK.top, 12, ABANDON_TRACK.bottom - ABANDON_TRACK.top).fill(C.black);
      d.roundRect(lv.x - 14, pulled ? ABANDON_TRACK.bottom - 30 : ABANDON_TRACK.top + 4, 28, 26, 4).fill(pulled ? C.red : C.metal);
    }
    if (this.bothPulled()) {
      const b = ABANDON_BOX;
      d.rect(b.x, b.y, b.w, b.h).fill(C.black).stroke({ width: 2, color: C.hazard });
      d.circle(b.x + b.w / 2, b.y + b.h / 2, 14).fill(Math.floor(now / 250) % 2 ? C.red : C.redDark);
      if (!this.abandonCoverOpen) d.rect(b.x + 3, b.y + 3, b.w - 6, b.h - 6).fill({ color: 0xb8d4e0, alpha: 0.6 });
    }

    // 모듈 슬롯
    for (let i = 0; i < 8; i++) {
      const r = slotRect(i);
      const id = g.slots[i];
      // 아트가 있으면 빈 소켓은 그림 그대로 둔다
      if (!this.hasArt) d.roundRect(r.x, r.y, r.w, r.h, 6).fill(0x140806).stroke({ width: 2, color: 0x4a2a20 });
      if (id) {
        const def = MODULES[id];
        const col = CATEGORY_COLOR[def.category];
        d.roundRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10, 5).fill(0x2a1a14).stroke({ width: 3, color: col });
        d.rect(r.x + 5, r.y + 5, r.w - 10, 16).fill(col);
        if (def.category === 'risky') for (let k = 0; k < r.w - 10; k += 12) d.rect(r.x + 5 + k, r.y + 5, 6, 16).fill(C.black);
        // 노심 한계 측정기는 이번 판의 멜트다운 지점을 카드 위에 보여 준다
        const extra = def.fixes ? '\n[클릭: 사용]' : id === 'coreLimit' ? `\n한계 ${g.meltPoint.toFixed(0)}%` : '';
        this.slotTexts[i].text = `${CATEGORY_NAME[def.category]}\n${def.short}${extra}`;
      } else {
        this.slotTexts[i].text = '';
      }
      if (this.hooks.replacing()) d.roundRect(r.x, r.y, r.w, r.h, 6).stroke({ width: 3, color: Math.floor(now / 300) % 2 ? C.amber : C.red });
    }
  }
}

export function moduleTip(id: ModuleId): string {
  const def = MODULES[id];
  return `[${CATEGORY_NAME[def.category]}] ${def.name} — ${def.desc}${def.side ? `  ▲ 부작용: ${def.side}` : ''}`;
}
