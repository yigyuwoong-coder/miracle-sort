// 메모리 비트 플립 과정 — 시드 하나로 완전히 정해진다 (재현·검증 가능).
//
// 비트 플립은 평균 빈도가 일정한 포아송 과정이다. 그래서 플립 시각(지수분포 간격), 어느 원소의 어느 비트인지,
// 기적이 몇 번째 플립에서 나는지가 전부 시드의 난수열로 정해진다. 배속을 어떻게 바꾸든, 화면을 껐다 켜든,
// 같은 시드면 같은 기적이 같은 시각에 난다. 그래서 결과 카드의 인증 코드(비트 수·시드·몇 번째 기적)만 있으면
// 누구든 처음부터 다시 계산해 진짜인지 확인할 수 있다.
//
// 기적과 기적 사이 한 구간에서는 플립을 EXACT_CAP번까지 하나씩 정확히 센다.
// 그 안에 정렬되지 않으면(96비트 이상에서 흔함) 남은 대기 시간을 지수분포로 근사한다 (대충 계산, 이것도 시드로 정해짐).

import { mulberry32 } from './rng.js';
import { Memory, log10SortedProbability } from './memory.js';
import { flipsPerYear } from './constants.js';

export const EXACT_CAP = 2e7;

// 무작위 상태에서 처음 정렬될 때까지의 평균 플립 수 × 정렬확률 (바이트 수별 몬테카를로 측정값)
const MIRACLE_C = { 2: 6.65, 3: 6.06, 4: 5.1, 6: 3.51, 8: 2.86, 10: 1.75 };

// log10(10^a + 10^b), log10(10^a − 10^b)  (a ≥ b)
export const lgAdd = (a, b) => {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return hi + Math.log10(1 + 10 ** (lo - hi));
};
export const lgSub = (a, b) => (b === -Infinity ? a : a - b > 15 ? a : a + Math.log10(1 - 10 ** (b - a)));

export class FlipProcess {
  constructor(n, seed) {
    this.n = n;
    this.seed = seed;
    this.memory = new Memory(n, mulberry32(seed ^ 0x9e3779b9)); // 처음 메모리 값
    this.flipRng = mulberry32(Math.imul(seed, 2654435761) ^ 0x85ebca6b); // 플립 시각·위치
    this.approxRng = mulberry32(seed ^ 0x27d4eb2f); // 대충 계산
    this.rate = flipsPerYear(n); // 1년당 기대 플립 수
    this.baseLg = -Infinity; // 지금 구간이 시작된 시각 (log10 년)
    this.off = 0; // 구간 시작 후 마지막으로 처리한 플립까지 (년)
    this.nextOff = this._gap();
    this.j = 0; // 이번 구간에서 센 플립 수
    this.total = 0; // 지금까지 센 플립 수 (인증에 쓴다)
    this.approxLg = null; // 대충 계산 구간이면, 이번 기적 시각 (log10)
    this.wasSorted = this.memory.descents === 0;
    this.miracles = 0;
    this.reachedLg = -Infinity; // 마지막 advance가 도달한 시각
  }

  _gap() { return -Math.log(1 - this.flipRng()) / this.rate; }
  _lgAt(off) { return lgAdd(this.baseLg, off > 0 ? Math.log10(off) : -Infinity); }
  get lgTime() { return this._lgAt(this.off); }
  get approximating() { return this.approxLg !== null; }

  static meanLog10Years(n) {
    const c = MIRACLE_C[n] ?? MIRACLE_C[10];
    return Math.log10(c) - log10SortedProbability(n) - Math.log10(flipsPerYear(n));
  }

  // 목표 시각(log10 년)까지 진행. 예산(ms)을 넘기면 중간에 멈춘다 (멈춘 지점은 reachedLg).
  // 기적이 나면 그 순간에 멈추고 기적 정보를 돌려준다. 결과는 어떻게 나눠 부르든 같다 (시드로 정해짐).
  advance(lgTarget, ms = Infinity) {
    const t0 = performance.now();
    const m = this.memory, r = this.flipRng;
    for (let c = 1; ; c++) {
      if (this.approxLg !== null) {
        if (this.approxLg <= lgTarget) return this._approxMiracle();
        this.reachedLg = lgTarget;
        return null;
      }
      if (this._lgAt(this.nextOff) > lgTarget) { this.reachedLg = lgTarget; return null; }
      this.off = this.nextOff;
      const sorted = m.flip((r() * m.n) | 0, (r() * 8) | 0);
      this.j++;
      this.total++;
      this.nextOff = this.off + this._gap();
      if (sorted && !this.wasSorted) { this.wasSorted = true; return this._miracle(this.lgTime, false); }
      this.wasSorted = sorted;
      if (this.j >= EXACT_CAP) { this._enterApprox(); continue; }
      if ((c & 4095) === 0 && performance.now() - t0 > ms) { this.reachedLg = this.lgTime; return null; }
    }
  }

  _enterApprox() {
    const e = -Math.log(1 - this.approxRng());
    this.approxLg = lgAdd(this.lgTime, FlipProcess.meanLog10Years(this.n) + Math.log10(e));
  }

  _approxMiracle() {
    const m = this.memory, r = this.approxRng;
    for (let i = 0; i < m.n; i++) m.a[i] = (r() * 256) | 0; // 정렬된 상태 하나
    m.a.sort();
    m.descents = 0;
    m.flips++;
    m.lastIdx = -1;
    this.wasSorted = true;
    const lg = this.approxLg;
    this.approxLg = null;
    return this._miracle(lg, true);
  }

  _miracle(lg, approx) {
    this.miracles++;
    this.baseLg = lg; // 이 순간부터 새 구간
    this.off = 0;
    this.nextOff = this._gap();
    this.j = 0;
    this.reachedLg = lg;
    return { m: this.miracles, lg, total: this.total, values: Array.from(this.memory.a), approx };
  }
}

// 검증: 시드로 처음부터 다시 계산해 m번째 기적을 구한다
export function replayMiracle(n, seed, m) {
  const P = new FlipProcess(n, seed);
  let info = null;
  for (let k = 0; k < m; k++) info = P.advance(Infinity);
  return info;
}
