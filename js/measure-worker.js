// 해싱 효과 실측: 메인 화면과 같은 순간의 입자·소행성 스냅샷을 받아
// "해싱 사용"과 "해싱 없이(전수 검사)"로 충돌 판정 한 스텝씩을 재서 돌려준다.
// 별도 스레드에서 재므로 시뮬레이션이 끊기지 않는다.
import { SpatialHash, bruteHit } from './sim/spatial-hash.js';
import { HASH_CELL, DT } from './sim/constants.js';

const H = new SpatialHash(HASH_CELL);

function collideAll(P, B, useHash) {
  if (useHash) H.build(B.n, B.x, B.y);
  let hits = 0;
  for (let i = 0; i < P.count; i++) {
    const x0 = P.x[i], y0 = P.y[i], x1 = x0 + P.vx[i] * DT, y1 = y0 + P.vy[i] * DT;
    if ((useHash ? H.hit(x0, y0, x1, y1, B) : bruteHit(x0, y0, x1, y1, B)) >= 0) hits++;
  }
  return hits;
}

self.onmessage = ({ data }) => {
  const { P, B } = data;
  // 해싱은 빠르므로 5ms 이상이 될 때까지 반복해 평균 (브라우저 타이머 해상도 ≈ 0.1ms)
  let k = 0;
  const t0 = performance.now();
  let hHits = 0;
  do { hHits = collideAll(P, B, true); k++; } while (performance.now() - t0 < 5);
  const hashMs = (performance.now() - t0) / k;
  const t1 = performance.now();
  const bHits = collideAll(P, B, false);
  const bruteMs = performance.now() - t1;
  self.postMessage({ hashMs, bruteMs, same: hHits === bHits, particles: P.count, asteroids: B.n });
};
