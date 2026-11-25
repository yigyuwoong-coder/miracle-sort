// 우주: 태양풍 입자 → 행성·소행성과 충돌 → 지구에 닿으면 아주 드물게 메모리 비트 플립 → 정렬되면 기적
//
// 시간을 진행하는 두 가지 방법 (둘 다 정확한 계산이다)
//
//  ① 정밀 계산 step(): 2.8시간짜리 스텝마다 입자 하나하나의 이동과 충돌을 계산한다.
//     충돌 판정이 가장 무거운 부분이고, 여기에 공간 해싱을 쓴다.
//
//  ② 천문 시간 advance(): 수억~수조 년은 스텝으로 갈 수 없다 (100만 년 ≈ 30억 스텝).
//     지구 피격은 일정한 평균 빈도로 무작위로 일어나고 각 피격이 비트를 뒤집을 확률도 일정하므로,
//     비트 플립은 포아송 과정이다. 포아송 과정에서 다음 사건까지의 시간은 지수분포를 따르므로
//     그 시간을 뽑아 다음 비트 플립 순간으로 곧장 건너뛴다 (사건 기반 시뮬레이션).
//     근사가 아니라 같은 확률 과정을 정확히 따르며, 기적이 일어난 시각도 정확히 나온다.
//     행성·소행성은 케플러 궤도식으로 아무 시각의 위치든 바로 구한다.

import { mulberry32 } from './rng.js';
import { makePlanets, makeBelt } from './orbits.js';
import { Particles } from './particles.js';
import { SpatialHash, sweptHit, bruteHit } from './spatial-hash.js';
import { Memory, log10SortedProbability } from './memory.js';
import {
  DT, YEARS_PER_STEP, WORLD_R, BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX, WIND_VMIN,
  EMIT_PER_STEP, HASH_CELL, flipsPerYear, flipProbabilityPerHit,
} from './constants.js';

const HIT_LOG = 32;

// 무작위 상태에서 처음 정렬될 때까지의 평균 플립 수 × 정렬확률 (바이트 수별 몬테카를로 측정값)
const MIRACLE_C = { 2: 6.65, 3: 6.06, 4: 5.1, 6: 3.51, 8: 2.86, 10: 1.75 };

export class World {
  constructor({ n = 6, asteroids = 3000, seed = 1, hashing = true, pFlip = null } = {}) {
    this.seed = seed;
    this.rng = mulberry32(seed); // 우주 생성 + 입자 방출
    this.flipRng = mulberry32(seed ^ 0x9e3779b9); // 메모리 초기값 + 비트 플립
    this.planets = makePlanets();
    this.belt = makeBelt(asteroids, this.rng, BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX);
    this.particles = new Particles();
    this.hash = new SpatialHash(HASH_CELL);
    this.hashing = hashing;
    this.memory = new Memory(n, this.flipRng);
    this.pFlip = pFlip ?? flipProbabilityPerHit(n); // 지구 피격 1회당 비트 플립 확률
    this.flipRate = flipsPerYear(n); // 1년당 기대 비트 플립 수

    this.epoch = 0; // 기준 시각 (년)
    this.local = 0; // 기준 시각 이후 정밀 스텝 수
    this.nextFlip = null; // 천문 시간 모드: 다음 비트 플립 시각
    this.wasSorted = false;
    this.miracleYear = null;
    this.mixedSince = -Infinity; // 이 시각 이후로 메모리가 정상분포와 섞이는 중 (처음 상태는 무작위이므로 −∞)
    this.earthHits = 0;
    this.hitX = new Float64Array(HIT_LOG);
    this.hitY = new Float64Array(HIT_LOG);
    this.hitT = new Float64Array(HIT_LOG).fill(-1e9);
    this.hitHead = 0;
    this.collideMs = 0; // 충돌 판정에 쓴 시간 누적 (읽는 쪽이 0으로 리셋)

    this._placeBodies(false);
    this.prefill();
  }

  get years() { return this.epoch + this.local * YEARS_PER_STEP; }

  _placeBodies(keepPrev) {
    const dt = this.local * YEARS_PER_STEP;
    this.planets.update(dt, keepPrev);
    this.belt.update(dt, keepPrev);
  }

  _setEpoch(y) {
    this.epoch = y;
    this.local = 0;
    this.planets.setEpoch(y);
    this.belt.setEpoch(y);
    this._placeBodies(false);
  }

  // 시작하자마자 입자가 고르게 퍼져 있도록, 천체를 멈춘 채 입자만 미리 날려 둔다
  prefill() {
    const L = Math.ceil(WORLD_R / WIND_VMIN / DT);
    for (let s = 0; s < L; s++) this._moveParticles();
    this.earthHits = 0;
    this.hitT.fill(-1e9);
  }

  // ① 정밀 계산 1스텝. 기적이 일어나면 true
  step() {
    this.local++;
    this._placeBodies(true);
    const t0 = performance.now();
    const hits = this._moveParticles();
    this.collideMs += performance.now() - t0;
    for (let h = 0; h < hits; h++) {
      if (this.flipRng() >= this.pFlip) continue; // 대부분은 자기권·대기에 막히거나 메모리를 비껴간다
      if (this._flip()) return true;
    }
    return false;
  }

  // 비트 하나를 뒤집고, 이번에 처음 정렬됐으면 기적으로 기록
  _flip() {
    const m = this.memory, r = this.flipRng;
    const sorted = m.flip((r() * m.n) | 0, (r() * 8) | 0);
    const miracle = sorted && !this.wasSorted;
    this.wasSorted = sorted;
    if (miracle) { this.miracleYear = this.years; this.mixedSince = this.years; } // 정렬된 상태는 무작위가 아니다
    return miracle;
  }

  // ② 천문 시간: dy년 진행. 비트 플립 순간들만 정확히 계산한다. 기적이 일어나면 그 순간에 멈추고 true
  advance(dy, maxFlips = 1e6) {
    const rate = this.flipRate;
    const exp = () => -Math.log(1 - this.flipRng()) / rate; // 지수분포 (평균 1/rate 년)
    if (this.nextFlip === null) this.nextFlip = this.years + exp(); // 무기억성: 언제 다시 뽑아도 같은 분포
    const end = this.years + dy;
    let count = 0, miracle = false;
    let t = this.years;
    while (this.nextFlip <= end && count < maxFlips) {
      t = this.nextFlip;
      this.epoch = t; this.local = 0;
      count++;
      this.nextFlip = t + exp();
      if (this._flip()) { miracle = true; break; }
    }
    if (!miracle && count < maxFlips) t = end;
    this._setEpoch(t);
    return miracle;
  }

  // ③ 초고속 (예: 1항하사 = 10⁵²년/초): target 시각까지 간다.
  //
  //  1) 먼저 시간 예산(ms) 안에서 비트 플립을 하나도 빼먹지 않고 계산한다. 기적이 나면 그 순간에 멈춘다.
  //  2) 예산이 끝났는데 target까지 남았다면, 남은 구간을 "정렬될 수 없음이 증명될 때만" 건너뛴다.
  //     - 남은 구간에서 한 번이라도 정렬될 확률 ≤ (남은 구간 기대 플립 수) × (정렬 확률)  … 정상분포에서의 합집합 한계
  //       이 값이 10⁻¹⁷(배정밀도 실수의 오차)보다 작을 때만 건너뛴다.
  //     - 지금 상태가 정상분포(무작위)와 충분히 섞여 있어야 위 한계가 성립한다. 기적 직후처럼 정렬된 상태에서
  //       출발했다면, 비트마다 섞일 만큼(분포 차이 ≤ 10⁻¹⁷) 시간이 지난 뒤에만 건너뛴다.
  //     - 건너뛴 구간의 끝 상태는 정확히 구한다: 비트마다 뒤집힘은 독립인 포아송 과정이므로,
  //       Δ년 뒤 각 비트가 바뀌어 있을 확률은 (1 − e^(−2λΔ)) / 2 (λ = 비트 하나의 플립 빈도). O(비트 수).
  //  3) 증명이 안 되면(96~256비트처럼 기적이 확실히 오지만 시각을 구하려면 플립을 너무 많이 세야 할 때)
  //     건너뛰지 않고, 계산한 만큼만 진행한다 (정확성 우선).
  advanceTo(target, ms) {
    const rate = this.flipRate;
    const exp = () => -Math.log(1 - this.flipRng()) / rate;
    if (this.nextFlip === null) this.nextFlip = this.years + exp();
    const t0 = performance.now();
    let t = this.years;
    for (let c = 1; this.nextFlip <= target; c++) {
      t = this.nextFlip;
      this.epoch = t; this.local = 0;
      this.nextFlip = t + exp();
      if (this._flip()) { this._setEpoch(t); return true; }
      if ((c & 4095) === 0 && performance.now() - t0 > ms) break;
    }
    if (this.nextFlip > target) { this._setEpoch(target); return false; } // 목표까지 전부 정확히 계산함
    this.epoch = t; this.local = 0;
    if (this.canSkip(target)) { this._skipTo(target); return false; } // 정렬될 수 없음이 증명된 건너뛰기
    return this._approxTo(target); // 대충 계산
  }

  // 대충 계산: 무작위 상태에서 처음 정렬될 때까지의 시간을 지수분포로 근사한다 (드문 사건 근사).
  // 평균 플립 수 = c(N) / 정렬확률(N). c는 몬테카를로로 잰 값 (80비트 넘으면 80비트 값으로 대신한다).
  meanMiracleLog10Years() {
    const n = this.memory.n;
    const c = MIRACLE_C[n] ?? MIRACLE_C[10];
    return Math.log10(c) - log10SortedProbability(n) - Math.log10(this.flipRate);
  }

  _approxTo(target) {
    const dy = target - this.years;
    if (!(dy > 0)) return false;
    // 기적까지 남은 시간 = 평균 × Exp(1). 아주 큰 수도 넘치지 않게 로그로 비교한다
    const lgWait = this.meanMiracleLog10Years() + Math.log10(-Math.log(1 - this.flipRng()));
    if (lgWait <= Math.log10(dy)) {
      const t = this.years + 10 ** lgWait;
      const m = this.memory, r = this.flipRng;
      for (let i = 0; i < m.n; i++) m.a[i] = (r() * 256) | 0; // 무작위 정렬 상태 하나
      m.a.sort();
      m.descents = 0;
      m.flips++;
      m.lastIdx = -1;
      this.wasSorted = true;
      this.miracleYear = t;
      this.mixedSince = t;
      this.nextFlip = null;
      this._setEpoch(t);
      return true;
    }
    this._skipTo(target); // 기적 없이 끝까지: 끝 상태는 비트별 홀짝으로
    return false;
  }

  // 남은 구간을 건너뛰어도 되는가 (정렬될 확률 상한 < 10⁻¹⁷, 그리고 충분히 섞임)
  canSkip(target) {
    const B = this.memory.n * 8;
    const mixFlips = (B / 2) * (Math.log(B / 2) + 40); // (B/2)·e^(−2m/B) ≤ 10⁻¹⁷ 이 되는 기대 플립 수 m
    if ((this.years - this.mixedSince) * this.flipRate < mixFlips) return false;
    const lgFlips = Math.log10(Math.max(1, (target - this.years) * this.flipRate));
    return lgFlips + log10SortedProbability(this.memory.n) < -17;
  }

  _skipTo(target) {
    const m = this.memory, B = m.n * 8;
    const lam = this.flipRate / B; // 비트 하나의 플립 빈도 (회/년)
    const p = -Math.expm1(-2 * lam * (target - this.years)) / 2; // Δ 뒤 그 비트가 바뀌어 있을 확률
    const r = this.flipRng;
    for (let i = 0; i < m.n; i++) {
      let mask = 0;
      for (let b = 0; b < 8; b++) if (r() < p) mask |= 1 << b;
      m.a[i] ^= mask;
    }
    m.descents = m.countDescents();
    m.flips++; // 화면 표시용 (바뀌었음을 알림)
    m.lastIdx = -1;
    this.wasSorted = m.descents === 0;
    this.mixedSince = -Infinity; // 이제 정상분포에서 뽑힌 상태
    this.nextFlip = null; // 무기억성: 다음 플립 시각은 다시 뽑는다
    this._setEpoch(target);
  }

  // 정밀 계산으로 돌아갈 때: 다음 플립 시각은 버린다 (무기억성 덕분에 나중에 다시 뽑아도 정확하다)
  enterPrecise() { this.nextFlip = null; }

  // 입자 이동 + 충돌. 지구 피격 수를 돌려준다
  _moveParticles() {
    const P = this.particles, B = this.belt, K = this.planets;
    const { x, y, vx, vy } = P;
    const hashing = this.hashing;
    if (hashing) this.hash.build(B.n, B.x, B.y);
    const R2 = WORLD_R * WORLD_R, earth = K.earth;
    let hits = 0;
    for (let i = P.count - 1; i >= 0; i--) {
      const x0 = x[i], y0 = y[i];
      const x1 = x0 + vx[i] * DT, y1 = y0 + vy[i] * DT;
      if (x1 * x1 + y1 * y1 > R2) { P.remove(i); continue; }
      let dead = false;
      for (let k = 0; k < K.n; k++) { // 행성 4개는 그냥 다 본다
        if (sweptHit(x0, y0, x1, y1, K.px[k], K.py[k], K.x[k], K.y[k], K.rad2[k])) {
          if (k === earth) { hits++; this._logHit(x1, y1); }
          dead = true;
          break;
        }
      }
      if (!dead) dead = (hashing ? this.hash.hit(x0, y0, x1, y1, B) : bruteHit(x0, y0, x1, y1, B)) >= 0;
      if (dead) P.remove(i);
      else { x[i] = x1; y[i] = y1; }
    }
    P.spawn(this.rng, EMIT_PER_STEP);
    this.earthHits += hits;
    return hits;
  }

  // 측정용: 지금 입자들의 다음 이동 구간이 소행성과 닿는지 전부 판정만 한다 (상태는 바꾸지 않음)
  collideOnly(useHash) {
    const P = this.particles, B = this.belt;
    if (useHash) this.hash.build(B.n, B.x, B.y);
    let n = 0;
    for (let i = 0; i < P.count; i++) {
      const x0 = P.x[i], y0 = P.y[i], x1 = x0 + P.vx[i] * DT, y1 = y0 + P.vy[i] * DT;
      if ((useHash ? this.hash.hit(x0, y0, x1, y1, B) : bruteHit(x0, y0, x1, y1, B)) >= 0) n++;
    }
    return n;
  }

  _logHit(px, py) {
    const h = this.hitHead;
    this.hitX[h] = px;
    this.hitY[h] = py;
    this.hitT[h] = performance.now();
    this.hitHead = (h + 1) % HIT_LOG;
  }
}
