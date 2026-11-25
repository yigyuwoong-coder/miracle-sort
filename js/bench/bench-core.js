// 해싱 벤치마크 코어 — DOM을 쓰지 않으므로 브라우저(Web Worker)와 Node 양쪽에서 똑같이 돈다.
//  - 같은 시드(42)로 만든 같은 입력에서 "해싱 없이(전수 검사)"와 "공간 해싱"을 비교한다.
//  - 빠른 연산은 한 샘플이 4ms 이상이 되도록 묶어서 재고(브라우저 타이머 해상도 ≈ 0.1ms), 중앙값을 쓴다.

import { mulberry32 } from '../sim/rng.js';
import { makeBelt } from '../sim/orbits.js';
import { SpatialHash, bruteHit } from '../sim/spatial-hash.js';
import { World } from '../sim/world.js';
import {
  HASH_CELL, BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX, WIND_VMIN, WIND_VMAX, DT, WORLD_R, YEARS_PER_STEP,
} from '../sim/constants.js';

export const SEED = 42;
export const SIZES = [250, 500, 1000, 2000, 4000, 8000]; // 소행성 수 M (입자는 10·M)
export const METHODS = [
  { id: 'brute', label: '해싱 없이 (전수 검사) O(P·M)' },
  { id: 'hash', label: '공간 해싱 O(P+M)' },
];

const median = (a) => { const s = [...a].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function measure(op, { minTime = 250, minReps = 5, maxReps = 40, slow = 900 } = {}) {
  let k = 1, t = 0;
  for (;;) {
    const t0 = performance.now();
    for (let i = 0; i < k; i++) op();
    t = performance.now() - t0;
    if (t >= 4 || k >= 1 << 20) break;
    k *= t < 0.5 ? 8 : 2;
  }
  if (t > slow) return t / k;
  const out = [];
  const start = performance.now();
  while ((out.length < minReps || performance.now() - start < minTime) && out.length < maxReps) {
    const t0 = performance.now();
    for (let i = 0; i < k; i++) op();
    out.push((performance.now() - t0) / k);
  }
  return median(out);
}

// 충돌 판정 1스텝: 입자 P = 10·M개의 이동 구간이 소행성 M개 중 하나와 닿는지 (해싱은 테이블 짓는 시간 포함)
export function benchCollision(M, method) {
  const B = makeBelt(M, mulberry32(SEED), BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX);
  B.setEpoch(0); B.update(0, false); B.update(1e-4, true);
  const rnd = mulberry32(SEED + 1);
  const P = 10 * M;
  const x0 = new Float64Array(P), y0 = new Float64Array(P), x1 = new Float64Array(P), y1 = new Float64Array(P);
  for (let i = 0; i < P; i++) { // 태양에서 바깥으로 날아가는 입자를 원판 안에 고르게
    const r = WORLD_R * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, v = WIND_VMIN + (WIND_VMAX - WIND_VMIN) * rnd();
    x0[i] = r * Math.cos(a); y0[i] = r * Math.sin(a);
    x1[i] = x0[i] + v * DT * Math.cos(a); y1[i] = y0[i] + v * DT * Math.sin(a);
  }
  const H = new SpatialHash(HASH_CELL);
  let hits = 0;
  const ms = measure(() => {
    hits = 0;
    if (method === 'hash') {
      H.build(M, B.x, B.y);
      for (let i = 0; i < P; i++) if (H.hit(x0[i], y0[i], x1[i], y1[i], B) >= 0) hits++;
    } else {
      for (let i = 0; i < P; i++) if (bruteHit(x0[i], y0[i], x1[i], y1[i], B) >= 0) hits++;
    }
  });
  return { ms, hits, particles: P };
}

// 정밀 계산 처리량: 실제 시뮬레이션(소행성 3,000개)을 돌려 1초에 몇 일을 계산할 수 있는가
export function benchThroughput(method) {
  const W = new World({ n: 6, asteroids: 3000, seed: SEED, hashing: method === 'hash' });
  const steps = method === 'hash' ? 1500 : 40;
  W.step();
  const t0 = performance.now();
  for (let s = 0; s < steps; s++) W.step();
  const ms = (performance.now() - t0) / steps;
  return { ms, daysPerSec: (1000 / ms) * YEARS_PER_STEP * 365.25, particles: W.particles.count };
}

export function* runAll({ sizes = SIZES } = {}) {
  const total = sizes.length * METHODS.length + METHODS.length;
  let done = 0;
  for (const M of sizes) {
    for (const m of METHODS) yield { type: 'collision', method: m.id, size: M, ...benchCollision(M, m.id), done: ++done, total };
  }
  for (const m of METHODS) yield { type: 'throughput', method: m.id, ...benchThroughput(m.id), done: ++done, total };
}

export const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toPrecision(2));

export function toMarkdown(res, env = '') {
  const out = [];
  if (env) out.push(`> 환경: ${env}\n`);
  out.push('### 충돌 판정 1스텝 (입자 P = 10·M) — 단위 ms\n');
  out.push(`| 소행성 M | 입자 P | ${METHODS.map((m) => m.label).join(' | ')} | 해싱으로 빨라진 배수 |`);
  out.push('|---:|---:|---:|---:|---:|');
  for (const M of [...new Set(res.collision.map((r) => r.size))]) {
    const [b, h] = METHODS.map((m) => res.collision.find((r) => r.size === M && r.method === m.id));
    if (!b || !h) continue;
    out.push(`| ${M.toLocaleString()} | ${b.particles.toLocaleString()} | ${fmt(b.ms)} | ${fmt(h.ms)} | ×${fmt(b.ms / h.ms)} |`);
  }
  const [tb, th] = METHODS.map((m) => res.throughput.find((r) => r.method === m.id));
  if (tb && th) {
    out.push('\n### 정밀 계산 처리량 (소행성 3,000개, 실제 시뮬레이션)\n');
    out.push('| 방식 | 1스텝 (ms) | 1초 동안 계산되는 우주 시간 |');
    out.push('|---|---:|---:|');
    for (const [m, r] of [[METHODS[0], tb], [METHODS[1], th]]) out.push(`| ${m.label} | ${fmt(r.ms)} | ${fmt(r.daysPerSec)}일 |`);
    out.push(`\n해싱으로 ×${fmt(tb.ms / th.ms)} 빨라졌다.`);
  }
  return out.join('\n') + '\n';
}
