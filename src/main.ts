import { Application, Texture } from 'pixi.js';
import { DT, newGame, setLever, setPump, setValve, step, takeSupply, type Game } from './sim/game';
import type { ModuleDef } from './sim/data';
import { Desk } from './ui/desk';
import { EndingOverlay, PauseBanner, SupplyOverlay, TitleOverlay } from './ui/overlays';
import { C, H, W } from './ui/theme';
import { Wall } from './ui/wall';

const app = new Application();
await app.init({ width: W, height: H, background: C.bg, antialias: true });
document.getElementById('game')!.appendChild(app.canvas);

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  app.canvas.style.width = `${W * s}px`;
  app.canvas.style.height = `${H * s}px`;
}
window.addEventListener('resize', fit);
fit();

let game: Game = newGame();
let started = false;
let paused = false;
let acc = 0;
let shownSupply: unknown = null;
let endingShown = false;

const wall = new Wall();
const supply = new SupplyOverlay(pickSupply, () => { takeSupply(game, null); supply.pendingReplace = null; });
const desk = new Desk(() => game, {
  isPaused: () => paused,
  replacing: () => !!supply.pendingReplace,
  onReplace: (slot) => { takeSupply(game, supply.pendingReplace!.id, slot); supply.pendingReplace = null; },
  hover: (text) => desk.setInfo(text),
});
const pauseBanner = new PauseBanner();
const ending = new EndingOverlay(restart);
const title = new TitleOverlay(() => { started = true; title.visible = false; });
app.stage.addChild(wall, desk, pauseBanner, supply, ending, title);

/** public/art/ 의 픽셀아트 불러오기. <img>로 읽어야 Electron(file://)에서도 동작한다. 없으면 임시 그래픽 유지 */
async function loadArt(name: string): Promise<Texture> {
  const img = new Image();
  img.src = `art/${name}`;
  await img.decode();
  const texture = Texture.from(img);
  texture.source.scaleMode = 'nearest';
  return texture;
}
loadArt('wall_bg.png').then((t) => wall.useBackground(t)).catch(() => console.warn('wall_bg.png 없음 — 임시 그래픽 사용'));

function pickSupply(m: ModuleDef) {
  const empty = game.slots.indexOf(null);
  if (empty >= 0) takeSupply(game, m.id, empty);
  else supply.pendingReplace = m;
}

function restart() {
  game = newGame();
  paused = false;
  acc = 0;
  endingShown = false;
  shownSupply = null;
  supply.pendingReplace = null;
  desk.scramCoverOpen = false;
  desk.abandonPulled = { L: false, R: false };
  desk.abandonCoverOpen = false;
  ending.hide();
  title.visible = false;
  started = true;
}

window.addEventListener('keydown', (e) => {
  if (!started || game.ending) {
    if (game.ending && e.key.toLowerCase() === 'r') restart();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'escape' && supply.pendingReplace) { supply.pendingReplace = null; shownSupply = null; return; }
  if (game.supplyQueue.length) return;
  const map: Record<string, () => void> = {
    q: () => setLever(game, game.lever - 1),
    a: () => setLever(game, game.lever + 1),
    w: () => setPump(game, game.pumpCmd + 0.05),
    s: () => setPump(game, game.pumpCmd - 0.05),
    e: () => setValve(game, game.valveTarget + 0.05),
    d: () => setValve(game, game.valveTarget - 0.05),
    x: () => desk.pressScram(),
    ' ': () => { paused = !paused; },
  };
  if (map[k]) { e.preventDefault(); map[k](); }
});

// 테스트·튜닝용: ?debug 로 열면 콘솔에서 시뮬레이션을 빨리 감을 수 있다
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, {
    __md: {
      get game() { return game; },
      forward(seconds: number) { for (let t = 0; t < seconds && !game.ending && !game.supplyQueue.length; t += DT) step(game, DT); },
    },
  });
}

app.ticker.add((ticker) => {
  const dt = Math.min(0.25, ticker.deltaMS / 1000);
  const now = performance.now();
  if (started && !paused && !game.ending && !game.supplyQueue.length) {
    acc += dt;
    while (acc >= DT) { step(game, DT); acc -= DT; }
  }
  // 보급 화면은 내용이 바뀔 때만 다시 그린다
  const key = game.supplyQueue[0] ? `${game.supplyQueue.length}:${supply.pendingReplace?.id ?? ''}` : null;
  if (key !== shownSupply) { supply.show(game); shownSupply = key; }
  if (game.ending && !endingShown) { ending.show(game); endingShown = true; }
  pauseBanner.visible = paused && !game.ending;
  wall.update(game, dt, now);
  desk.update(now);
  ending.update(dt);
});
