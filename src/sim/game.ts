// 한 판의 상태와 진행. 화면과 무관한 순수 로직 (docs/GDD.md 2~8장).
import {
  CAUSES, COMBOS, EQUIPMENT_NAME, FAILURE_CAUSE, MODULES, SUPPLY_WEIGHT,
  type CauseId, type Equipment, type ModuleDef, type ModuleId,
} from './data';
import { mulberry32, pick, weightedPick, type Rng } from './rng';

export const DT = 0.1;
export const LEVER_NOTCHES = 20;
export const SLOT_COLS = 4;
export const SLOT_ROWS = 2;

const T_NORMAL = 300, T_LIMIT = 900;
const P_NORMAL = 1000, P_LIMIT = 3500;
const PR_NORMAL = 70, PR_LIMIT = 150;
const HEAT_CAP = 50, COOL_K = 6.41, T_COOLANT = 40;
const STEAM_K = 0.042, DRUM_VOL = 10, ELEC_EFF = 0.33;
const STABLE_HOLD = 60, COLD_HOLD = 15, COLD_T = 150;
const STAGE_DOWN_DELAY = 8;

export type Stage = 1 | 2 | 3 | 4;
export const STAGE_NAME: Record<Stage, string> = {
  1: 'UNUSUAL EVENT', 2: 'ALERT', 3: 'SITE AREA EMERGENCY', 4: 'GENERAL EMERGENCY',
};
export const STAGE_NAME_KO: Record<Stage, string> = {
  1: '특이 사건', 2: '경계', 3: '부지 비상', 4: '전면 비상',
};

export type EndingKind = 'stable' | 'cold' | 'meltdown' | 'abandon';

export interface ActiveCause {
  id: CauseId;
  since: number;
  /** 조건 유지형·조합 해결 진행도 0..1 */
  progress: number;
  // 원인별 상태
  stuckAt?: number;
  nextTripAt?: number;
  seqPhase?: 'low' | 'close' | 'reopen';
  seqTimer?: number;
}

export interface LogEntry { t: number; msg: string; kind: 'info' | 'warn' | 'bad' | 'good' }

export interface Supply { options: ModuleDef[]; reason: string }

export interface Game {
  seed: number;
  rng: Rng;
  t: number;
  // 플레이어 입력
  lever: number;        // 0..20 (20 = 전량 삽입)
  pumpCmd: number;      // 0..1
  valveTarget: number;  // 0..1
  // 물리 상태
  rods: number;         // 실제 삽입률 0..1
  valve: number;        // 실제 밸브 개도 0..1
  P: number; T: number; p: number;
  I: number; X: number; D: number;
  inventory: number;    // 1차 냉각재 재고 0..1
  boronRho: number;
  flow: number;
  elec: number;
  energy: number;       // GJ = 점수
  dura: Record<Equipment, number>;
  // 위기
  causes: ActiveCause[];
  stage: Stage;
  reached: Set<Stage>;
  stageDownTimer: number;
  risk: number;
  meltPoint: number;
  tripUntil: number;
  // 모듈
  slots: (ModuleId | null)[];
  supplyQueue: Supply[];
  discoveredCombos: Set<string>;
  // 결말
  scrammed: boolean;
  stableTimer: number;
  coldTimer: number;
  ending: { kind: EndingKind; score: number; t: number } | null;
  log: LogEntry[];
  // 내부
  prevT: number; prevPr: number;
  leverHistory: { t: number; dir: number }[];
}

// ---------- 생성 ----------

export function newGame(seed = Math.floor(Math.random() * 1e9), forcedCause?: CauseId): Game {
  const rng = mulberry32(seed);
  const g: Game = {
    seed, rng, t: 0,
    lever: 10, pumpCmd: 0.6, valveTarget: 0.6,
    rods: 0.5, valve: 0.6,
    P: 1000, T: 300, p: 69, I: 1, X: 0.5, D: 65,
    inventory: 1, boronRho: 0, flow: 0.6, elec: 0, energy: 0,
    dura: { pump: 100, turbine: 100, sg: 100, rodDrive: 100 },
    causes: [], stage: 1, reached: new Set([1]), stageDownTimer: 0,
    risk: 0, meltPoint: 140 + rng() * 10, tripUntil: 0,
    slots: Array(SLOT_COLS * SLOT_ROWS).fill(null),
    supplyQueue: [], discoveredCombos: new Set(),
    scrammed: false, stableTimer: 0, coldTimer: 0, ending: null, log: [],
    prevT: 300, prevPr: 69, leverHistory: [],
  };

  const initial = forcedCause ?? pick(rng, Object.values(CAUSES).filter((c) => c.initial)).id;
  addCause(g, initial);

  // 시작 모듈 3개: 초기 원인의 임시방편 1개 보장 + 해결 모듈을 뺀 무작위 2개 (GDD 8.1, 8.6)
  const guaranteed = Object.values(MODULES).find((m) => m.mitigates === initial)!;
  const start: ModuleId[] = [guaranteed.id];
  const pool = Object.values(MODULES).filter((m) => m.category !== 'fix' && m.id !== guaranteed.id);
  while (start.length < 3) {
    const m = weightedPick(rng, pool.filter((x) => !start.includes(x.id)), (x) => SUPPLY_WEIGHT[x.category]);
    start.push(m.id);
  }
  start.forEach((id, i) => { g.slots[i] = id; });
  log(g, `${STAGE_NAME[1]} 선포 — 운전원은 원자로를 안정화하라.`, 'warn');
  return g;
}

// ---------- 조회 ----------

export const has = (g: Game, id: ModuleId) => g.slots.includes(id);
export const hasCause = (g: Game, id: CauseId) => g.causes.some((c) => c.id === id);
const cause = (g: Game, id: CauseId) => g.causes.find((c) => c.id === id);

/** 원인을 방치한 정도: 1에서 시작해 5분마다 +1 */
export function severity(g: Game, id: CauseId): number {
  const c = cause(g, id);
  return c ? 1 + (g.t - c.since) / 300 : 0;
}

export function neighbors(slot: number): number[] {
  const r = Math.floor(slot / SLOT_COLS), c = slot % SLOT_COLS;
  const out: number[] = [];
  if (c > 0) out.push(slot - 1);
  if (c < SLOT_COLS - 1) out.push(slot + 1);
  out.push(r === 0 ? slot + SLOT_COLS : slot - SLOT_COLS);
  return out;
}

function adjacent(g: Game, a: ModuleId, b: ModuleId): boolean {
  const ia = g.slots.indexOf(a);
  if (ia < 0) return false;
  return neighbors(ia).some((n) => g.slots[n] === b);
}

function log(g: Game, msg: string, kind: LogEntry['kind'] = 'info') {
  g.log.push({ t: g.t, msg, kind });
  if (g.log.length > 60) g.log.shift();
}

// ---------- 원인 ----------

function addCause(g: Game, id: CauseId) {
  if (hasCause(g, id)) return;
  const c: ActiveCause = { id, since: g.t, progress: 0 };
  if (id === 'rodStuck') c.stuckAt = g.rods;
  if (id === 'turbineTrip') { c.nextTripAt = g.t + 4; c.seqPhase = 'low'; c.seqTimer = 0; }
  g.causes.push(c);
  log(g, `▲ 사고 원인 발생: ${CAUSES[id].name}`, 'bad');
  log(g, `  단서: ${CAUSES[id].clue}`, 'warn');
}

function resolveCause(g: Game, id: CauseId, how: string) {
  if (!hasCause(g, id)) return;
  g.causes = g.causes.filter((c) => c.id !== id);
  const rep = CAUSES[id].repairs;
  if (rep) g.dura[rep] = 100;
  log(g, `○ 원인 해결: ${CAUSES[id].name} (${how})`, 'good');
  queueSupply(g, '원인 해결');
}

// ---------- 보급 ----------

function queueSupply(g: Game, reason: string) {
  const pool = Object.values(MODULES).filter((m) => m.category === 'fix' || !has(g, m.id));
  const options: ModuleDef[] = [];
  while (options.length < 3) {
    const left = pool.filter((m) => !options.includes(m));
    if (!left.length) break;
    options.push(weightedPick(g.rng, left, (m) => SUPPLY_WEIGHT[m.category]));
  }
  g.supplyQueue.push({ options, reason });
  log(g, `▣ 보급 도착 (${reason})`, 'good');
}

/** 보급 선택. slot이 차 있으면 기존 모듈을 버리고 교체한다. moduleId가 null이면 건너뛴다. */
export function takeSupply(g: Game, moduleId: ModuleId | null, slot?: number): boolean {
  const s = g.supplyQueue[0];
  if (!s) return false;
  if (moduleId) {
    const target = slot ?? g.slots.indexOf(null);
    if (target < 0 || target >= g.slots.length) return false;
    const old = g.slots[target];
    if (old) log(g, `모듈 폐기: ${MODULES[old].name}`);
    g.slots[target] = moduleId;
    log(g, `모듈 설치: ${MODULES[moduleId].name}`, 'good');
  } else {
    log(g, '보급을 건너뛰었다.');
  }
  g.supplyQueue.shift();
  return true;
}

// ---------- 플레이어 조작 ----------

export function setLever(g: Game, notch: number) {
  if (g.ending || g.scrammed) return;
  const n = Math.max(0, Math.min(LEVER_NOTCHES, Math.round(notch)));
  if (n === g.lever) return;
  g.leverHistory.push({ t: g.t, dir: Math.sign(n - g.lever) });
  if (g.leverHistory.length > 6) g.leverHistory.shift();
  g.lever = n;
  tryUnstickRod(g);
}

export function setPump(g: Game, v: number) { if (!g.ending) g.pumpCmd = Math.max(0, Math.min(1, v)); }
export function setValve(g: Game, v: number) { if (!g.ending) g.valveTarget = Math.max(0, Math.min(1, v)); }

/** 확률 시도형: 레버를 넣었다 빼면 (2초 이내) 한 번의 시도 */
function tryUnstickRod(g: Game) {
  const c = cause(g, 'rodStuck');
  const h = g.leverHistory;
  if (!c || h.length < 2) return;
  const [a, b] = h.slice(-2);
  if (a.dir === 1 && b.dir === -1 && b.t - a.t <= 2) {
    h.length = 0;
    const chance = Math.max(0.05, Math.min(0.7, (650 - g.T) / 700));
    if (g.rng() < chance) {
      resolveCause(g, 'rodStuck', '제어봉 흔들어 풀기');
    } else {
      g.P *= 1.15;
      log(g, '제어봉이 풀리지 않았다 — 출력이 튄다', 'warn');
    }
  }
}

export function useModule(g: Game, slot: number): boolean {
  const id = g.slots[slot];
  if (!id || g.ending) return false;
  const def = MODULES[id];
  if (!def.fixes) return false;
  if (!hasCause(g, def.fixes)) {
    log(g, `${def.name}: 대상 원인(${CAUSES[def.fixes].name})이 없다.`);
    return false;
  }
  g.slots[slot] = null;
  if (id === 'boric') g.boronRho = -0.015;
  resolveCause(g, def.fixes, def.name);
  return true;
}

/** 일시정지 중 재배치 (UI가 일시정지 여부를 확인한다) */
export function moveModule(g: Game, from: number, to: number) {
  [g.slots[from], g.slots[to]] = [g.slots[to], g.slots[from]];
}

export function scram(g: Game) {
  if (g.scrammed || g.ending) return;
  g.scrammed = true;
  g.lever = LEVER_NOTCHES;
  log(g, 'SCRAM — 제어봉 전량 삽입. 냉온 정지 절차 개시.', 'warn');
  // 빨간 구간에서 누르면 재상승 가능 (GDD 5.1): 가장 약한 설비가 연쇄 고장
  if (g.risk >= 75 && g.rng() < 0.3 + (g.risk - 75) / 50) {
    const weakest = (Object.keys(g.dura) as Equipment[])
      .filter((e) => e !== 'rodDrive')
      .reduce((a, b) => (g.dura[a] <= g.dura[b] ? a : b));
    log(g, `SCRAM 충격으로 ${EQUIPMENT_NAME[weakest]} 손상!`, 'bad');
    fail(g, weakest);
  }
}

export function abandon(g: Game) {
  if (g.ending) return;
  g.ending = { kind: 'abandon', score: 0, t: g.t };
  log(g, '운전원 대피. 원자로 고의 폭발.', 'bad');
}

// ---------- 시뮬레이션 ----------

function fail(g: Game, e: Equipment) {
  const id = FAILURE_CAUSE[e];
  // 기본 조작 고장은 위험도 65% 이상에서만 (GDD 2.2)
  if (id === 'rodStuck' && g.risk < 65) return;
  if (hasCause(g, id)) return;
  g.dura[e] = Math.min(g.dura[e], 30);
  log(g, `연쇄 고장: ${EQUIPMENT_NAME[e]}`, 'bad');
  addCause(g, id);
  if (id === 'bearing' && has(g, 'overPump')) {
    g.dura.sg = Math.max(0, g.dura.sg - 25);
    log(g, '과부하 펌프 파손 — 증기발생기 손상', 'bad');
  }
}

export function step(g: Game, dt = DT) {
  if (g.ending || g.supplyQueue.length) return;
  g.t += dt;
  const stageMul = [0, 1, 1.5, 2, 3][g.stage];

  // 제어봉
  const speed = 0.12 * (has(g, 'fastRods') ? 1.8 : 1);
  let target = g.lever / LEVER_NOTCHES;
  const stuck = cause(g, 'rodStuck');
  if (stuck && !g.scrammed) target = 0.6 * stuck.stuckAt! + 0.4 * target;
  if (g.scrammed) g.rods = Math.min(1, g.rods + 1.5 * dt);
  else g.rods += Math.max(-speed * dt, Math.min(speed * dt, target - g.rods));

  // 터빈 밸브 (휠은 돌리는 데 시간이 걸린다)
  const prevValve = g.valve;
  g.valve += Math.max(-0.1 * dt, Math.min(0.1 * dt, g.valveTarget - g.valve));
  const valveRate = (g.valve - prevValve) / dt;

  // 원인별 효과. 오래 방치할수록 심해진다 (severity: 5분마다 +1)
  const bearing = hasCause(g, 'bearing');
  let pumpEff = g.pumpCmd;
  if (bearing) {
    const cap = (has(g, 'lubricator') ? 0.75 : 0.6) - 0.1 * (severity(g, 'bearing') - 1);
    pumpEff = Math.min(pumpEff, Math.max(0.2, cap));
  }
  const sgFactor = hasCause(g, 'sgFouling') ? Math.max(0.35, 0.7 - 0.1 * (severity(g, 'sgFouling') - 1)) : 1;

  if (hasCause(g, 'leak')) g.inventory -= 0.004 * severity(g, 'leak') * dt;
  if (has(g, 'makeup')) g.inventory += 0.003 * dt;
  g.inventory = Math.max(0, Math.min(1, g.inventory));
  // 상한 없음: 해결하지 않으면 결국 제어봉으로 감당할 수 없게 된다
  if (hasCause(g, 'boron')) g.boronRho = Math.min(0.2, g.boronRho + 0.00012 * dt);
  else if (g.boronRho < 0) g.boronRho = Math.min(0, g.boronRho + 0.0003 * dt);
  else g.boronRho = Math.max(0, g.boronRho - 0.001 * dt);

  // 냉각 유량
  let flowMul = 1;
  if (has(g, 'extraPump')) flowMul += 0.25;
  if (has(g, 'overPump')) flowMul += 0.6;
  const invFactor = g.inventory < 0.7 ? g.inventory / 0.7 : 1;
  g.flow = pumpEff * (0.25 + 0.75 * g.dura.pump / 100) * flowMul * invFactor;

  // 반응도와 출력
  let rho = 0.08 - 0.12 * g.rods - 0.0001 * (g.T - T_NORMAL) - 0.04 * g.X + g.boronRho;
  if (has(g, 'limiter') && g.P > 1600) rho -= (g.P - 1600) / 1000 * 0.03;
  g.P = Math.max(1, Math.min(20000, g.P + g.P * rho * 3 * dt + 0.3 * dt));

  // 잔열
  g.D += (0.065 * g.P - g.D) / 40 * dt;

  // 열전달
  const Q = Math.max(0, g.flow * COOL_K * sgFactor * (g.T - T_COOLANT));
  g.T = Math.max(T_COOLANT, g.T + (0.935 * g.P + g.D - Q) / HEAT_CAP * dt);

  // 증기와 터빈
  const trip = cause(g, 'turbineTrip');
  if (trip && trip.seqPhase === 'low' && g.t >= trip.nextTripAt!) {
    g.tripUntil = g.t + 5;
    trip.nextTripAt = g.t + (18 + g.rng() * 12) / severity(g, 'turbineTrip');
    log(g, '터빈 트립!', 'bad');
  }
  const tripped = g.t < g.tripUntil;
  const draw = tripped ? 0 : g.valve * g.p * (0.4 + 0.6 * g.dura.turbine / 100);
  let vent = 0.01 * g.p;
  if (has(g, 'relief') && g.p > 135) {
    vent += (g.p - 135) * 1.5;
    g.inventory = Math.max(0, g.inventory - 0.002 * dt);
  }
  g.p = Math.max(1, g.p + (Q * STEAM_K - draw - vent) / DRUM_VOL * dt);
  g.elec = (draw / STEAM_K) * ELEC_EFF * (has(g, 'turbineHE') ? 1.15 : 1);
  g.energy += g.elec * dt / 1000;

  // 제논
  const pn = g.P / 1000;
  g.I += (0.02 * pn - 0.02 * g.I) * dt;
  g.X = Math.max(0, g.X + (0.02 * g.I - 0.01 * g.X - 0.03 * pn * g.X) * dt);

  // [조작] 해결
  stepManualFixes(g, dt, valveRate);
  // 조합 해결 (숨김)
  for (const combo of COMBOS) {
    const c = cause(g, combo.fixes);
    if (!c) continue;
    if (adjacent(g, combo.a, combo.b)) {
      c.progress += dt / combo.seconds;
      if (c.progress >= 1) {
        const first = !g.discoveredCombos.has(combo.id);
        g.discoveredCombos.add(combo.id);
        resolveCause(g, combo.fixes, `조합: ${combo.name}${first ? ' — 도감에 기록됨' : ''}`);
      }
    }
  }

  // 마모와 연쇄 고장
  const wear = (e: Equipment, amount: number) => { g.dura[e] = Math.max(0, g.dura[e] - amount * dt); };
  const pumpWearMul = (has(g, 'lubricator') ? 0.5 : 1) * (has(g, 'overPump') ? 3 : 1);
  if (g.pumpCmd > 0.85) wear('pump', 0.4 * stageMul * pumpWearMul);
  if (bearing) wear('pump', (g.pumpCmd > 0.5 ? 0.5 : 0.06) * pumpWearMul);
  // 위기 단계가 높을수록 모든 설비가 저절로 닳는다
  const passive = [0, 0, 0.02, 0.04, 0.08][g.stage];
  wear('pump', passive); wear('turbine', passive); wear('sg', passive);
  if (g.p > 110) wear('turbine', (g.p - 110) * 0.02 * stageMul * (has(g, 'turbineHE') ? 1.5 : 1));
  if (g.T > 500) wear('sg', (g.T - 500) * 0.004 * stageMul);
  if (g.stage >= 3) wear('rodDrive', 0.05 * stageMul);
  for (const e of Object.keys(g.dura) as Equipment[]) {
    const weak = (100 - g.dura[e]) / 100;
    if (g.dura[e] <= 0 || g.rng() < weak * weak * 0.02 * stageMul * dt) fail(g, e);
  }
  if (g.p > 135 && g.rng() < 0.02 * dt) addCause(g, 'leak');

  // 위험도 (GDD 3.2: 가장 나쁜 물리 지표 + 추세 보정)
  const dT = (g.T - g.prevT) / dt, dPr = (g.p - g.prevPr) / dt;
  g.prevT = g.T; g.prevPr = g.p;
  const base = Math.max(
    0,
    (g.T - T_NORMAL) / (T_LIMIT - T_NORMAL) * 100,
    (g.p - PR_NORMAL) / (PR_LIMIT - PR_NORMAL) * 100,
    (g.P - P_NORMAL) / (P_LIMIT - P_NORMAL) * 100,
    // 냉각재 재고(노심 수위): 재고 30%에서 100%, 바닥나면 노심 노출
    (1 - g.inventory) / 0.7 * 100,
  );
  const trend = Math.max(0, Math.min(10, Math.max(dT * 2, dPr * 4)));
  g.risk = base + trend;

  updateStage(g, dt);
  checkEnding(g, dt);
}

function stepManualFixes(g: Game, dt: number, valveRate: number) {
  // 조건 유지형: 증기발생기 세정
  const sg = cause(g, 'sgFouling');
  if (sg) {
    if (g.P < 600 && g.flow >= 0.85) sg.progress += dt / 30;
    else sg.progress = Math.max(0, sg.progress - dt / 60);
    if (sg.progress >= 1) resolveCause(g, 'sgFouling', '세정 운전');
  }
  // 순서형: 터빈 리셋 — 저압 → 완전 폐쇄 유지 → 천천히 재개방
  const tr = cause(g, 'turbineTrip');
  if (tr) {
    if (tr.seqPhase === 'low' && g.p < 80) {
      tr.seqPhase = 'close'; tr.seqTimer = 0;
    }
    if (tr.seqPhase === 'close') {
      if (g.valve < 0.02) {
        tr.seqTimer! += dt;
        if (tr.seqTimer! >= 4 && g.valveTarget > 0) tr.seqPhase = 'reopen';
      } else if (g.valveTarget > g.valve) {
        // 완전히 닫기 전에 다시 열면 처음부터
        if (tr.seqTimer! > 0) tr.seqPhase = 'low';
      } else if (g.p >= 95) {
        tr.seqPhase = 'low';
      }
    }
    if (tr.seqPhase === 'reopen') {
      if (valveRate > 0.05) {
        tr.seqPhase = 'low';
        tr.nextTripAt = g.t;
        log(g, '너무 빨리 열었다 — 터빈 재트립', 'bad');
      } else if (g.valve >= 0.5) {
        resolveCause(g, 'turbineTrip', '터빈 리셋 절차');
      }
    }
  }
}

function updateStage(g: Game, dt: number) {
  const oldest = g.causes.length ? g.t - Math.min(...g.causes.map((c) => c.since)) : 0;
  let target: Stage = 1;
  if (oldest > 90 || g.causes.length >= 2 || g.risk >= 40) target = 2;
  if (oldest > 210 || g.causes.length >= 3 || g.risk >= 65) target = 3;
  if (g.risk > 100) target = 4;

  if (target > g.stage) {
    g.stage = target;
    g.stageDownTimer = 0;
    log(g, `${STAGE_NAME[target]} 선포 (${STAGE_NAME_KO[target]})`, 'bad');
    if (!g.reached.has(target)) {
      g.reached.add(target);
      queueSupply(g, `${STAGE_NAME_KO[target]} 첫 선포`);
    }
  } else if (target < g.stage) {
    g.stageDownTimer += dt;
    if (g.stageDownTimer >= STAGE_DOWN_DELAY) {
      g.stage = (g.stage - 1) as Stage;
      g.stageDownTimer = 0;
      log(g, `비상 단계 하향: ${STAGE_NAME[g.stage]}`, 'good');
    }
  } else {
    g.stageDownTimer = 0;
  }
}

function checkEnding(g: Game, dt: number) {
  if (g.risk >= g.meltPoint) {
    g.ending = { kind: 'meltdown', score: g.energy, t: g.t };
    log(g, '멜트다운.', 'bad');
    return;
  }
  // SCRAM 또는 수동으로 출력을 내려 정지한 상태 (제어봉 90% 이상, 핵분열 출력 50MW 미만)
  const shutdown = g.scrammed || (g.rods >= 0.9 && g.P < 50);
  if (shutdown) {
    g.coldTimer = g.T < COLD_T ? g.coldTimer + dt : 0;
    if (g.coldTimer >= COLD_HOLD) {
      g.ending = { kind: 'cold', score: g.energy, t: g.t };
      log(g, '냉온 정지 달성.', 'good');
    }
    if (g.scrammed) return;
  } else {
    g.coldTimer = 0;
  }
  const ok = g.causes.length === 0 && g.risk < 40 && g.P >= 800;
  g.stableTimer = ok ? g.stableTimer + dt : 0;
  if (g.stableTimer >= STABLE_HOLD) {
    g.ending = { kind: 'stable', score: g.energy, t: g.t };
    log(g, '비상 해제 선포. 운전 중 안정화 달성.', 'good');
  }
}

export const STABLE_HOLD_SECONDS = STABLE_HOLD;
export const COLD_HOLD_SECONDS = COLD_HOLD;
