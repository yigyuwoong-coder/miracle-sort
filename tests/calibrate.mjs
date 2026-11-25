// 보정: 평상시 태양에서 스텝당 지구 피격 수를 잰다 → constants.js 의 EARTH_HITS_PER_STEP
//   node tests/calibrate.mjs
import { World } from '../js/sim/world.js';

const runs = [];
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const W = new World({ n: 6, seed });
  const S = 20000; // 약 6.4년
  for (let s = 0; s < S; s++) W.step();
  runs.push(W.earthHits / S);
}
const mean = runs.reduce((a, b) => a + b) / runs.length;
const sd = Math.sqrt(runs.reduce((a, b) => a + (b - mean) ** 2, 0) / (runs.length - 1));
console.log(`스텝당 지구 피격: ${runs.map((v) => v.toFixed(4)).join(' ')}`);
console.log(`평균 ${mean.toFixed(4)} (표준편차 ${sd.toFixed(4)})`);
