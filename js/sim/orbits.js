// 행성과 소행성: 태양 둘레 케플러 원궤도.
// 각속도 ω = a^(-3/2) (바퀴/년). 시각 t(년)의 위치를 식으로 바로 구하므로 수십억 년 뒤도 오차가 쌓이지 않는다.
//
// 아주 큰 t(예: 10¹²년)에서 각도를 그대로 곱하면 실수 정밀도가 무너지므로,
// 시각을 "큰 기준 시각(epoch) + 작은 경과 시간"으로 나눠 각각의 소수부(바퀴 수의 나머지)만 더한다.

const TAU = Math.PI * 2;
const frac = (v) => v - Math.floor(v);

export const PLANET_DEFS = [
  { name: '수성', a: 0.42, radius: 0.022, color: '#b9b1a6', phase: 0.06 },
  { name: '금성', a: 0.7, radius: 0.03, color: '#e9c98b', phase: 0.35 },
  { name: '지구', a: 1.0, radius: 0.036, color: '#5aa9ff', phase: 0.65, earth: true },
  { name: '화성', a: 1.38, radius: 0.026, color: '#e0704a', phase: 0.84 },
];

export class Orbiters {
  // a: 궤도 반지름, phase: 시작 위상(바퀴), rad: 충돌 반지름
  constructor(a, phase, rad) {
    const n = a.length;
    this.n = n;
    this.a = Float64Array.from(a);
    this.phase = Float64Array.from(phase);
    this.rad = Float64Array.from(rad);
    this.rad2 = this.rad.map((r) => r * r);
    this.w = this.a.map((r) => Math.pow(r, -1.5)); // 바퀴/년
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.px = new Float64Array(n); // 직전 스텝 위치 (이동 구간 충돌 판정용)
    this.py = new Float64Array(n);
    this.base = new Float64Array(n); // frac(epoch × ω)
  }

  setEpoch(epoch) {
    for (let i = 0; i < this.n; i++) this.base[i] = frac(epoch * this.w[i]);
  }

  // epoch 이후 dt년 지난 위치. keepPrev면 현재 위치를 직전 위치로 보관
  update(dt, keepPrev = true) {
    const { n, a, phase, w, base, x, y, px, py } = this;
    for (let i = 0; i < n; i++) {
      if (keepPrev) { px[i] = x[i]; py[i] = y[i]; }
      const ang = TAU * (base[i] + frac(dt * w[i]) + phase[i]);
      x[i] = a[i] * Math.cos(ang);
      y[i] = a[i] * Math.sin(ang);
      if (!keepPrev) { px[i] = x[i]; py[i] = y[i]; }
    }
  }
}

export function makePlanets() {
  const P = new Orbiters(PLANET_DEFS.map((d) => d.a), PLANET_DEFS.map((d) => d.phase), PLANET_DEFS.map((d) => d.radius));
  P.defs = PLANET_DEFS;
  P.earth = PLANET_DEFS.findIndex((d) => d.earth);
  return P;
}

export function makeBelt(m, rng, rIn, rOut, rMin, rMax) {
  const a = new Float64Array(m), ph = new Float64Array(m), rad = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    a[i] = Math.sqrt(rIn * rIn + rng() * (rOut * rOut - rIn * rIn)); // 면적당 균일
    ph[i] = rng();
    rad[i] = rMin + (rMax - rMin) * rng() ** 3; // 작은 것이 많다
  }
  return new Orbiters(a, ph, rad);
}
