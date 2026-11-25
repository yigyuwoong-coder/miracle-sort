// 정확성 검사: node tests/check.mjs
import { mulberry32 } from '../js/sim/rng.js';
import { World, lgAdd } from '../js/sim/world.js';
import { Memory, log10SortedProbability } from '../js/sim/memory.js';
import { SpatialHash, sweptHit, bruteHit } from '../js/sim/spatial-hash.js';
import { makeBelt } from '../js/sim/orbits.js';
import { FlipProcess, replayMiracle, EXACT_CAP } from '../js/sim/flips.js';
import { makeCode, parseCode, certHash } from '../js/cert.js';
import { HASH_CELL, BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX, WIND_VMAX, DT, SEU_PER_BIT_HOUR, flipsPerYear } from '../js/sim/constants.js';

let failed = 0;
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗', msg); if (!cond) failed++; };
const isSorted = (a) => { for (let i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false; return true; };

console.log('1) 이동 구간 충돌: 빠른 입자가 작은 소행성을 뚫고 지나가지 않는다');
{
  const r2 = 0.003 ** 2;
  ok(sweptHit(-0.025, 0.001, 0.025, 0.001, 0, 0, 0, 0, r2), '끝점만 보면 놓치는 충돌을 이동 구간 판정은 잡는다');
  ok(!sweptHit(-0.025, 0.01, 0.025, 0.01, 0, 0, 0, 0, r2), '비껴가는 경로는 충돌이 아니다');
  ok(sweptHit(0.01, 0, 0.01, 0, 0, 0, 0.02, 0, r2), '천체가 움직여 와서 닿는 경우도 잡는다 (상대 운동)');
}

console.log('2) 공간 해싱 vs 전수 검사 — 무작위 이동 구간 20만 개');
{
  const B = makeBelt(4000, mulberry32(5), BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX);
  B.setEpoch(0); B.update(0, false); B.update(0.001, true);
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
  const A = new World({ n: 6, asteroids: 2000, seed: 77, hashing: false });
  const Bw = new World({ n: 6, asteroids: 2000, seed: 77, hashing: true });
  for (let s = 0; s < 300; s++) { A.step(); Bw.step(); }
  const key = (W) => Array.from({ length: W.particles.count }, (_, i) => `${W.particles.x[i]},${W.particles.y[i]}`).sort().join('|');
  ok(A.earthHits === Bw.earthHits && key(A) === key(Bw), `지구 피격 ${A.earthHits}/${Bw.earthHits}, 입자 ${A.particles.count}/${Bw.particles.count}, 위치 집합 동일`);
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

console.log('6) 비트 플립 빈도 (현실 소프트 에러율)');
{
  const yr = flipsPerYear(6);
  ok(Math.abs(yr - SEU_PER_BIT_HOUR * 48 * 8766) < 1e-24, `6바이트: 1년 기대 플립 ${yr.toExponential(2)}회 → 평균 ${(1 / yr / 1e4).toFixed(0)}만 년에 한 번`);
  const P = new FlipProcess(64, 7); // 512비트: 이 정도 플립 안에서는 기적이 나지 않는다
  const years = 1e5 / P.rate;
  const info = P.advance(Math.log10(years));
  const mean = P.rate * years, sd = Math.sqrt(mean);
  ok(!info && Math.abs(P.total - mean) < 4 * sd, `${years.toExponential(2)}년 동안 플립 ${P.total}회 (포아송 기대 ${mean.toFixed(0)} ± ${sd.toFixed(0)})`);
}

console.log('7) 기적까지 평균 시간: 독립 몬테카를로와 비교 (N=4, 정확 계산 구간)');
{
  let sum = 0;
  const K = 400;
  for (let s = 1; s <= K; s++) sum += 10 ** replayMiracle(4, s, 1).lg;
  const r = mulberry32(404);
  let flips = 0;
  const T = 20000;
  for (let t = 0; t < T; t++) {
    const a = new Uint8Array(4);
    do { for (let i = 0; i < 4; i++) a[i] = (r() * 256) | 0; } while (isSorted(a));
    let k = 0;
    do { a[(r() * 4) | 0] ^= 1 << ((r() * 8) | 0); k++; } while (!isSorted(a));
    flips += k;
  }
  const expect = flips / T / flipsPerYear(4);
  ok(Math.abs(sum / K / expect - 1) < 0.2, `평균 ${(sum / K / 1e8).toFixed(2)}억 년 · 독립 계산 ${(expect / 1e8).toFixed(2)}억 년`);
}

console.log('8) 재현성: 화면처럼 들쭉날쭉 나눠 진행해도 처음부터 다시 계산한 결과와 같다');
for (const [n, seed] of [[4, 31], [8, 32], [16, 33]]) {
  const P = new FlipProcess(n, seed);
  const rnd = mulberry32(seed);
  let info = null, calls = 0;
  while (!info) { info = P.advance(lgAdd(P.reachedLg, 1 + rnd() * (n >= 16 ? 30 : 6)), 1 + rnd() * 4); calls++; }
  const R = replayMiracle(n, seed, 1);
  ok(R.total === info.total && R.values.join() === info.values.join() && R.lg === info.lg && isSorted(R.values),
    `${n * 8}비트: ${calls}조각으로 나눠도 같은 기적 (10^${R.lg.toFixed(2)}년, 플립 ${R.total.toLocaleString()}회${R.approx ? ', 대충 계산' : ''})`);
}

console.log('9) 화면(World) 결과 = 인증 코드로 다시 계산한 결과');
{
  const W = new World({ n: 6, asteroids: 0, seed: 4242 });
  let info = null;
  for (let s = 0; s < 50 && !info; s++) W.step(); // 정밀 계산 조금
  while (!info) info = W.advanceLg(lgAdd(W.lgYears, 9 - Math.log10(60)), 5); // 10억 년/초 프레임들
  const R = replayMiracle(6, 4242, 1);
  ok(R.total === info.total && R.values.join() === info.values.join() && isSorted(W.memory.a),
    `48비트: 화면 기적 ${info.total}번째 플립 = 다시 계산 ${R.total}번째 플립`);
}

console.log('10) 인증 코드: 진짜는 통과, 고친 코드는 실패');
{
  const info = replayMiracle(8, 777, 1);
  const code = await makeCode(64, 777, info);
  const c = parseCode(code);
  const again = replayMiracle(c.bits / 8, c.seed, c.m);
  ok(c && (await certHash(c.bits, c.seed, again)) === c.h, `진짜 코드 ${code} → 다시 계산 결과와 일치`);
  const forged = code.replace(/-([0-9a-f]{8})$/, (m, h) => `-${((parseInt(h, 16) ^ 1) >>> 0).toString(16).padStart(8, '0')}`);
  const f = parseCode(forged);
  ok((await certHash(f.bits, f.seed, replayMiracle(f.bits / 8, f.seed, f.m))) !== f.h, `검증값을 고친 코드 ${forged} → 실패`);
  const otherSeed = await certHash(64, 778, replayMiracle(8, 778, 1));
  ok(otherSeed !== c.h, '다른 시드의 결과로는 같은 검증값이 나오지 않는다');
  ok(parseCode('2048-zzzz-1-xyz') === null && parseCode('99-1a-1-00000000') === null, '형식이 틀린 코드는 거부');
}

console.log('11) 10^290년을 넘는 시간 (로그 시간) + 대충 계산 구간');
{
  const W = new World({ n: 256, asteroids: 0, seed: 21 }); // 2048비트, 평균 대기 약 10^469년
  let info = null, frames = 0;
  while (!info && frames < 5000) { info = W.advanceLg(lgAdd(W.lgYears, 500 - Math.log10(60)), 50); frames++; }
  ok(info && info.approx && W.bigLg > 290 && isSorted(W.memory.a), `2048비트, 10^500년/초: ${frames}프레임에 10^${info.lg.toFixed(1)}년째 기적 (먼저 플립 ${EXACT_CAP.toExponential(0)}회를 정확히 센 뒤 대충 계산)`);
}

console.log('12) 해금 코드 단계');
{
  const { readFileSync, existsSync } = await import('node:fs');
  const file = new URL('./codes.local.json', import.meta.url);
  if (!existsSync(file)) {
    console.log('  - 건너뜀 (tests/codes.local.json 없음 — 코드 원문은 공개 저장소에 올리지 않는다)');
  } else {
    const { toKeys, stageFromSuffix, stageAnywhere } = await import('../js/unlock.js');
    const P = JSON.parse(readFileSync(file, 'utf8'));
    const got = [];
    for (const p of P) got.push(await stageFromSuffix(toKeys(p)));
    const typedAll = await stageAnywhere(toKeys(`아무말 ${P[P.length - 1]} ㅋㅋ`));
    const none = await stageAnywhere(toKeys('전혀 다른 문장'));
    ok(got.join(',') === '1,2,3,4' && typedAll === 4 && none === 0, `단계: ${got.join(', ')} · 문장 속 코드 → ${typedAll}단계 · 다른 문장 → ${none}단계`);
  }
}

console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
process.exit(failed ? 1 : 0);
