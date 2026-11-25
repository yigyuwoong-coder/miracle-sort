// 메인 화면: 배속, 지금 몇 년인지, 메모리, 해싱 실측, 결과 공유(정품 인증), 진위 확인, 개발자 후원
import { World, lgAdd } from './sim/world.js';
import { STEPS_PER_YEAR } from './sim/constants.js';
import { SkyRenderer, MemoryRenderer } from './render.js';
import { fmtYearsLg } from './format.js';
import { drawCard, cardBlob, shareText, tierOf } from './share.js';
import { toKeys, stageFromSuffix, stageAnywhere, MAX_CODE_LEN } from './unlock.js';
import { makeCode, parseCode, VALID_BITS } from './cert.js';

// 정밀 계산: 입자 하나하나를 2.8시간 스텝마다 계산 (빠른 배속이면 여러 스텝을 계산하고 화면은 한 번만 그림)
// 천문 시간·해금 배속: 비트가 뒤집히는 순간만 처리한다. 비트 플립은 시드로 정해진 과정이라 배속과 상관없이 결과가 같다.
// stage = 필요한 해금 단계, lg = 1초에 흐르는 햇수의 log10
const SPEEDS = [
  { label: '1주/초', yps: 7 / 365.25, astro: false },
  { label: '1달/초', yps: 1 / 12, astro: false },
  { label: '최대', yps: Infinity, astro: false },
  { label: '1천 년/초', lg: 3, astro: true },
  { label: '100만 년/초', lg: 6, astro: true },
  { label: '10억 년/초', lg: 9, astro: true },
  { label: '1조 년/초', lg: 12, astro: true },
  { label: '1항하사 년/초', lg: 52, astro: true, stage: 1 },
  { label: '1무량대수 년/초', lg: 68, astro: true, stage: 1 },
  { label: '1구골 년/초', lg: 100, astro: true, stage: 2 },
  { label: '1센틸리언 년/초', lg: 303, astro: true, stage: 3 },
  { label: '1구골⁵ 년/초', lg: 500, astro: true, stage: 4 },
];
const BYTES = VALID_BITS.map((b) => b / 8); // 16 ~ 2048비트
const BUDGET_MS = 28; // 한 화면 프레임에서 계산에 쓸 최대 시간

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const startBytes = BYTES.includes(+q.get('bits') / 8) ? +q.get('bits') / 8 : 6;
let stage = 0; // 해금 단계 (0~4)
try {
  stage = +localStorage.getItem('miracle-sort-stage') || (localStorage.getItem('miracle-sort-unlocked') === '1' ? 4 : 0);
} catch { /* 저장소를 못 쓰면 매번 잠김 */ }
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

// 대충 계산 구간(플립을 하나씩 세지 않는 구간)에서는 메모리 화면만 무작위로 흔들어 보여 준다 (실제 상태는 그대로)
const scramble = { a: null, n: 0, descents: 1, flips: 0, lastIdx: -1, t: 0 };
function viewMemory() {
  if (!world.flips.approximating || state.paused) return world.memory;
  const now = performance.now();
  if (scramble.n !== world.n || now - scramble.t > 120) {
    scramble.n = world.n;
    scramble.a = Uint8Array.from({ length: world.n }, () => (Math.random() * 256) | 0);
    scramble.descents = 1;
    scramble.flips++;
    scramble.t = now;
  }
  return scramble;
}

// ───────────── 루프 ─────────────
let last = performance.now();
let lastWall = Date.now(); // 실제 시계 (화면이 꺼져 있던 시간을 재는 데 쓴다)
let achievedYps = 0; // 정밀 계산 "최대"에서 실제로 1초에 흐른 햇수 (따라잡기용)
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(ts - last, 100) / 1000;
  last = ts;
  sky.resize();

  // 화면이 꺼지거나 탭이 가려지면 브라우저가 페이지를 멈춘다. 돌아왔을 때 멈춰 있던 만큼 한 번에 따라잡는다.
  const wall = Date.now();
  const gap = (wall - lastWall) / 1000;
  lastWall = wall;
  if (gap > 2 && !state.paused) catchUp(gap - dt);

  if (!state.paused && dt > 0) {
    let info = null;
    const sp = state.speed;
    const y0 = world.years;
    if (sp.astro) {
      info = world.advanceLg(lgAdd(world.lgYears, sp.lg + Math.log10(dt)), BUDGET_MS);
    } else {
      let steps;
      if (sp.yps === Infinity) steps = Infinity;
      else { stepAcc += sp.yps * dt * STEPS_PER_YEAR; steps = Math.floor(stepAcc); stepAcc -= steps; }
      const t0 = performance.now();
      for (let s = 0; s < steps; s++) {
        if ((info = world.step())) break;
        if (performance.now() - t0 > BUDGET_MS) { stepAcc = 0; break; } // 못 따라가면 밀린 만큼은 버린다 (계산 자체는 정확)
      }
      if (sp.yps === Infinity) achievedYps += ((world.years - y0) / dt - achievedYps) * 0.1;
    }
    if (info) onMiracle(info);
  }

  sky.draw(world, state.speed.astro);
  memView.draw(viewMemory());
  $('clock').textContent = fmtYearsLg(world.lgYears);
}

// 멈춰 있던 sec초 동안의 우주 시간을 계산한다 (그동안은 입자 대신 비트 플립 사건만)
function catchUp(sec) {
  const sp = state.speed;
  const lgDelta = sp.astro ? sp.lg + Math.log10(sec) : Math.log10((sp.yps === Infinity ? achievedYps : sp.yps) * sec);
  if (!(lgDelta > -Infinity)) return;
  const target = lgAdd(world.lgYears, lgDelta);
  const deadline = performance.now() + 1500;
  let info = null;
  while (!info && world.lgYears < target && performance.now() < deadline) info = world.advanceLg(target, 200);
  lastWall = Date.now(); // 따라잡는 데 쓴 시간은 빼고
  const mins = sec >= 120 ? `${Math.round(sec / 60)}분` : `${Math.round(sec)}초`;
  toast(info ? `화면이 꺼져 있던 ${mins} 사이에 기적이 일어났다!` : `화면이 꺼져 있던 ${mins} 동안 ${fmtYearsLg(lgDelta)}이 흘렀다`);
  if (info) onMiracle(info);
}

async function onMiracle(info) {
  state.paused = true;
  const bits = state.n * 8, seed = world.seed, w = world;
  $('miracleSub').textContent = `${bits}비트 메모리가 ${fmtYearsLg(info.lg)}째에 저절로 정렬됐다`;
  $('miracle').hidden = false;
  lastMiracle = null;
  syncUI();
  const code = await makeCode(bits, seed, info); // 정품 인증 코드
  if (w !== world) return; // 그사이 새로 시작함
  lastMiracle = { ...info, bits, code };
  syncUI();
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
  b.dataset.i = i;
  b.addEventListener('click', () => {
    if (sp.stage > stage) { openDonate(sp); return; }
    state.speed = sp;
    stepAcc = 0;
    state.paused = false;
    $('miracle').hidden = true;
    syncUI();
  });
  (sp.stage ? $('unlockBtns') : sp.astro ? $('astroBtns') : $('preciseBtns')).appendChild(b);
});
function labelSpeeds() {
  for (const b of document.querySelectorAll('.group-btns button')) {
    const sp = SPEEDS[+b.dataset.i];
    const locked = sp.stage > stage;
    b.textContent = sp.stage ? `${sp.label} ${locked ? '🔒' : '⚡'}` : sp.label;
    b.classList.toggle('locked', locked);
    b.classList.toggle('limit', !!sp.stage && !locked);
  }
}
labelSpeeds();
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
$('verifyBtn').addEventListener('click', () => openVerify());
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
function openDonate(sp) {
  $('donateSub').textContent = sp
    ? `"${sp.label}"는 후원으로 해금된다.`
    : stage >= 4 ? '모든 배속이 해금돼 있다. 응원해 주실 분은 아래로!' : '더 빠른 배속은 후원으로 해금된다.';
  $('unlockCode').value = '';
  $('unlockMsg').textContent = '';
  $('donateDialog').showModal();
}

// ───────────── 해금 코드 (4단계) ─────────────
function unlockTo(next) {
  if (next <= stage) return;
  const opened = SPEEDS.filter((sp) => sp.stage > stage && sp.stage <= next).map((sp) => sp.label);
  stage = next;
  try { localStorage.setItem('miracle-sort-stage', String(stage)); } catch { /* 이번 방문 동안만 해금 */ }
  labelSpeeds();
  if ($('donateDialog').open) $('donateDialog').close();
  toast(`⚡ 해금 ${stage}단계! ${opened.join(', ')}`);
}
let typed = '';
document.addEventListener('keydown', (e) => {
  if (stage >= 4 || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  const m = /^Key([A-Z])$/.exec(e.code);
  if (!m) return;
  typed = (typed + m[1].toLowerCase()).slice(-MAX_CODE_LEN);
  stageFromSuffix(typed).then(unlockTo);
});
$('unlockCode').addEventListener('input', async (e) => {
  const keys = toKeys(e.target.value);
  const got = await stageAnywhere(keys);
  if (got > stage) unlockTo(got);
  else $('unlockMsg').textContent = got ? '이미 해금된 단계다.' : keys.length >= 8 ? '코드가 맞지 않다.' : '';
});

// ───────────── 결과 카드 공유 ─────────────
const preview = $('cardPreview');
const snapCanvas = document.createElement('canvas');
let card = null; // { data, file, text, url }
let previewRaf = 0;
const certUrl = (code) => `${location.origin}${location.pathname}?cert=${code}`;

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// 카드 미리보기(반짝임이 움직인다)와 공유용 PNG
async function showCard(canvasEl, dialog, data) {
  const t0 = performance.now();
  const loop = (now) => {
    drawCard(canvasEl, data, (now - t0) / 1000 + 0.8);
    if (dialog.open) previewRaf = requestAnimationFrame(loop);
  };
  cancelAnimationFrame(previewRaf);
  previewRaf = requestAnimationFrame(loop);
  drawCard(snapCanvas, data, 1.3);
  const blob = await cardBlob(snapCanvas);
  return new File([blob], `miracle-sort-${data.bits}bit-${data.code}.png`, { type: 'image/png' });
}

async function openShare() {
  if (!lastMiracle) { toast('아직 정렬되지 않았다. 기적이 일어나면 공유할 수 있다.'); return; }
  const { bits, lg, values, code } = lastMiracle;
  const data = { bits, lg, values, code };
  const url = certUrl(code);
  card = { data, url, text: shareText(data, url), file: null };
  $('shareNote').textContent = `${tierOf(bits).name} 등급 · 인증 코드 ${code}`;
  $('shareDialog').showModal();
  card.file = await showCard(preview, $('shareDialog'), data);
}

function note(msg) { $('shareNote').textContent = msg; }
function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('saveImg').addEventListener('click', () => { if (card?.file) { download(card.file); note('이미지를 저장했다.'); } });
$('shareNow').addEventListener('click', async () => {
  if (!card?.file) return;
  try {
    if (navigator.canShare?.({ files: [card.file] })) { await navigator.share({ files: [card.file], title: 'Miracle Sort', text: card.text }); return; }
    if (navigator.share) { await navigator.share({ title: 'Miracle Sort', text: card.text, url: card.url }); return; }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  await copyText(card.text);
  note('이 브라우저는 바로 공유를 지원하지 않아 문구와 확인 링크를 복사했다. 이미지는 "이미지 저장"으로 받아 함께 올려 주세요.');
});
$('copyLink').addEventListener('click', async () => { if (card) { await copyText(card.text); note('공유 문구와 확인 링크를 복사했다.'); } });

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

// ───────────── 진위 확인 ─────────────
// 인증 코드의 비트 수·시드로 처음부터 다시 계산해서, 코드의 검증값과 결과가 맞는지 본다.
let certWorker = null, verifyFile = null, verifyBits = 0;
function openVerify(code) {
  $('verifyInput').value = code ?? '';
  $('verifyResult').hidden = true;
  $('verifyStatus').textContent = code ? '' : '결과 카드에 적힌 인증 코드를 넣으면, 처음부터 다시 계산해서 진짜인지 확인한다.';
  $('verifyStatus').className = 'verify-status';
  $('verifyDialog').showModal();
  if (code) runVerify(code);
}
$('verifyForm').addEventListener('submit', (e) => { e.preventDefault(); runVerify($('verifyInput').value); });

function runVerify(raw) {
  const c = parseCode(raw);
  const status = $('verifyStatus');
  $('verifyResult').hidden = true;
  if (!c) { status.textContent = '✗ 인증 코드 형식이 올바르지 않다.'; status.className = 'verify-status bad'; return; }
  status.textContent = `${c.bits}비트 메모리를 처음부터 다시 계산하는 중… (몇 초 걸릴 수 있다)`;
  status.className = 'verify-status';
  certWorker?.terminate();
  certWorker = new Worker(new URL('./cert-worker.js', import.meta.url), { type: 'module' });
  certWorker.onmessage = async ({ data: { info, h } }) => {
    certWorker.terminate();
    certWorker = null;
    if (h !== c.h) {
      status.textContent = `✗ 인증 실패 — 이 코드와 일치하는 기적이 없다. 위조됐거나 코드가 잘못 옮겨졌다. (이 시드의 진짜 ${c.m}번째 기적은 ${fmtYearsLg(info.lg)}째)`;
      status.className = 'verify-status bad';
      return;
    }
    status.textContent = `✓ 정품 인증 — 처음부터 다시 계산한 결과와 일치한다. ${c.bits}비트 메모리가 ${fmtYearsLg(info.lg)} 만에 저절로 정렬된 진짜 기록이다.`;
    status.className = 'verify-status good';
    $('verifyResult').hidden = false;
    verifyBits = c.bits;
    const code = String(raw).trim().toLowerCase();
    verifyFile = await showCard($('verifyCanvas'), $('verifyDialog'), { bits: c.bits, lg: info.lg, values: info.values, code });
  };
  certWorker.postMessage({ bits: c.bits, seed: c.seed, m: c.m });
}
$('verifySave').addEventListener('click', () => { if (verifyFile) download(verifyFile); });
$('verifyTry').addEventListener('click', () => {
  $('verifyDialog').close();
  if (BYTES.includes(verifyBits / 8)) { state.n = verifyBits / 8; restart(); }
});

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
if (q.get('cert')) openVerify(q.get('cert')); // 공유 링크로 들어오면 바로 진위 확인
