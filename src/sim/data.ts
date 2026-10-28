// 사고 원인·모듈 정의 (프로토타입: 가압경수로, 2000 단계). docs/GDD.md 7장·8장 참고.

export type CauseId = 'leak' | 'bearing' | 'boron' | 'turbineTrip' | 'rodStuck' | 'sgFouling';
export type Equipment = 'pump' | 'turbine' | 'sg' | 'rodDrive';

export interface CauseDef {
  id: CauseId;
  name: string;
  initial: boolean;
  /** 공통 원인은 단서가 있다 (GDD 7.4) */
  clue: string;
  /** 해결 방식: 모듈 / 조작 유형 */
  solve: 'module' | 'condition' | 'chance' | 'sequence';
  /** 해결되면 수리되는 설비 */
  repairs?: Equipment;
}

export const CAUSES: Record<CauseId, CauseDef> = {
  leak: {
    id: 'leak', name: '1차 냉각재 소량 누설', initial: true, solve: 'module',
    clue: '1차 계통 냉각재 재고가 계속 줄고 있다. 누설 의심 — 보충이 필요하다.',
  },
  bearing: {
    id: 'bearing', name: '냉각 펌프 베어링 손상', initial: true, solve: 'module', repairs: 'pump',
    clue: '냉각 펌프 진동 증가. 펌프를 세게 돌릴수록 손상이 빨라진다.',
  },
  boron: {
    id: 'boron', name: '붕소 희석', initial: true, solve: 'module',
    clue: '반응도가 저절로 조금씩 오르고 있다. 냉각재 붕소 농도 저하 의심.',
  },
  turbineTrip: {
    id: 'turbineTrip', name: '터빈 반복 트립', initial: false, solve: 'sequence', repairs: 'turbine',
    clue: '터빈 보호계통 오작동. 리셋 절차 필요 — 저압 상태에서 완전 폐쇄 후, 서서히.',
  },
  rodStuck: {
    id: 'rodStuck', name: '제어봉 1개 걸림', initial: false, solve: 'chance', repairs: 'rodDrive',
    clue: '제어봉 하나가 레버에 제대로 반응하지 않는다. 열팽창에 의한 걸림 의심.',
  },
  sgFouling: {
    id: 'sgFouling', name: '증기발생기 오염', initial: false, solve: 'condition', repairs: 'sg',
    clue: '증기발생기 열전달 저하. 배관 내벽 오염 의심 — 유량 증대가 필요하다.',
  },
};

export type ModuleId =
  | 'makeup' | 'limiter' | 'lubricator'
  | 'isolation' | 'sparePump' | 'boric'
  | 'diagnostics' | 'coreLimit'
  | 'fastRods' | 'relief' | 'extraPump' | 'turbineHE'
  | 'overPump';

export type Category = 'stopgap' | 'fix' | 'info' | 'support' | 'risky';

export interface ModuleDef {
  id: ModuleId;
  name: string;
  /** 슬롯에 표시되는 짧은 이름 */
  short: string;
  category: Category;
  desc: string;
  /** 부작용은 설명에 표시한다 (GDD 8.3) */
  side?: string;
  /** 해결 모듈: 일회용 */
  fixes?: CauseId;
  /** 임시방편으로 약화시키는 원인 (시작 패널 보장에 사용) */
  mitigates?: CauseId;
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  makeup: {
    id: 'makeup', name: '보충수 주입 펌프', short: '보충수', category: 'stopgap', mitigates: 'leak',
    desc: '줄어드는 냉각재를 보충한다. 누설을 늦추지만 막지는 못한다.',
  },
  limiter: {
    id: 'limiter', name: '출력 제한기', short: '출력제한', category: 'stopgap', mitigates: 'boron',
    desc: '열출력이 1600MW를 넘으면 반응도를 강제로 깎는다.',
    side: '고출력 운전이 어려워져 발전량이 줄어든다.',
  },
  lubricator: {
    id: 'lubricator', name: '펌프 베어링 윤활기', short: '윤활기', category: 'support', mitigates: 'bearing',
    desc: '펌프 마모 속도를 절반으로 줄인다. 베어링 손상 시 펌프 출력 제한을 완화한다.',
  },
  isolation: {
    id: 'isolation', name: '누설 구간 격리 밸브', short: '격리밸브', category: 'fix', fixes: 'leak',
    desc: '누설 구간을 격리해 1차 냉각재 누설을 끝낸다. 일회용.',
  },
  sparePump: {
    id: 'sparePump', name: '예비 펌프 전환반', short: '예비펌프', category: 'fix', fixes: 'bearing',
    desc: '예비 펌프로 전환해 베어링 손상을 끝낸다. 펌프 내구도 복구. 일회용.',
  },
  boric: {
    id: 'boric', name: '붕산 주입 장치', short: '붕산주입', category: 'fix', fixes: 'boron',
    desc: '붕산을 주입해 붕소 희석을 끝낸다. 일회용.',
    side: '과주입으로 한동안 출력이 잘 오르지 않는다.',
  },
  diagnostics: {
    id: 'diagnostics', name: '설비 진단기', short: '진단기', category: 'info',
    desc: '설비별 내구도를 숫자로 보여 준다.',
  },
  coreLimit: {
    id: 'coreLimit', name: '노심 한계 측정기', short: '한계측정', category: 'info',
    desc: '이번 판의 멜트다운 지점을 위험도 게이지에 표시한다.',
  },
  fastRods: {
    id: 'fastRods', name: '고속 제어봉 구동장치', short: '고속봉', category: 'support',
    desc: '제어봉이 레버를 1.8배 빠르게 따라간다.',
  },
  relief: {
    id: 'relief', name: '자동 압력 방출 밸브', short: '방출밸브', category: 'support',
    desc: '압력이 135bar를 넘으면 자동으로 증기를 배출한다.',
    side: '배출할 때마다 냉각재가 줄어든다.',
  },
  extraPump: {
    id: 'extraPump', name: '증설 냉각 펌프', short: '증설펌프', category: 'support',
    desc: '냉각 능력 +25%.',
  },
  turbineHE: {
    id: 'turbineHE', name: '고효율 터빈', short: '고효율터빈', category: 'support',
    desc: '같은 증기로 발전량 +15%.',
    side: '터빈 마모가 1.5배 빨라진다.',
  },
  overPump: {
    id: 'overPump', name: '과부하 냉각 펌프', short: '과부하펌프', category: 'risky',
    desc: '냉각 능력 +60%.',
    side: '펌프 마모 3배. 베어링이 손상되면 옆 증기발생기까지 손상된다.',
  },
};

export const CATEGORY_NAME: Record<Category, string> = {
  stopgap: '임시방편', fix: '해결', info: '정보', support: '운전 보조', risky: '하이 리스크',
};

/** 보급 가중치 (보장 없음, GDD 8.1) */
export const SUPPLY_WEIGHT: Record<Category, number> = {
  fix: 3, stopgap: 2, support: 2, info: 1.5, risky: 1,
};

/** 조합 해결 (숨김, 발견 시 도감 기록): 인접한 두 모듈이 원인을 해결 */
export interface ComboDef { id: string; a: ModuleId; b: ModuleId; fixes: CauseId; seconds: number; name: string }
export const COMBOS: ComboDef[] = [
  { id: 'diagLeak', a: 'diagnostics', b: 'makeup', fixes: 'leak', seconds: 20, name: '누설 위치 특정 + 구간 보충' },
];

export const EQUIPMENT_NAME: Record<Equipment, string> = {
  pump: '냉각 펌프', turbine: '터빈', sg: '증기발생기', rodDrive: '제어봉 구동부',
};

/** 연쇄 고장: 설비가 고장 나면 생기는 원인 */
export const FAILURE_CAUSE: Record<Equipment, CauseId> = {
  pump: 'bearing', turbine: 'turbineTrip', sg: 'sgFouling', rodDrive: 'rodStuck',
};
