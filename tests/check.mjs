// 정확성 검사: node tests/check.mjs
import { mulberry32 } from '../js/sim/rng.js';
import { World } from '../js/sim/world.js';
import { Memory, log10SortedProbability } from '../js/sim/memory.js';
import { SpatialHash, sweptHit, bruteHit } from '../js/sim/spatial-hash.js';
import { makeBelt } from '../js/sim/orbits.js';
import {
  HASH_CELL, BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX, WIND_VMAX, DT,
  SEU_PER_BIT_HOUR, STEPS_PER_YEAR, EARTH_HITS_PER_STEP, flipsPerYear, flipProbabilityPerHit,
} from '../js/sim/constants.js';

let failed = 0;
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗', msg); if (!cond) failed++; };

console.log('1) 이동 구간 충돌: 빠른 입자가 작은 소행성을 뚫고 지나가지 않는다');
{
  // 반지름 0.003 소행성을 한 스텝에 0.05만큼 지나가는 입자: 양 끝점은 밖이지만 경로가 관통
  const r2 = 0.003 ** 2;
  const endpointsOnly = 0.025 ** 2 < r2;
  ok(!endpointsOnly && sweptHit(-0.025, 0.001, 0.025, 0.001, 0, 0, 0, 0, r2), '끝점만 보면 놓치는 충돌을 이동 구간 판정은 잡는다');
  ok(!sweptHit(-0.025, 0.01, 0.025, 0.01, 0, 0, 0, 0, r2), '비껴가는 경로는 충돌이 아니다');
  ok(sweptHit(0.01, 0, 0.01, 0, 0, 0, 0.02, 0, r2), '천체가 움직여 와서 닿는 경우도 잡는다 (상대 운동)');
}

console.log('2) 공간 해싱 vs 전수 검사 — 무작위 이동 구간 20만 개');
{
  const B = makeBelt(4000, mulberry32(5), BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX);
  B.setEpoch(0); B.update(0, false); B.update(0.001, true); // 직전·현재 위치 모두 채운다
  const H = new SpatialHash(HASH_CELL);
  H.build(B.n, B.x, B.y);
  const rnd = mulberry32(6);
  let mismatch = 0, hits = 0;
  for (let t = 0; t < 200000; t++) {
    const r = 1.6 + rnd() * 1.1, a = rnd() * Math.PI * 2, v = WIND_VMAX * rnd(), d = rnd() * Math.PI * 2;
    const x0 = r * Math.cos(a), y0 = r * Math.sin(a), x1 = x0 + v * DT * Math.cos(d), y1 = y0 + v * DT * Math.sin(d);
    const h = H.hit(x0, y0, x1, y1, B) >= 0, b = bruteHit(x0, y0, x1, y1, B) >= 0;
    if (h) hits++;
    if (h !== b) mismatch++;
  }
  ok(mismatch === 0, `불일치 ${mismatch}회 (충돌 ${hits}회, 해시 테이블 ${H.size}칸, 부하율 ${(B.n / H.size).toFixed(2)})`);
}

console.log('3) 전체 시뮬레이션: 해싱 사용 vs 미사용이 같은 결과를 내는가 (300스텝)');
{
  const cfg = { n: 6, asteroids: 2000, seed: 77, pFlip: 0.5 }; // 플립이 충분히 생기도록 확률을 키움
  const A = new World({ ...cfg, hashing: false });
  const Bw = new World({ ...cfg, hashing: true });
  let mA = 0, mB = 0;
  for (let s = 0; s < 300; s++) { if (A.step()) mA++; if (Bw.step()) mB++; }
  const key = (W) => Array.from({ length: W.particles.count }, (_, i) => `${W.particles.x[i]},${W.particles.y[i]}`).sort().join('|');
  const same = A.earthHits === Bw.earthHits && A.memory.flips === Bw.memory.flips &&
    A.memory.a.every((v, i) => v === Bw.memory.a[i]) && mA === mB && key(A) === key(Bw);
  ok(same && A.memory.flips > 0, `지구 피격 ${A.earthHits}/${Bw.earthHits}, 비트 플립 ${A.memory.flips}/${Bw.memory.flips}, 입자 ${A.particles.count}/${Bw.particles.count}, 기적 ${mA}/${mB}`);
}

console.log('4) 정렬 판정: O(1) 갱신 vs 전체 다시 세기 — 비트 플립 2만 번');
for (const n of [1, 2, 6, 50]) {
  const M = new Memory(n, mulberry32(9));
  const rnd = mulberry32(10);
  let bad = 0;
  for (let t = 0; t < 20000; t++) { M.flip((rnd() * n) | 0, (rnd() * 8) | 0); if (M.descents !== M.countDescents()) bad++; }
  ok(bad === 0, `N=${n}: 불일치 ${bad}회`);
}

console.log('5) 정렬 확률 공식 C(N+255, N) / 256^N');
{
  const exact = (257 * 256) / 2 / 65536;
  ok(Math.abs(10 ** log10SortedProbability(2) - exact) < 1e-12, `N=2: ${exact.toFixed(6)} (손 계산과 일치)`);
  const rnd = mulberry32(3);
  let hit = 0;
  const T = 400000;
  for (let t = 0; t < T; t++) { let p = -1, s = true; for (let i = 0; i < 4; i++) { const v = (rnd() * 256) | 0; if (v < p) s = false; p = v; } if (s) hit++; }
  const p4 = 10 ** log10SortedProbability(4);
  ok(Math.abs(hit / T - p4) / p4 < 0.05, `N=4: 공식 ${p4.toFixed(5)} vs 몬테카를로 ${(hit / T).toFixed(5)}`);
}

console.log('6) 비트 플립 확률 보정 (현실 소프트 에러율)');
{
  const yr = flipsPerYear(6);
  ok(Math.abs(yr - SEU_PER_BIT_HOUR * 48 * 8766) < 1e-24, `6바이트: 1년 기대 플립 ${yr.toExponential(2)}회 → 평균 ${(1 / yr / 1e4).toFixed(0)}만 년에 한 번`);
  const back = flipProbabilityPerHit(6) * EARTH_HITS_PER_STEP * STEPS_PER_YEAR;
  ok(Math.abs(back - yr) / yr < 1e-12, `피격당 확률 ${flipProbabilityPerHit(6).toExponential(2)} × 연간 피격 ${(EARTH_HITS_PER_STEP * STEPS_PER_YEAR).toFixed(0)}회 = 연간 기대 플립`);
}

console.log('7) 천문 시간 (사건 기반): 비트 플립 수가 포아송 분포와 맞는가');
{
  const W = new World({ n: 6, seed: 3 });
  const years = 5e9;
  W.advance(years, 1e9);
  // 기적이 나면 멈추므로, 멈춘 시각까지의 플립 수로 비교
  const mean = W.flipRate * W.years, sd = Math.sqrt(mean);
  ok(Math.abs(W.memory.flips - mean) < 4 * sd,
    `${(W.years / 1e8).toFixed(2)}억 년 동안 플립 ${W.memory.flips}회 (기대 ${mean.toFixed(0)} ± ${sd.toFixed(0)})${W.miracleYear ? ' · 기적에서 멈춤' : ''}`);
}

console.log('8) 천문 시간에서 기적: 정확한 시각에 멈추고 배열이 실제로 정렬돼 있다');
{
  const years = [];
  for (let seed = 1; seed <= 200; seed++) {
    const W = new World({ n: 4, seed, asteroids: 0 });
    while (!W.advance(1e10, 1e9));
    const a = Array.from(W.memory.a);
    if (!a.every((v, i) => i === 0 || a[i - 1] <= v) || W.years !== W.miracleYear) { failed++; console.log('  ✗ seed', seed); }
    years.push(W.miracleYear);
  }
  const avg = years.reduce((s, v) => s + v) / years.length;
  // 독립 확인: 배열 비트를 직접 하나씩 뒤집어 처음 정렬될 때까지의 평균 플립 수 (몬테카를로)
  const r = mulberry32(404);
  const isSorted = (a) => { for (let i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false; return true; };
  let sum = 0;
  const T = 20000;
  for (let t = 0; t < T; t++) {
    const a = new Uint8Array(4);
    do { for (let i = 0; i < 4; i++) a[i] = (r() * 256) | 0; } while (isSorted(a));
    let k = 0;
    do { a[(r() * 4) | 0] ^= 1 << ((r() * 8) | 0); k++; } while (!isSorted(a));
    sum += k;
  }
  const expectYears = sum / T / flipsPerYear(4);
  ok(Math.abs(avg - expectYears) / expectYears < 0.25,
    `N=4, 200번: 기적까지 평균 ${(avg / 1e8).toFixed(2)}억 년 · 독립 계산 ${(sum / T).toFixed(0)}회 플립 = ${(expectYears / 1e8).toFixed(2)}억 년`);
}

console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
process.exit(failed ? 1 : 0);
