// 메인 화면: 배속, 지금 몇 년인지, 메모리, 해싱 실측
import { World } from './sim/world.js';
import { STEPS_PER_YEAR } from './sim/constants.js';
import { SkyRenderer, MemoryRenderer } from './render.js';

// 정밀 계산: 입자 하나하나를 2.8시간 스텝마다 계산 (빠른 배속이면 여러 스텝을 계산하고 화면은 한 번만 그림)
// 천문 시간: 비트가 뒤집히는 순간만 정확히 계산하고 그 사이는 건너뜀
const SPEEDS = [
  { label: '1주/초', yps: 7 / 365.25, astro: false },
  { label: '1달/초', yps: 1 / 12, astro: false },
  { label: '최대', yps: Infinity, astro: false },
  { label: '1천 년/초', yps: 1e3, astro: true },
  { label: '100만 년/초', yps: 1e6, astro: true },
  { label: '10억 년/초', yps: 1e9, astro: true },
  { label: '1조 년/초', yps: 1e12, astro: true },
];
const N_OPTIONS = [4, 6, 8, 10];
const BUDGET_MS = 28; // 한 화면 프레임에서 정밀 계산에 쓸 최대 시간

const $ = (id) => document.getElementById(id);
const state = { n: 6, speed: SPEEDS[0], paused: false, hashing: true };
const sky = new SkyRenderer($('sky'));
const memView = new MemoryRenderer($('mem'));
let world, stepAcc = 0;

function restart() {
  world = new World({ n: state.n, seed: (Math.random() * 2 ** 31) | 0, hashing: state.hashing });
  stepAcc = 0;
  state.paused = false;
  $('miracle').hidden = true;
  syncUI();
}

// ───────────── 지금 몇 년 ─────────────
function fmtYears(y) {
  if (y < 1) return `${Math.floor(y * 365.25)}일`;
  if (y < 1e4) return `${Math.floor(y).toLocaleString()}년 ${Math.floor((y % 1) * 365.25)}일`;
  if (y >= 1e16) { const e = Math.floor(Math.log10(y)); return `${(y / 10 ** e).toFixed(2)} × 10^${e}년`; }
  let rest = Math.floor(y);
  const parts = [];
  for (const [u, name] of [[1e12, '조'], [1e8, '억'], [1e4, '만']]) {
    if (parts.length === 2) break;
    if (rest >= u) { const q = Math.floor(rest / u); parts.push(q.toLocaleString() + name); rest -= q * u; }
    else if (parts.length) parts.push(null); // 두 번째 자리가 0이면 생략
  }
  const shown = parts.filter(Boolean);
  if (shown.length === 1 && parts.length < 2 && rest > 0) shown.push(rest.toLocaleString());
  const last = shown[shown.length - 1];
  return shown.join(' ') + (/[만억조]$/.test(last) ? ' 년' : '년');
}

// ───────────── 루프 ─────────────
let last = performance.now();
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(ts - last, 100) / 1000;
  last = ts;
  sky.resize();

  if (!state.paused) {
    let miracle = false;
    const sp = state.speed;
    if (sp.astro) {
      miracle = world.advance(sp.yps * dt);
    } else {
      let steps;
      if (sp.yps === Infinity) steps = Infinity;
      else { stepAcc += sp.yps * dt * STEPS_PER_YEAR; steps = Math.floor(stepAcc); stepAcc -= steps; }
      const t0 = performance.now();
      for (let s = 0; s < steps; s++) {
        if (world.step()) { miracle = true; break; }
        if (performance.now() - t0 > BUDGET_MS) { stepAcc = 0; break; } // 못 따라가면 밀린 만큼은 버린다 (계산 자체는 정확)
      }
    }
    if (miracle) onMiracle();
  }

  sky.draw(world, state.speed.astro);
  memView.draw(world.memory);
  $('clock').textContent = fmtYears(world.years);
}

function onMiracle() {
  state.paused = true;
  syncUI();
  $('miracleSub').textContent = `${fmtYears(world.miracleYear)}째, 메모리가 저절로 정렬됐다 [${Array.from(world.memory.a).join(', ')}]`;
  $('miracle').hidden = false;
}

// ───────────── 컨트롤 ─────────────
function syncUI() {
  $('play').textContent = state.paused ? '▶' : '❚❚';
  $('play').setAttribute('aria-label', state.paused ? '재생' : '일시정지');
  for (const b of document.querySelectorAll('.group-btns button')) b.classList.toggle('on', SPEEDS[+b.dataset.i] === state.speed);
  for (const b of $('nChips').children) b.classList.toggle('on', +b.dataset.n === state.n);
  $('useHash').checked = state.hashing;
}

SPEEDS.forEach((sp, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = sp.label;
  b.dataset.i = i;
  b.addEventListener('click', () => {
    if (state.speed.astro && !sp.astro) world.enterPrecise();
    state.speed = sp;
    stepAcc = 0;
    state.paused = false;
    $('miracle').hidden = true;
    syncUI();
  });
  (sp.astro ? $('astroBtns') : $('preciseBtns')).appendChild(b);
});
for (const n of N_OPTIONS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = `${n}바이트`;
  b.dataset.n = n;
  b.addEventListener('click', () => { state.n = n; restart(); });
  $('nChips').appendChild(b);
}
$('play').addEventListener('click', () => { state.paused = !state.paused; $('miracle').hidden = true; syncUI(); });
$('restart').addEventListener('click', restart);
$('mRestart').addEventListener('click', restart);
$('mContinue').addEventListener('click', () => { state.paused = false; $('miracle').hidden = true; syncUI(); });
$('useHash').addEventListener('change', (e) => { state.hashing = e.target.checked; world.hashing = state.hashing; });

// 카메라: 휠 확대, 드래그 이동, 더블클릭 원위치
const skyEl = $('sky');
skyEl.addEventListener('wheel', (e) => { e.preventDefault(); sky.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
let drag = null;
skyEl.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; skyEl.setPointerCapture(e.pointerId); skyEl.classList.add('dragging'); });
skyEl.addEventListener('pointermove', (e) => { if (drag) { sky.panBy(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY }; } });
const endDrag = () => { drag = null; skyEl.classList.remove('dragging'); };
skyEl.addEventListener('pointerup', endDrag);
skyEl.addEventListener('pointercancel', endDrag);
skyEl.addEventListener('dblclick', () => sky.resetView());

// ───────────── 해싱 실측 ─────────────
// 2.5초마다 지금 화면의 입자·소행성 스냅샷을 워커로 보내, 같은 데이터로 두 방식의 충돌 판정 시간을 잰다.
const measurer = new Worker(new URL('./measure-worker.js', import.meta.url), { type: 'module' });
let measuring = false;
const recent = [];
const fmtMs = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3)) + ' ms';
measurer.onmessage = ({ data }) => {
  measuring = false;
  recent.push(data);
  if (recent.length > 3) recent.shift();
  const med = (k) => recent.map((r) => r[k]).sort((a, b) => a - b)[recent.length >> 1];
  const h = med('hashMs'), b = med('bruteMs');
  $('tHash').textContent = fmtMs(h);
  $('tBrute').textContent = fmtMs(b);
  $('tX').textContent = `${Math.round(b / h).toLocaleString()}배 빠름`;
};
setInterval(() => {
  if (measuring || document.hidden) return;
  const P = world.particles, B = world.belt;
  measuring = true;
  measurer.postMessage({
    P: { count: P.count, x: P.x.slice(0, P.count), y: P.y.slice(0, P.count), vx: P.vx.slice(0, P.count), vy: P.vy.slice(0, P.count) },
    B: { n: B.n, px: B.px.slice(), py: B.py.slice(), x: B.x.slice(), y: B.y.slice(), rad2: B.rad2.slice() },
  });
}, 2500);

restart();
requestAnimationFrame((ts) => { last = ts; frame(ts); });
