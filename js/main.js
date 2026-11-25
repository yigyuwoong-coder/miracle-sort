// 메인 화면: 배속, 지금 몇 년인지, 메모리, 해싱 실측, 결과 공유, 개발자 후원
import { World } from './sim/world.js';
import { STEPS_PER_YEAR } from './sim/constants.js';
import { SkyRenderer, MemoryRenderer } from './render.js';
import { fmtYears } from './format.js';
import { drawCard, cardBlob, shareText, tierOf } from './share.js';

// 정밀 계산: 입자 하나하나를 2.8시간 스텝마다 계산 (빠른 배속이면 여러 스텝을 계산하고 화면은 한 번만 그림)
// 천문 시간: 비트가 뒤집히는 순간만 정확히 계산하고 그 사이는 건너뜀
// locked: 후원으로 해금 (누르면 개발자 후원 창)
const SPEEDS = [
  { label: '1주/초', yps: 7 / 365.25, astro: false },
  { label: '1달/초', yps: 1 / 12, astro: false },
  { label: '최대', yps: Infinity, astro: false },
  { label: '1천 년/초', yps: 1e3, astro: true },
  { label: '100만 년/초', yps: 1e6, astro: true },
  { label: '10억 년/초', yps: 1e9, astro: true },
  { label: '1조 년/초', yps: 1e12, astro: true },
  { label: '1경 년/초', astro: true, locked: true },
  { label: '1해 년/초', astro: true, locked: true },
];
const BYTES = [2, 3, 4, 6, 8, 10, 12, 16, 24, 32, 64, 128, 256]; // 16 ~ 2048비트
const BUDGET_MS = 28; // 한 화면 프레임에서 정밀 계산에 쓸 최대 시간

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const startBytes = BYTES.includes(+q.get('bits') / 8) ? +q.get('bits') / 8 : 6; // 공유 링크 ?bits=64
const state = { n: startBytes, speed: SPEEDS[0], paused: false, hashing: true };
const sky = new SkyRenderer($('sky'));
const memView = new MemoryRenderer($('mem'));
let world, stepAcc = 0, lastMiracle = null;

function restart() {
  world = new World({ n: state.n, seed: (Math.random() * 2 ** 31) | 0, hashing: state.hashing });
  stepAcc = 0;
  lastMiracle = null;
  state.paused = false;
  $('miracle').hidden = true;
  $('memBits').textContent = `${state.n * 8}비트`;
  syncUI();
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
  lastMiracle = { years: world.miracleYear, values: Array.from(world.memory.a) };
  state.paused = true;
  syncUI();
  $('miracleSub').textContent = `${state.n * 8}비트 메모리가 ${fmtYears(world.miracleYear)}째에 저절로 정렬됐다`;
  $('miracle').hidden = false;
}

// ───────────── 컨트롤 ─────────────
function syncUI() {
  $('play').textContent = state.paused ? '▶' : '❚❚';
  $('play').setAttribute('aria-label', state.paused ? '재생' : '일시정지');
  for (const b of document.querySelectorAll('.group-btns button')) b.classList.toggle('on', SPEEDS[+b.dataset.i] === state.speed);
  for (const b of $('nChips').children) b.classList.toggle('on', +b.dataset.n === state.n);
  $('useHash').checked = state.hashing;
  // 정렬에 성공(기적)하기 전에는 공유할 수 없다
  $('shareBtn').classList.toggle('locked', !lastMiracle);
  $('shareBtn').title = lastMiracle ? '결과 카드 공유' : '정렬에 성공하면 공유할 수 있다';
}

SPEEDS.forEach((sp, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = sp.locked ? `${sp.label} 🔒` : sp.label;
  b.dataset.i = i;
  if (sp.locked) b.classList.add('locked');
  b.addEventListener('click', () => {
    if (sp.locked) { openDonate(sp.label); return; }
    if (state.speed.astro && !sp.astro) world.enterPrecise();
    state.speed = sp;
    stepAcc = 0;
    state.paused = false;
    $('miracle').hidden = true;
    syncUI();
  });
  (sp.astro ? $('astroBtns') : $('preciseBtns')).appendChild(b);
});
for (const n of BYTES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = `${n * 8}비트`;
  b.dataset.n = n;
  b.title = `${n}바이트`;
  b.addEventListener('click', () => { state.n = n; restart(); });
  $('nChips').appendChild(b);
}
$('play').addEventListener('click', () => { state.paused = !state.paused; $('miracle').hidden = true; syncUI(); });
$('restart').addEventListener('click', restart);
$('mRestart').addEventListener('click', restart);
$('mContinue').addEventListener('click', () => { state.paused = false; $('miracle').hidden = true; syncUI(); });
$('mShare').addEventListener('click', openShare);
$('shareBtn').addEventListener('click', openShare);
$('donateBtn').addEventListener('click', () => openDonate());
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

// ───────────── 개발자 후원 ─────────────
function openDonate(label) {
  $('donateSub').textContent = label ? `"${label}" 배속은 후원으로 해금된다.` : '더 빠른 배속(1경 년/초, 1해 년/초)은 후원으로 해금된다.';
  $('donateDialog').showModal();
}

// ───────────── 결과 카드 공유 ─────────────
const preview = $('cardPreview');
const snapCanvas = document.createElement('canvas');
let card = null; // { data, file, text, url }
let previewRaf = 0;

const shareUrl = (bits) => `${location.origin}${location.pathname}?bits=${bits}`;

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

async function openShare() {
  if (!lastMiracle) { toast('아직 정렬되지 않았다. 기적이 일어나면 공유할 수 있다.'); return; }
  const bits = state.n * 8;
  const data = { bits, miracle: true, years: lastMiracle.years, values: lastMiracle.values };
  const url = shareUrl(bits);
  card = { data, url, text: shareText(data, url), file: null };
  $('shareNote').textContent = `${tierOf(bits).name} 등급 · 비트 수가 클수록 등급이 올라가고 카드가 더 화려해진다.`;
  $('shareDialog').showModal();
  // 미리보기: 반짝임이 움직인다
  const t0 = performance.now();
  const loop = (now) => {
    drawCard(preview, data, (now - t0) / 1000 + 0.8);
    if ($('shareDialog').open) previewRaf = requestAnimationFrame(loop);
  };
  cancelAnimationFrame(previewRaf);
  previewRaf = requestAnimationFrame(loop);
  // 공유용 PNG는 창을 열 때 미리 만들어 둔다 (공유 버튼을 누른 즉시 넘길 수 있게)
  drawCard(snapCanvas, data, 1.3);
  const blob = await cardBlob(snapCanvas);
  card.file = new File([blob], `miracle-sort-${bits}bit.png`, { type: 'image/png' });
}

function note(msg) { $('shareNote').textContent = msg; }

$('saveImg').addEventListener('click', () => {
  if (!card?.file) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(card.file);
  a.download = card.file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  note('이미지를 저장했다.');
});

$('shareNow').addEventListener('click', async () => {
  if (!card?.file) return;
  try {
    if (navigator.canShare?.({ files: [card.file] })) {
      await navigator.share({ files: [card.file], title: 'Miracle Sort', text: card.text });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: 'Miracle Sort', text: card.text });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return; // 사용자가 공유 창을 닫음
  }
  await copyText(card.text);
  note('이 브라우저는 바로 공유를 지원하지 않아 문구와 링크를 복사했다. 이미지는 "이미지 저장"으로 받아 함께 올려 주세요.');
});

$('copyLink').addEventListener('click', async () => {
  if (!card) return;
  await copyText(card.text);
  note('공유 문구와 링크를 복사했다.');
});

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

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
