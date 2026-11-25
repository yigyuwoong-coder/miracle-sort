// 공간 해싱 (Spatial Hashing) — 입자가 소행성 M개 중 하나에 부딪혔는지 빠르게 찾기
//
//   [해싱 없이] 입자마다 소행성 M개를 전부 확인한다.            O(P·M)
//   [해싱 사용] 공간을 한 변 h인 칸으로 나누고, 칸 좌표 (cx, cy)를 해시 함수로
//              버킷 번호에 대응시켜 소행성을 해시 테이블에 넣어 둔다.
//              입자는 자기 칸과 주변 8칸의 버킷만 확인한다.     평균 O(P + M)
//
// 해시 테이블 구현
//   - 해시 함수: h(cx, cy) = (cx·73856093 XOR cy·19349663) mod 테이블크기
//     (큰 소수를 곱해 섞는 고전적인 공간 해시 함수. 테이블 크기는 2의 거듭제곱이라 mod 대신 & 연산)
//   - 충돌 처리: 분리 연결법(chaining). 연결 리스트를 객체로 만들지 않고
//     head[버킷] = 첫 원소, next[원소] = 같은 버킷의 다음 원소 로 배열 두 개에 담는다.
//   - 부하율(원소 수 / 버킷 수) ≤ 0.5 가 되도록 테이블 크기를 잡는다.
//   - 서로 다른 칸이 같은 버킷에 들어갈 수 있지만(해시 충돌), 실제 거리를 다시 확인하므로 결과는 정확하다.
//
// 칸 크기 h는 (입자 이동 거리의 절반 + 소행성 반지름 + 소행성 이동 거리)보다 크게 잡아서,
// 이동 구간의 중점이 속한 칸과 주변 8칸만 봐도 충돌을 절대 놓치지 않게 한다.

// 입자가 한 스텝 동안 (x0,y0)→(x1,y1)로, 천체가 (bx0,by0)→(bx1,by1)로 움직일 때 둘이 닿았는가?
// 천체 기준 상대 운동으로 보면 입자는 선분 하나를 지나간다 → 선분과 원(반지름²=r2)의 최단 거리를 본다.
// (한 스텝 위치만 보면 빠른 입자가 작은 소행성을 뚫고 지나갈 수 있다)
export function sweptHit(x0, y0, x1, y1, bx0, by0, bx1, by1, r2) {
  const fx = x0 - bx0, fy = y0 - by0;
  const dx = x1 - bx1 - fx, dy = y1 - by1 - fy;
  const dd = dx * dx + dy * dy;
  let t = dd > 0 ? -(fx * dx + fy * dy) / dd : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = fx + t * dx, cy = fy + t * dy;
  return cx * cx + cy * cy < r2;
}

// 해싱 없이: 소행성 전부 확인
export function bruteHit(x0, y0, x1, y1, B) {
  const { n, px, py, x, y, rad2 } = B;
  for (let j = 0; j < n; j++) {
    if (sweptHit(x0, y0, x1, y1, px[j], py[j], x[j], y[j], rad2[j])) return j;
  }
  return -1;
}

export class SpatialHash {
  constructor(cell) {
    this.cell = cell;
    this.inv = 1 / cell;
    this.size = 0;
    this.mask = 0;
    this.head = new Int32Array(0);
    this.next = new Int32Array(0);
  }

  hash(cx, cy) {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.mask;
  }

  // 소행성 n개를 현재 위치 기준으로 테이블에 넣는다. O(n + 테이블 크기)
  build(n, x, y) {
    let size = 256;
    while (size < 2 * n) size <<= 1; // 부하율 ≤ 0.5
    if (size !== this.size) { this.size = size; this.mask = size - 1; this.head = new Int32Array(size); }
    if (this.next.length < n) this.next = new Int32Array(n * 2);
    const { head, next, inv } = this;
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      const h = this.hash(Math.floor(x[i] * inv), Math.floor(y[i] * inv));
      next[i] = head[h]; // 버킷 맨 앞에 끼워 넣기 (체이닝)
      head[h] = i;
    }
  }

  // 이동 구간 (x0,y0)→(x1,y1)이 소행성과 닿으면 그 번호, 아니면 -1
  hit(x0, y0, x1, y1, B) {
    const { head, next, inv } = this;
    const { px, py, x, y, rad2 } = B;
    const cx = Math.floor((x0 + x1) * 0.5 * inv), cy = Math.floor((y0 + y1) * 0.5 * inv);
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let j = head[this.hash(gx, gy)]; j !== -1; j = next[j]) {
          if (sweptHit(x0, y0, x1, y1, px[j], py[j], x[j], y[j], rad2[j])) return j;
        }
      }
    }
    return -1;
  }
}
