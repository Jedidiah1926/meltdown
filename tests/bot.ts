import { MODULES } from '../src/sim/data';
import {
  capacity, hasCause, heldCount, installModule, scram, setLever, setPump, setValve, takeSupply, useModule, type Game,
} from '../src/sim/game';

const prevP = new WeakMap<Game, number>();

/** 간단한 운전원 봇: 온도를 맞추고, 보급에서 해결 모듈을 고르고, [조작] 원인을 처리한다 */
export function bot(g: Game) {
  while (g.supplyQueue.length) {
    const s = g.supplyQueue[0];
    const want = s.options.find((m) => m.fixes && hasCause(g, m.fixes))
      ?? s.options.find((m) => m.category !== 'fix' && m.category !== 'risky')
      ?? s.options.find((m) => m.category === 'fix' && !g.slots.includes(m.id) && !g.hand.includes(m.id));
    if (want && heldCount(g) < capacity(g)) takeSupply(g, want.id); else takeSupply(g, null);
  }
  // 손에 든 모듈은 빈 슬롯에 바로 끼운다
  while (g.hand.length && g.slots.includes(null)) installModule(g, 0, g.slots.indexOf(null));
  g.slots.forEach((id, i) => { if (id && MODULES[id].fixes && hasCause(g, MODULES[id].fixes!)) useModule(g, i); });

  const sg = hasCause(g, 'sgFouling');
  const trip = g.causes.find((c) => c.id === 'turbineTrip');
  // 출력을 목표에 맞추되, 온도가 높으면 목표를 낮춘다
  const targetP = sg ? 450 : trip ? 600 : g.T > 450 ? 900 : 1500;
  const tick = Math.round(g.t * 10);
  if (tick % 15 === 0) {
    const rising = g.P > (prevP.get(g) ?? g.P);
    if (g.P > targetP * 1.1 || (rising && g.P > targetP)) setLever(g, g.lever + 1);
    else if (g.P < targetP * 0.9 && !rising) setLever(g, g.lever - 1);
  }
  prevP.set(g, g.P);
  setPump(g, sg ? 1 : 0.8);
  if (trip) {
    if (trip.seqPhase === 'low') setValve(g, g.p < 80 ? 0 : 0.8);
    else if (trip.seqPhase === 'close') setValve(g, (trip.seqTimer ?? 0) > 5 ? g.valve + 0.03 : 0);
    else setValve(g, g.valve + 0.03);
  } else {
    setValve(g, g.p > 100 ? 1 : 0.7);
  }
  if (hasCause(g, 'rodStuck') && Math.round(g.t * 10) % 30 === 0) {
    setLever(g, g.lever + 1);
    setLever(g, g.lever - 1);
  }
  if (g.risk > 90 && !g.scrammed) scram(g);
}
