import { describe, expect, it } from 'vitest';
import { MODULES } from '../src/sim/data';
import { bot } from './bot';
import {
  abandon, has, hasCause, newGame, scram, setLever, setPump, setValve, step, takeSupply, useModule,
  type Game,
} from '../src/sim/game';

function run(g: Game, seconds: number, each?: (g: Game) => void) {
  const end = g.t + seconds;
  while (g.t < end && !g.ending) {
    each?.(g);
    while (g.supplyQueue.length) takeSupply(g, null);
    step(g);
  }
}

describe('원자로 시뮬레이션', () => {
  it('원인 없이 손대지 않으면 정상 상태가 유지되다 안정화 엔딩에 도달한다', () => {
    const g = newGame(1);
    g.causes = [];
    g.slots.fill(null);
    run(g, 55);
    expect(g.ending).toBeNull();
    expect(Math.abs(g.T - 300)).toBeLessThan(30);
    expect(g.risk).toBeLessThan(20);
    run(g, 30);
    expect(g.ending?.kind).toBe('stable');
  });

  it('시작 패널에 초기 원인의 임시방편 모듈이 보장된다', () => {
    for (let seed = 0; seed < 30; seed++) {
      const g = newGame(seed);
      const initial = g.causes[0].id;
      expect(g.slots.filter(Boolean)).toHaveLength(3);
      expect(g.slots.some((id) => id && MODULES[id].mitigates === initial)).toBe(true);
      expect(g.slots.some((id) => id && MODULES[id].category === 'fix')).toBe(false);
    }
  });

  it('제어봉을 모두 빼면 멜트다운한다', () => {
    const g = newGame(2, 'leak');
    run(g, 300, (x) => setLever(x, 0));
    expect(g.ending?.kind).toBe('meltdown');
    expect(g.ending!.score).toBeGreaterThan(0);
  });

  it('터빈을 닫으면 압력으로 멜트다운한다', () => {
    const g = newGame(3, 'boron');
    run(g, 300, (x) => setValve(x, 0));
    expect(g.ending?.kind).toBe('meltdown');
  });

  it('위험도가 낮을 때 SCRAM하면 냉온 정지로 끝난다', () => {
    const g = newGame(4, 'boron');
    run(g, 5);
    scram(g);
    run(g, 600, (x) => setPump(x, 0.8));
    expect(g.ending?.kind).toBe('cold');
  });

  it('SCRAM 없이 수동으로 출력을 내려도 냉온 정지에 도달한다', () => {
    const g = newGame(9, 'boron');
    run(g, 600, (x) => { setLever(x, 20); setPump(x, 0.8); });
    expect(g.scrammed).toBe(false);
    expect(g.ending?.kind).toBe('cold');
  });

  it('포기하면 발전량이 몰수된다', () => {
    const g = newGame(5);
    run(g, 30);
    expect(g.energy).toBeGreaterThan(0);
    abandon(g);
    expect(g.ending).toEqual(expect.objectContaining({ kind: 'abandon', score: 0 }));
  });

  it('해결 모듈은 일회용이고 원인을 끝낸다', () => {
    const g = newGame(6, 'leak');
    g.slots[7] = 'isolation';
    expect(useModule(g, 7)).toBe(true);
    expect(hasCause(g, 'leak')).toBe(false);
    expect(has(g, 'isolation')).toBe(false);
    expect(g.supplyQueue).toHaveLength(1);
  });

  it('인접한 진단기 + 보충수 펌프 조합으로 누설이 해결된다', () => {
    const g = newGame(7, 'leak');
    g.slots = [null, null, null, null, null, null, null, null];
    g.slots[0] = 'diagnostics';
    g.slots[1] = 'makeup';
    run(g, 25);
    expect(hasCause(g, 'leak')).toBe(false);
    expect(g.discoveredCombos.has('diagLeak')).toBe(true);
  });

  it('조건 유지형: 출력을 낮추고 펌프를 최대로 유지하면 증기발생기 세정이 끝난다', () => {
    const g = newGame(8, 'boron');
    g.causes = [];
    g.causes.push({ id: 'sgFouling', since: 0, progress: 0 });
    run(g, 120, (x) => { setLever(x, 14); setPump(x, 1); });
    expect(hasCause(g, 'sgFouling')).toBe(false);
  });

  it('간단한 봇이 여러 시드에서 안정화에 도달할 수 있다 (밸런스 확인)', () => {
    const results: Record<string, number> = {};
    const durations: number[] = [];
    for (let seed = 100; seed < 140; seed++) {
      const g = newGame(seed);
      run(g, 3600, bot);
      const kind = g.ending?.kind ?? 'timeout';
      results[kind] = (results[kind] ?? 0) + 1;
      if (g.ending) durations.push(g.ending.t);
    }
    durations.sort((a, b) => a - b);
    console.log('봇 결과', results, '판 길이(초) 중앙값', Math.round(durations[durations.length >> 1]));
    expect(results.stable ?? 0).toBeGreaterThan(0);
    // 어떤 판도 교착 상태로 끝없이 이어지지 않는다
    expect(results.timeout ?? 0).toBe(0);
  });
});
