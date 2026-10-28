// 포기(대피) 결말 연출: 운전원의 상반신 그림자가 옅게 오른쪽으로 빠져나가고,
// 남겨진 원자로가 임계점을 향해 치닫다가 페이드아웃된다 (GDD 6.3)
import { BlurFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Game } from '../sim/game';
import { H, W } from './theme';

/** 연출 시간표 (초) */
export const EVAC = {
  /** 그림자가 자리에서 일어나 오른쪽으로 빠져나가는 구간 */
  leaveStart: 0.6,
  leaveEnd: 4.2,
  /** 위험도가 멜트다운 지점 바로 앞까지 오르는 구간 */
  climbStart: 1,
  climbEnd: 7,
  /** 이 시점부터 결말 화면이 페이드아웃을 시작한다 */
  fadeStart: 6,
};

/** 그림자 크기: 화면 아래쪽에 걸친 상반신 (머리 꼭대기 ~ 화면 아래 끝) */
const SHADOW_H = 520;
const SHADOW_ALPHA = 0.5;

export class Evacuation extends Container {
  private red = new Graphics().rect(0, 0, W, H).fill(0xff1a10);
  private shadow = new Container();
  private body = new Graphics();
  private t = 0;
  private startRisk = 0;
  private active = false;

  constructor() {
    super();
    this.red.alpha = 0;
    drawUpperBody(this.body);
    this.shadow.addChild(this.body);
    this.shadow.filters = [new BlurFilter({ strength: 6, quality: 3 })];
    this.addChild(this.red, this.shadow);
    this.eventMode = 'none';
    this.visible = false;
  }

  /** 그림자 픽셀아트가 있으면 임시 그래픽 대신 쓴다 (docs/art-prompts.md 3-1) */
  useShadow(texture: Texture) {
    const sp = new Sprite(texture);
    sp.anchor.set(0.5, 1);
    sp.scale.set(SHADOW_H / texture.height);
    this.shadow.addChild(sp);
    this.body.visible = false;
  }

  start(g: Game) {
    this.t = 0;
    this.startRisk = g.risk;
    this.active = true;
    this.visible = true;
  }

  stop() {
    this.active = false;
    this.visible = false;
    this.red.alpha = 0;
  }

  /** 화면 흔들림 크기 (main에서 stage를 흔든다) */
  shake = 0;

  update(g: Game, dt: number) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;

    // 남겨진 원자로: 위험도가 멜트다운 지점 바로 앞까지 오른다 (표시용, 시뮬레이션은 이미 끝남)
    const c = Math.max(0, Math.min(1, (t - EVAC.climbStart) / (EVAC.climbEnd - EVAC.climbStart)));
    g.risk = this.startRisk + (g.meltPoint - 2 - this.startRisk) * c * c;
    g.T += dt * 40 * c;

    // 붉은 경보 빛: 점점 빠르고 강하게 맥동
    const pulse = 0.5 + 0.5 * Math.sin(t * (4 + 8 * c));
    this.red.alpha = (0.05 + 0.3 * c) * (0.4 + 0.6 * pulse);
    // 화면이 완전히 어두워지면 흔들림도 멈춘다
    this.shake = t > EVAC.fadeStart + 3 ? 0 : 1 + 7 * c * c;

    // 상반신 그림자: 책상 앞 가운데에 있다가, 살짝 일어서며 오른쪽으로 미끄러지듯 빠져나가고 옅어진다
    const k = Math.max(0, Math.min(1, (t - EVAC.leaveStart) / (EVAC.leaveEnd - EVAC.leaveStart)));
    const e = k * k * (3 - 2 * k);
    const rise = Math.min(1, k * 4) * 26;
    this.shadow.position.set(W * 0.5 + W * 0.62 * e, H + 40 - rise + Math.sin(t * 5) * 3 * k);
    this.shadow.alpha = SHADOW_ALPHA * (1 - Math.max(0, (k - 0.6) / 0.4));
    this.shadow.visible = k < 1;
  }
}

/** 임시 그림자: 뒤에서 본 상반신 (머리·어깨·몸통 윗부분). 원점 = 아래 가운데 */
function drawUpperBody(g: Graphics) {
  const s = SHADOW_H / 300;
  const ink = 0x000000;
  g.clear();
  // 몸통과 어깨
  g.roundRect(-150 * s, -170 * s, 300 * s, 220 * s, 70 * s).fill(ink);
  // 목
  g.rect(-34 * s, -205 * s, 68 * s, 50 * s).fill(ink);
  // 머리
  g.ellipse(0, -245 * s, 58 * s, 66 * s).fill(ink);
}
