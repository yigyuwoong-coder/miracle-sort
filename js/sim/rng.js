// 시드 고정 난수 생성기 (mulberry32).
// 같은 시드 → 같은 우주. 성능 비교를 공정하게 하려면 매 측정마다 초기 상태가 같아야 한다.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
