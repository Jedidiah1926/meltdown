// 포기(대피) 결말 연출: 운전원 실루엣이 제어실을 빠져나가고, 남겨진 원자로가 임계점을 향해 치닫는다 (GDD 6.3)
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Game } from '../sim/game';
import { H, W } from './theme';

/** 연출 시간표 (초) */
export const EVAC = {
  walkStart: 0.3,
  walkEnd: 4.2,
  /** 위험도가 멜트다운 지점 바로 앞까지 오르는 구간 */
  climbStart: 1,
  climbEnd: 7,
  /** 이 시점부터 결말 화면이 페이드아웃을 시작한다 */
  fadeStart: 6,
};

const FIGURE_H = 330;

export class Evacuation extends Container {
  private red = new Graphics().rect(0, 0, W, H).fill(0xff1a10);
  private figure = new Container();
  private body = new Graphics();
  private sprite: Sprite | null = null;
  private walkFrames: Texture[] = [];
  private t = 0;
  private startRisk = 0;
  private active = false;

  constructor() {
    super();
    this.red.alpha = 0;
    this.figure.addChild(this.body);
    this.addChild(this.red, this.figure);
    this.eventMode = 'none';
    this.visible = false;
  }

  /** 실루엣 픽셀아트(걸음 프레임들)가 있으면 임시 그래픽 대신 쓴다 (docs/art-prompts.md 3-1) */
  useWalkFrames(frames: Texture[]) {
    this.walkFrames = frames;
    this.sprite = new Sprite(frames[0]);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(FIGURE_H / frames[0].height);
    this.figure.addChild(this.sprite);
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

    // 실루엣: 책상 앞을 가로질러 오른쪽 출구로 걸어 나간다
    const w = (t - EVAC.walkStart) / (EVAC.walkEnd - EVAC.walkStart);
    this.figure.visible = w > 0 && w < 1;
    if (this.figure.visible) {
      const x = W * 0.45 + (W * 0.75) * easeIn(w);
      const step = t * 7;
      this.figure.position.set(x, H + 20 + Math.abs(Math.sin(step)) * -8);
      if (this.sprite) {
        this.sprite.texture = this.walkFrames[Math.floor(step) % this.walkFrames.length];
      } else {
        drawFigure(this.body, step);
      }
    }
  }
}

function easeIn(x: number) { return x * x * (3 - 2 * x); }

/** 임시 실루엣: 뒷모습, 걷는 동작 (발 위치 = 원점) */
function drawFigure(g: Graphics, step: number) {
  const s = FIGURE_H / 330;
  const swing = Math.sin(step) * 22 * s;
  const ink = 0x050202;
  g.clear();
  // 다리
  g.moveTo(-14 * s, -150 * s).lineTo(-14 * s + swing, 0).stroke({ width: 26 * s, color: ink, cap: 'round' });
  g.moveTo(14 * s, -150 * s).lineTo(14 * s - swing, 0).stroke({ width: 26 * s, color: ink, cap: 'round' });
  // 몸통 (작업복)
  g.roundRect(-46 * s, -285 * s, 92 * s, 145 * s, 20 * s).fill(ink);
  // 팔
  g.moveTo(-44 * s, -270 * s).lineTo(-52 * s - swing * 0.6, -160 * s).stroke({ width: 22 * s, color: ink, cap: 'round' });
  g.moveTo(44 * s, -270 * s).lineTo(52 * s + swing * 0.6, -160 * s).stroke({ width: 22 * s, color: ink, cap: 'round' });
  // 머리 (안전모)
  g.circle(0, -310 * s, 26 * s).fill(ink);
  g.ellipse(0, -322 * s, 34 * s, 12 * s).fill(ink);
}
