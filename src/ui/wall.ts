// 벽면 콘솔 = 보는 것: 위험도 게이지, CRT, 경고등, 계기 (GDD 12장 화면 구도)
import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { CRTFilter, GlowFilter } from 'pixi-filters';
import { CAUSES, EQUIPMENT_NAME, FAILURE_CAUSE, type Equipment } from '../sim/data';
import { STAGE_NAME, STAGE_NAME_KO, has, hasCause, type Game } from '../sim/game';
import { C, WALL_H, W, label } from './theme';

const GAUGE = { x: 170, y: 215, r: 120 };
const GAUGE_MAX = 150;

/** 위험도 → 각도 (0% = 왼쪽 수평, 100% = 오른쪽 수평 = 눈금 끝, 150% = 오른쪽 아래로 40°) */
function riskAngle(risk: number): number {
  const v = Math.max(0, Math.min(GAUGE_MAX, risk));
  const deg = v <= 100 ? 180 - v / 100 * 180 : -(v - 100) / 50 * 40;
  return -deg * Math.PI / 180;
}

export class Wall extends Container {
  private needle = new Graphics();
  private needleValue = 0;
  private gaugeText: Text;
  private crt = new Container();
  private crtGfx = new Graphics();
  private crtStage: Text;
  private crtLog: Text;
  private crtFilter: CRTFilter;
  private history: number[] = [];
  private lamps: { e: Equipment; g: Graphics; t: Text }[] = [];
  private readouts: Record<string, Text> = {};
  private stableText: Text;
  /** 벽면 아트(wall_bg.png)가 들어오면 숨기는 임시 그래픽: 벽, 오목한 자리 테두리 */
  private placeholder = new Graphics();

  constructor() {
    super();
    const ph = this.placeholder
      .rect(0, 0, W, WALL_H).fill(C.wall)
      .rect(0, WALL_H - 8, W, 8).fill(C.wallDark);
    for (let x = 0; x < W; x += 64) ph.rect(x, 0, 2, WALL_H).fill(C.wallDark);
    ph.roundRect(20, 40, 300, 260, 10).fill(C.wallDark)   // 게이지 자리
      .roundRect(340, 20, 600, 300, 18).fill(C.metalDark) // CRT 자리
      .roundRect(960, 20, 300, 300, 10).fill(C.wallDark); // 경고등·계기 자리
    this.addChild(ph);

    // 위험도 게이지
    const face = new Graphics()
      .roundRect(30, 50, 280, 240, 8).fill(0xe8b07a);
    const zones: [number, number, number][] = [[0, 40, C.green], [40, 75, C.yellow], [75, 100, C.red]];
    const zone = (a: number, b: number, color: number) => {
      const s = riskAngle(a);
      face.moveTo(GAUGE.x + Math.cos(s) * GAUGE.r, GAUGE.y + Math.sin(s) * GAUGE.r)
        .arc(GAUGE.x, GAUGE.y, GAUGE.r, s, riskAngle(b)).stroke({ width: 16, color });
    };
    for (const [a, b, col] of zones) zone(a, b, col);
    // 100% 너머는 아무 표시 없음: 바늘만 표시 한계를 넘어 움직인다
    for (let v = 0; v <= 100; v += 10) {
      const a = riskAngle(v);
      face.moveTo(GAUGE.x + Math.cos(a) * (GAUGE.r - 22), GAUGE.y + Math.sin(a) * (GAUGE.r - 22))
        .lineTo(GAUGE.x + Math.cos(a) * (GAUGE.r - 10), GAUGE.y + Math.sin(a) * (GAUGE.r - 10))
        .stroke({ width: v % 50 === 0 ? 3 : 1, color: 0x2a120d });
    }
    face.circle(GAUGE.x, GAUGE.y, 10).fill(0x2a120d);
    this.addChild(face);
    const ttl = label('☢ 위험도', 16, 0x2a120d);
    ttl.position.set(GAUGE.x - ttl.width / 2, GAUGE.y + 22);
    this.addChild(ttl);
    this.gaugeText = label('', 12, 0x5a2a1a);
    this.gaugeText.position.set(40, 268);
    this.addChild(this.needle, this.gaugeText);

    // CRT
    const bezel = new Graphics()
      .roundRect(356, 34, 568, 272, 14).fill(C.crt);
    this.addChild(bezel);
    this.crt.position.set(356, 34);
    this.crtStage = label('', 22, C.crtLine, { fontWeight: 'bold' });
    this.crtStage.position.set(16, 10);
    this.crtLog = label('', 13, C.crtLine, { wordWrap: true, wordWrapWidth: 536, lineHeight: 17 });
    this.crtLog.position.set(16, 150);
    this.crt.addChild(this.crtGfx, this.crtStage, this.crtLog);
    this.crtFilter = new CRTFilter({ curvature: 2, lineWidth: 2, lineContrast: 0.35, noise: 0.08, vignetting: 0.35 });
    this.crt.filters = [this.crtFilter, new GlowFilter({ distance: 6, outerStrength: 0.6, color: C.crtLine, quality: 0.2 })];
    this.addChild(this.crt);

    // 오른쪽: 경고등 + 디지털 계기 (2000 단계 = 디지털 표시)
    (['pump', 'turbine', 'sg', 'rodDrive'] as Equipment[]).forEach((e, i) => {
      const g = new Graphics();
      g.position.set(990 + i * 70, 50);
      const t = label(EQUIPMENT_NAME[e].replace(' ', '\n'), 11, C.textDim, { align: 'center' });
      t.position.set(990 + i * 70 - 24, 70);
      this.lamps.push({ e, g, t });
      this.addChild(g, t);
    });
    const rows: [string, string][] = [
      ['T', '노심 온도'], ['p', '증기압'], ['P', '열출력'], ['E', '전기 출력'], ['inv', '냉각재 재고'], ['score', '누적 발전량'],
    ];
    rows.forEach(([key, name], i) => {
      const n = label(name, 13, C.textDim);
      n.position.set(980, 120 + i * 30);
      const v = label('', 18, C.amber, { fontWeight: 'bold' });
      v.position.set(1120, 116 + i * 30);
      this.readouts[key] = v;
      this.addChild(n, v);
    });
    this.stableText = label('', 12, C.green);
    this.stableText.position.set(980, 300);
    this.addChild(this.stableText);
  }

  /** 벽면 아트 적용: 원본 640×170을 2배로 깔고 임시 벽을 숨긴다 (docs/art-prompts.md 1-1) */
  useBackground(texture: Texture) {
    const bg = new Sprite(texture);
    bg.scale.set(W / texture.width);
    this.addChildAt(bg, 0);
    this.placeholder.visible = false;
  }

  update(g: Game, dt: number, now: number) {
    // 바늘: 실제 값을 반 박자 늦게 따라가고 떨린다 (GDD 3.4)
    this.needleValue += (g.risk - this.needleValue) * Math.min(1, dt * 1.8);
    const jitter = Math.sin(now * 0.031) * 0.6 + Math.sin(now * 0.017) * 0.4 + (this.needleValue > 75 ? Math.sin(now * 0.09) * 1.5 : 0);
    const a = riskAngle(this.needleValue + jitter);
    this.needle.clear()
      .moveTo(GAUGE.x, GAUGE.y)
      .lineTo(GAUGE.x + Math.cos(a) * (GAUGE.r - 6), GAUGE.y + Math.sin(a) * (GAUGE.r - 6))
      .stroke({ width: 3, color: 0x1a0808 });
    this.gaugeText.text = has(g, 'coreLimit') ? `노심 한계 ${g.meltPoint.toFixed(0)}%` : '';

    // CRT: 출력 파형 + 단계 선포 + 운전 일지
    this.crtFilter.time += dt * 4;
    this.crtFilter.seed = Math.random();
    if (Math.round(g.t * 10) % 3 === 0 && this.history[this.history.length - 1] !== g.t) {
      this.history.push(g.P);
      if (this.history.length > 170) this.history.shift();
    }
    const cg = this.crtGfx.clear();
    cg.moveTo(0, 95).lineTo(568, 95).stroke({ width: 1, color: C.crtDim });
    this.history.forEach((v, i) => {
      const x = 10 + i * 3.2, y = 135 - Math.min(1, v / 3500) * 90;
      if (i) cg.lineTo(x, y); else cg.moveTo(x, y);
    });
    cg.stroke({ width: 2, color: C.crtLine });
    this.crtStage.text = `${STAGE_NAME[g.stage]}  ${STAGE_NAME_KO[g.stage]}${g.scrammed ? '   [SCRAM]' : ''}`;
    this.crtLog.text = g.log.slice(-7).map((l) => `${fmtTime(l.t)} ${l.msg}`).join('\n');

    // 경고등: 내구도가 낮으면 깜빡임(고장 징후), 원인 발생 시 빨간 점등
    const blink = Math.floor(now / 300) % 2 === 0;
    for (const { e, g: lamp, t } of this.lamps) {
      const failed = hasCause(g, FAILURE_CAUSE[e]);
      const warn = g.dura[e] < 35;
      const color = failed ? C.red : warn && blink ? C.amber : 0x3a2018;
      lamp.clear().circle(0, 0, 13).fill(color).circle(0, 0, 13).stroke({ width: 2, color: C.metal });
      t.text = EQUIPMENT_NAME[e].replace(' ', '\n') + (has(g, 'diagnostics') ? `\n${g.dura[e].toFixed(0)}%` : '');
    }

    const r = this.readouts;
    r.T.text = `${g.T.toFixed(0)} °C`;
    r.p.text = `${g.p.toFixed(1)} bar`;
    r.P.text = `${g.P.toFixed(0)} MWt`;
    r.E.text = `${g.elec.toFixed(0)} MWe`;
    r.inv.text = `${(g.inventory * 100).toFixed(0)} %`;
    r.score.text = `${g.energy.toFixed(1)} GJ`;
    r.inv.style.fill = g.inventory < 0.7 ? C.red : C.amber;

    const leaking = g.causes.map((c) => CAUSES[c.id].name);
    this.stableText.text = g.stableTimer > 0
      ? `안정 유지 ${g.stableTimer.toFixed(0)} / 60초`
      : g.coldTimer > 0 ? `냉온 정지 유지 ${g.coldTimer.toFixed(0)} / 15초` : leaking.length ? `미해결 원인 ${leaking.length}개` : '';
  }
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
