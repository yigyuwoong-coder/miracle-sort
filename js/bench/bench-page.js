// 해싱 벤치마크 페이지: Worker에서 측정 → 결과가 올 때마다 차트·표 갱신
import { SIZES, METHODS, fmt, toMarkdown } from './bench-core.js';

// 검증된 범주형 팔레트(다크) 1·2번 슬롯. 전수 검사는 점선으로도 구분한다.
const COLORS = { brute: '#d95926', hash: '#3987e5' };
const SURFACE = '#111522';
const $ = (id) => document.getElementById(id);
const res = { collision: [], throughput: [] };
let worker = null, env = '';

const compact = (v) => (v >= 1e3 ? `${v / 1e3}k` : String(v));
const tip = $('tooltip');
function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${x + 14 + r.width > innerWidth ? x - r.width - 14 : x + 14}px`;
  tip.style.top = `${Math.min(innerHeight - r.height - 8, Math.max(8, y - r.height / 2))}px`;
}

function renderChart() {
  const W = 720, H = 300, L = 58, R = 170, T = 12, B = 40, pw = W - L - R, ph = H - T - B;
  const rows = res.collision;
  const vals = rows.map((r) => r.ms);
  if (!vals.length) return;
  const y0 = Math.floor(Math.log10(Math.min(...vals))), y1 = Math.max(y0 + 1, Math.ceil(Math.log10(Math.max(...vals))));
  const x0 = Math.log10(SIZES[0]), x1 = Math.log10(SIZES[SIZES.length - 1]);
  const X = (s) => L + ((Math.log10(s) - x0) / (x1 - x0)) * pw;
  const Y = (v) => T + ph - ((Math.log10(v) - y0) / (y1 - y0)) * ph;
  let svg = '<g class="grid">';
  for (let e = y0; e <= y1; e++) svg += `<line x1="${L}" x2="${L + pw}" y1="${Y(10 ** e)}" y2="${Y(10 ** e)}"/>`;
  svg += '</g>';
  for (let e = y0; e <= y1; e++) svg += `<text x="${L - 8}" y="${Y(10 ** e) + 4}" text-anchor="end">${fmt(10 ** e)}</text>`;
  for (const s of SIZES) svg += `<text x="${X(s)}" y="${T + ph + 18}" text-anchor="middle">${compact(s)}</text>`;
  svg += `<text x="${L + pw / 2}" y="${H - 4}" text-anchor="middle">소행성 수 M (로그 눈금)</text>`;
  svg += `<text x="14" y="${T + ph / 2}" text-anchor="middle" transform="rotate(-90 14 ${T + ph / 2})">ms (로그 눈금)</text>`;
  const labels = [];
  for (const m of METHODS) {
    const pts = SIZES.map((s) => rows.find((r) => r.method === m.id && r.size === s)).filter(Boolean);
    if (!pts.length) continue;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.size).toFixed(1)},${Y(p.ms).toFixed(1)}`).join('');
    svg += `<path d="${d}" fill="none" stroke="${COLORS[m.id]}" stroke-width="2" ${m.id === 'brute' ? 'stroke-dasharray="6 4"' : ''}/>`;
    for (const p of pts) svg += `<circle cx="${X(p.size)}" cy="${Y(p.ms)}" r="4" fill="${COLORS[m.id]}" stroke="${SURFACE}" stroke-width="2"/>`;
    const last = pts[pts.length - 1];
    labels.push({ x: X(last.size) + 9, y: Y(last.ms), t: m.id === 'brute' ? '해싱 없이' : '공간 해싱' });
  }
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
  for (const l of labels) svg += `<text class="series-label" x="${l.x}" y="${l.y + 4}">${l.t}</text>`;
  $('chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="충돌 판정 시간">${svg}
    <line class="cross" x1="0" x2="0" y1="${T}" y2="${T + ph}" visibility="hidden"/><rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;

  const el = $('chart').querySelector('svg'), cross = el.querySelector('.cross'), hit = el.querySelector('rect');
  const measured = SIZES.filter((s) => rows.some((r) => r.size === s));
  hit.addEventListener('mousemove', (ev) => {
    const box = el.getBoundingClientRect(), mx = ((ev.clientX - box.left) / box.width) * W;
    const best = measured.reduce((b, s) => (Math.abs(X(s) - mx) < Math.abs(X(b) - mx) ? s : b), measured[0]);
    cross.setAttribute('x1', X(best)); cross.setAttribute('x2', X(best)); cross.setAttribute('visibility', 'visible');
    const b = rows.find((r) => r.size === best && r.method === 'brute'), h = rows.find((r) => r.size === best && r.method === 'hash');
    let html = `<div class="h">소행성 ${best.toLocaleString()}개 · 입자 ${(best * 10).toLocaleString()}개</div>`;
    if (b) html += `<div class="r"><span><i style="background:${COLORS.brute}"></i>해싱 없이</span><b>${fmt(b.ms)} ms</b></div>`;
    if (h) html += `<div class="r"><span><i style="background:${COLORS.hash}"></i>공간 해싱</span><b>${fmt(h.ms)} ms</b></div>`;
    if (b && h) html += `<div class="r"><span>해싱으로</span><b style="color:#7be0a8">×${fmt(b.ms / h.ms)}</b></div>`;
    showTip(html, ev.clientX, ev.clientY);
  });
  hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
}

function renderTable() {
  const head = '<tr><th>소행성 M</th><th>입자 P</th><th>해싱 없이 (ms)</th><th>공간 해싱 (ms)</th><th>빨라진 배수</th></tr>';
  const body = SIZES.map((M) => {
    const b = res.collision.find((r) => r.size === M && r.method === 'brute'), h = res.collision.find((r) => r.size === M && r.method === 'hash');
    if (!b && !h) return '';
    return `<tr><td>${M.toLocaleString()}</td><td>${(M * 10).toLocaleString()}</td><td>${b ? fmt(b.ms) : '…'}</td><td>${h ? fmt(h.ms) : '…'}</td><td class="x">${b && h ? '×' + fmt(b.ms / h.ms) : ''}</td></tr>`;
  }).join('');
  $('table').innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function renderThroughput() {
  const b = res.throughput.find((r) => r.method === 'brute'), h = res.throughput.find((r) => r.method === 'hash');
  const item = (r, id, name) => r ? `<div class="tp-item"><div class="k"><i class="sw" style="background:${COLORS[id]}"></i>${name}</div>
    <div class="v">${fmt(r.daysPerSec)}일</div><div class="s">1스텝 ${fmt(r.ms)} ms</div></div>` : '';
  $('throughput').innerHTML = item(b, 'brute', '해싱 없이') + item(h, 'hash', '공간 해싱') +
    (b && h ? `<div class="tp-x">×${fmt(b.ms / h.ms)}<span>해싱으로 빨라진 배수</span></div>` : '');
  $('throughputCard').hidden = false;
}

function start() {
  res.collision = []; res.throughput = [];
  $('collisionCard').hidden = false;
  $('throughputCard').hidden = true;
  $('chart').innerHTML = ''; $('table').innerHTML = '';
  $('legend').innerHTML = METHODS.map((m) => `<span><i class="${m.id === 'brute' ? 'dash' : ''}" style="border-color:${COLORS[m.id]}"></i>${m.label}</span>`).join('');
  const ua = navigator.userAgent;
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '브라우저';
  env = `${br} · CPU 스레드 ${navigator.hardwareConcurrency ?? '?'} · ${new Date().toLocaleString('ko-KR')}`;
  worker?.terminate();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data: ev }) => {
    if (ev.type === 'done') { $('status').textContent = `완료 · ${env}`; stop(); return; }
    $('progressBar').style.width = `${(ev.done / ev.total) * 100}%`;
    $('status').textContent = `측정 중… ${ev.done}/${ev.total}`;
    if (ev.type === 'collision') { res.collision.push(ev); renderChart(); renderTable(); }
    else { res.throughput.push(ev); renderThroughput(); }
  };
  worker.postMessage({});
  $('runBtn').textContent = '중지';
  $('progressWrap').hidden = false;
  $('progressBar').style.width = '0';
  $('mdBtn').disabled = true;
}

function stop() {
  worker?.terminate();
  worker = null;
  $('runBtn').textContent = '측정 시작';
  $('mdBtn').disabled = !res.collision.length;
}

$('runBtn').addEventListener('click', () => (worker ? (stop(), ($('status').textContent = '중지됨')) : start()));
$('mdBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(toMarkdown(res, env)); $('mdBtn').textContent = '복사됨!'; }
  catch { $('mdBtn').textContent = '복사 실패'; }
  setTimeout(() => { $('mdBtn').textContent = '표 복사 (Markdown)'; }, 1600);
});
