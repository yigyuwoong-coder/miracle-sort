// 태양풍 입자 풀. 입자는 매 스텝 수십 개씩 생기고 사라지므로 객체를 만들지 않고
// 미리 잡아 둔 배열(속성별 Float64Array)을 재사용한다.
//  - 생성: count 위치에 값을 쓴다. 모자라면 용량을 2배로 늘린다.
//  - 삭제: 맨 뒤 원소로 빈자리를 메우고 count-- (입자 순서는 의미가 없으므로 O(1)).
// 입자는 직선으로 일정한 속도로 날아간다 (태양풍은 태양 근처에서 가속된 뒤 거의 등속으로 퍼진다).

import { SUN_R, WIND_VMIN, WIND_VMAX, WIND_SPREAD, DT } from './constants.js';

export class Particles {
  constructor(cap = 8192) {
    this.count = 0;
    this._alloc(cap);
  }

  _alloc(cap) {
    const old = this.x ? [this.x, this.y, this.vx, this.vy] : null;
    this.cap = cap;
    this.x = new Float64Array(cap);
    this.y = new Float64Array(cap);
    this.vx = new Float64Array(cap);
    this.vy = new Float64Array(cap);
    if (old) [this.x, this.y, this.vx, this.vy].forEach((arr, k) => arr.set(old[k].subarray(0, this.count)));
  }

  // 태양 표면에서 k개 방출. age스텝만큼 이미 날아간 상태로 놓을 수도 있다 (시작 시 채우기용)
  spawn(rng, k, age = 0) {
    if (this.count + k > this.cap) this._alloc(Math.max(this.cap * 2, this.count + k));
    const { x, y, vx, vy } = this;
    const r0 = SUN_R * 1.05;
    for (let t = 0; t < k; t++) {
      const phi = rng() * Math.PI * 2;
      const dir = phi + (rng() * 2 - 1) * WIND_SPREAD;
      const v = WIND_VMIN + (WIND_VMAX - WIND_VMIN) * rng();
      const i = this.count++;
      vx[i] = v * Math.cos(dir);
      vy[i] = v * Math.sin(dir);
      x[i] = r0 * Math.cos(phi) + vx[i] * DT * age;
      y[i] = r0 * Math.sin(phi) + vy[i] * DT * age;
    }
  }

  remove(i) {
    const last = --this.count;
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
  }
}
