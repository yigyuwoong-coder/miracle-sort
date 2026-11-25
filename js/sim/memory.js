// 지구의 컴퓨터 메모리 = 미라클 소트가 정렬을 기다리는 배열 (Uint8 × N)
//
//   function miracleSort(a) {
//     while (!isSorted(a)) { /* 태양 입자가 비트를 뒤집어 주길 기다린다 */ }
//   }
//
// 정렬 여부는 "뒤바뀐 이웃 쌍 개수 d = #{ i : a[i] > a[i+1] }"로 판단한다 (정렬됨 ⇔ d = 0).
// 비트가 뒤집혀 a[i]가 바뀌면 영향받는 쌍은 (i-1,i), (i,i+1) 두 개뿐이므로 d를 O(1)에 갱신한다.

export class Memory {
  constructor(n, rng) {
    this.n = n;
    this.a = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.a[i] = (rng() * 256) | 0;
    if (n >= 2 && this.countDescents() === 0) { this.a[0] = 255; this.a[n - 1] = 0; } // 처음부터 정렬돼 있지 않게
    this.descents = this.countDescents();
    this.flips = 0;
    this.lastIdx = -1;
    this.lastBit = -1;
  }

  countDescents() {
    let d = 0;
    for (let i = 0; i + 1 < this.n; i++) if (this.a[i] > this.a[i + 1]) d++;
    return d;
  }

  _bad(j) {
    return j >= 0 && j + 1 < this.n && this.a[j] > this.a[j + 1] ? 1 : 0;
  }

  // 원소 i의 비트 b를 뒤집는다. 정렬되면 true
  flip(i, b) {
    const before = this._bad(i - 1) + this._bad(i);
    this.a[i] ^= 1 << b;
    this.descents += this._bad(i - 1) + this._bad(i) - before;
    this.flips++;
    this.lastIdx = i;
    this.lastBit = b;
    return this.descents === 0;
  }
}

// 길이 N인 무작위 Uint8 배열이 (비내림차순) 정렬돼 있을 확률의 log10 = log10( C(N+255, N) / 256^N )
export function log10SortedProbability(n) {
  let lg = 0;
  for (let k = 1; k <= n; k++) lg += Math.log10((255 + k) / k);
  return lg - n * Math.log10(256);
}
