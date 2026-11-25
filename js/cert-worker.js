// 인증 검증: 코드의 비트 수·시드로 처음부터 다시 계산해 m번째 기적을 구한다 (최대 몇 초 걸려 워커에서)
import { replayMiracle } from './sim/flips.js';
import { certHash } from './cert.js';

self.onmessage = async ({ data }) => {
  const { bits, seed, m } = data;
  const info = replayMiracle(bits / 8, seed, m);
  self.postMessage({ info, h: await certHash(bits, seed, info) });
};
