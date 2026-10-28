// 시작 화면, 보급 선택, 일시정지, 결말 연출
import { Container, Graphics, type Text } from 'pixi.js';
import { CATEGORY_NAME, type ModuleDef } from '../sim/data';
import type { EndingKind, Game } from '../sim/game';
import { C, CATEGORY_COLOR, H, W, label } from './theme';
import { fmtTime } from './wall';

function button(text: string, x: number, y: number, w: number, h: number, onClick: () => void): Container {
  const c = new Container();
  const g = new Graphics().roundRect(0, 0, w, h, 6).fill(C.wallDark).stroke({ width: 2, color: C.amber });
  const t = label(text, 16, C.amber);
  t.anchor.set(0.5);
  t.position.set(w / 2, h / 2);
  c.addChild(g, t);
  c.position.set(x, y);
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.on('pointerdown', onClick);
  return c;
}

export class TitleOverlay extends Container {
  constructor(onStart: () => void) {
    super();
    this.addChild(new Graphics().rect(0, 0, W, H).fill({ color: C.black, alpha: 0.85 }));
    const title = label('MELTDOWN', 72, C.red, { fontWeight: 'bold', letterSpacing: 8 });
    title.anchor.set(0.5);
    title.position.set(W / 2, 180);
    const sub = label('원자로 안정화 로그라이크 — 프로토타입 (가압경수로 · 2000)', 18, C.amber);
    sub.anchor.set(0.5);
    sub.position.set(W / 2, 250);
    const help = label([
      '목표: 사고 원인을 모두 해결하고 위험도를 초록 구간에 60초 유지하면 "운전 중 안정화".',
      '점수는 발전량. 위험도가 눈금 밖 어딘가(멜트다운 지점)에 닿으면 끝.',
      '',
      '제어봉 레버 Q/A · 냉각 펌프 W/S · 터빈 밸브 E/D · SCRAM X(두 번: 덮개 → 버튼)',
      '해결 모듈은 슬롯을 클릭해서 사용 · Space 일시정지 (일시정지 중 모듈 드래그로 재배치)',
      '포기: 책상 양 끝 레버 두 개를 당기고 → 가운데 아래 덮개 → 버튼',
    ].join('\n'), 15, C.text, { align: 'center', lineHeight: 24 });
    help.anchor.set(0.5, 0);
    help.position.set(W / 2, 300);
    this.addChild(title, sub, help, button('교대 투입', W / 2 - 90, 520, 180, 48, onStart));
  }
}

export class SupplyOverlay extends Container {
  private body = new Container();
  private banner: Text;
  /** 슬롯이 꽉 차서 교체할 자리를 고르는 중인 모듈 */
  pendingReplace: ModuleDef | null = null;

  constructor(private onPick: (m: ModuleDef) => void, private onSkip: () => void) {
    super();
    this.banner = label('', 18, C.amber);
    this.banner.position.set(410, 352);
    this.addChild(this.body, this.banner);
    this.visible = false;
  }

  show(g: Game) {
    const s = g.supplyQueue[0];
    this.visible = !!s;
    this.body.removeChildren();
    this.banner.text = '';
    if (!s) return;
    if (this.pendingReplace) {
      this.banner.text = `슬롯이 꽉 찼다 — "${this.pendingReplace.name}"으로 교체할 모듈을 고르세요 (ESC: 취소)`;
      return;
    }
    this.body.addChild(new Graphics().rect(0, 0, W, H).fill({ color: C.black, alpha: 0.75 }));
    const head = label(`📦 보급 도착 (${s.reason}) — 하나를 고르세요`, 24, C.amber);
    head.anchor.set(0.5, 0);
    head.position.set(W / 2, 120);
    this.body.addChild(head);
    s.options.forEach((m, i) => {
      const x = W / 2 - 450 + i * 310, y = 180;
      const card = new Container();
      const col = CATEGORY_COLOR[m.category];
      card.addChild(new Graphics().roundRect(0, 0, 280, 300, 8).fill(C.wallDark).stroke({ width: 3, color: col }).rect(0, 0, 280, 32).fill(col));
      const cat = label(CATEGORY_NAME[m.category], 15, C.black, { fontWeight: 'bold' });
      cat.position.set(12, 7);
      const name = label(m.name, 20, C.text, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: 256 });
      name.position.set(12, 46);
      const desc = label(m.desc, 14, C.text, { wordWrap: true, wordWrapWidth: 256, lineHeight: 20 });
      desc.position.set(12, 100);
      card.addChild(cat, name, desc);
      if (m.side) {
        const side = label(`⚠ 부작용: ${m.side}`, 13, C.red, { wordWrap: true, wordWrapWidth: 256, lineHeight: 19 });
        side.position.set(12, 210);
        card.addChild(side);
      }
      card.position.set(x, y);
      card.eventMode = 'static';
      card.cursor = 'pointer';
      card.on('pointerdown', () => this.onPick(m));
      this.body.addChild(card);
    });
    this.body.addChild(button('건너뛰기', W / 2 - 80, 510, 160, 44, this.onSkip));
    const hint = label(`빈 슬롯 ${g.slots.filter((x) => !x).length}개 · 보급을 고르는 동안 시간은 멈춘다`, 14, C.textDim);
    hint.anchor.set(0.5, 0);
    hint.position.set(W / 2, 570);
    this.body.addChild(hint);
  }
}

export class PauseBanner extends Container {
  constructor() {
    super();
    this.addChild(new Graphics().rect(0, 0, W, 34).fill({ color: C.black, alpha: 0.7 }));
    const t = label('일시정지 [Space] — 모듈을 드래그해서 재배치할 수 있다', 18, C.amber);
    t.anchor.set(0.5);
    t.position.set(W / 2, 17);
    this.addChild(t);
    this.eventMode = 'none';
    this.visible = false;
  }
}

const ENDINGS: Record<EndingKind, { title: string; text: string; color: number }> = {
  stable: { title: '비상 해제', text: '모든 사고 원인을 해결하고 원자로를 정상 출력으로 안정시켰다.', color: C.green },
  cold: { title: '냉온 정지', text: '원자로는 멈췄다. 발전소는 오늘 밤 불이 꺼진 채로 버틴다.', color: C.amber },
  meltdown: { title: '멜트다운', text: '노심이 녹아내렸다. 운전원은 제어실을 떠나지 못했다.', color: C.red },
  abandon: { title: '체포', text: '운전원은 대피했지만, 원자로를 고의로 폭발시킨 혐의로 체포되었다.\n발전량은 전부 몰수되었다.', color: C.red },
};

export class EndingOverlay extends Container {
  private fade = new Graphics().rect(0, 0, W, H).fill(C.black);
  private content = new Container();
  private elapsed = 0;

  constructor(private onRestart: () => void) {
    super();
    this.addChild(this.fade, this.content);
    this.visible = false;
  }

  show(g: Game) {
    const e = g.ending!;
    const def = ENDINGS[e.kind];
    this.visible = true;
    this.elapsed = 0;
    this.content.removeChildren();
    const title = label(def.title, 64, def.color, { fontWeight: 'bold', letterSpacing: 6 });
    title.anchor.set(0.5);
    title.position.set(W / 2, 220);
    const text = label(def.text, 18, C.text, { align: 'center', lineHeight: 28 });
    text.anchor.set(0.5, 0);
    text.position.set(W / 2, 290);
    const score = label(
      `점수(발전량) ${e.score.toFixed(1)} GJ${e.kind === 'abandon' ? ' (몰수)' : ''}\n경과 ${fmtTime(e.t)} · 시드 ${g.seed}`,
      20, C.amber, { align: 'center', lineHeight: 30 });
    score.anchor.set(0.5, 0);
    score.position.set(W / 2, 380);
    this.content.addChild(title, text, score, button('다시 교대 투입 [R]', W / 2 - 110, 500, 220, 48, this.onRestart));
  }

  hide() { this.visible = false; }

  /** 프로스트펑크식 페이드 아웃: 화면이 천천히 어두워진 뒤 결말이 떠오른다 */
  update(dt: number) {
    if (!this.visible) return;
    this.elapsed += dt;
    this.fade.alpha = Math.min(0.92, this.elapsed / 3);
    this.content.alpha = Math.max(0, Math.min(1, (this.elapsed - 2.5) / 1.5));
  }
}
