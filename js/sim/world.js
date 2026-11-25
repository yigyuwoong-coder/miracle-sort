// 우주: 태양풍 입자 → 행성·소행성과 충돌(공간 해싱) → 지구에 닿는 입자가 메모리 비트를 뒤집는다 → 정렬되면 기적
//
// 비트 플립 자체는 FlipProcess(시드로 완전히 정해지는 포아송 과정)가 맡는다. 평균 빈도는 지구 피격 빈도 × 비트가
// 뒤집힐 확률(현실 소프트 에러율로 보정)과 같다. 그래서 어떤 배속으로 진행하든 같은 시드면 같은 기적이 나고,
// 결과 카드의 인증 코드로 누구든 다시 계산해 확인할 수 있다.
//
// 시간을 진행하는 두 가지 방법
//  ① 정밀 계산 step(): 2.8시간짜리 스텝마다 입자 하나하나의 이동과 충돌을 계산한다 (여기에 공간 해싱).
//  ② 천문 시간 advanceLg(): 목표 시각(log10 년)까지 비트 플립 사건만 처리한다. 10^290년을 넘으면 시간을 로그로 저장한다.

import { mulberry32 } from './rng.js';
import { makePlanets, makeBelt } from './orbits.js';
import { Particles } from './particles.js';
import { SpatialHash, sweptHit, bruteHit } from './spatial-hash.js';
import { FlipProcess, lgAdd, lgSub } from './flips.js';
import { DT, YEARS_PER_STEP, WORLD_R, BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX, WIND_VMIN, EMIT_PER_STEP, HASH_CELL } from './constants.js';

export { lgAdd, lgSub };
const HIT_LOG = 32;
const BIG_LG = 290; // 이보다 큰 시각은 실수(double, 최대 약 10^308)로 담지 못하므로 로그로 저장

export class World {
  constructor({ n = 6, asteroids = 3000, seed = 1, hashing = true } = {}) {
    this.seed = seed;
    this.n = n;
    this.rng = mulberry32(seed); // 우주 생성 + 입자 방출 (화면용)
    this.planets = makePlanets();
    this.belt = makeBelt(asteroids, this.rng, BELT_IN, BELT_OUT, AST_R_MIN, AST_R_MAX);
    this.particles = new Particles();
    this.hash = new SpatialHash(HASH_CELL);
    this.hashing = hashing;
    this.flips = new FlipProcess(n, seed); // 비트 플립 (시드로 정해짐)

    this.epoch = 0; // 기준 시각 (년)
    this.local = 0; // 기준 시각 이후 정밀 스텝 수
    this.bigLg = null; // 로그 시간 모드일 때 현재 시각의 log10
    this.miracle = null; // 마지막 기적 { m, lg, total, values, approx }
    this.earthHits = 0;
    this.hitX = new Float64Array(HIT_LOG);
    this.hitY = new Float64Array(HIT_LOG);
    this.hitT = new Float64Array(HIT_LOG).fill(-1e9);
    this.hitHead = 0;
    this.collideMs = 0; // 충돌 판정에 쓴 시간 누적 (읽는 쪽이 0으로 리셋)

    this.planets.setEpoch(0);
    this.belt.setEpoch(0);
    this._placeBodies(false);
    this.prefill();
  }

  get memory() { return this.flips.memory; }
  get years() { return this.epoch + this.local * YEARS_PER_STEP; }
  get lgYears() { return this.bigLg ?? Math.log10(this.years); } // 화면 표시용 현재 시각 (log10 년)

  _placeBodies(keepPrev) {
    const dt = this.local * YEARS_PER_STEP;
    this.planets.update(dt, keepPrev);
    this.belt.update(dt, keepPrev);
  }

  _setTimeLg(lg) {
    if (lg < BIG_LG) {
      this.bigLg = null;
      this.epoch = lg === -Infinity ? 0 : 10 ** lg;
      this.local = 0;
      this.planets.setEpoch(this.epoch);
      this.belt.setEpoch(this.epoch);
    } else { // 이 시간 규모에서 행성 위치는 의미가 없으므로 아무 위상으로
      this.bigLg = lg;
      this.local = 0;
      const v = Math.random() * 1e6;
      this.planets.setEpoch(v);
      this.belt.setEpoch(v);
    }
    this._placeBodies(false);
  }

  // 시작하자마자 입자가 고르게 퍼져 있도록, 천체를 멈춘 채 입자만 미리 날려 둔다
  prefill() {
    const L = Math.ceil(WORLD_R / WIND_VMIN / DT);
    for (let s = 0; s < L; s++) this._moveParticles();
    this.earthHits = 0;
    this.hitT.fill(-1e9);
  }

  // ① 정밀 계산 1스텝. 기적이 나면 기적 정보
  step() {
    this.local++;
    this._placeBodies(true);
    const t0 = performance.now();
    this._moveParticles();
    this.collideMs += performance.now() - t0;
    const info = this.flips.advance(this.lgYears);
    if (info) this.miracle = info;
    return info;
  }

  // ② 목표 시각(log10 년)까지. 시간 예산(ms) 안에서 비트 플립을 정확히 세다가 다 못 세면 거기까지만 간다.
  advanceLg(lgTarget, ms = Infinity) {
    if (!(lgTarget > this.lgYears)) return null;
    const info = this.flips.advance(lgTarget, ms);
    this._setTimeLg(info ? info.lg : this.flips.reachedLg);
    if (info) this.miracle = info;
    return info;
  }

  // 입자 이동 + 충돌. 지구 피격 수를 돌려준다 (피격은 화면 표시용 — 비트 플립 빈도는 이미 보정돼 FlipProcess에 들어 있다)
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
