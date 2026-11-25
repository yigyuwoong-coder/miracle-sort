// 벤치마크는 CPU를 오래 붙잡으므로 Web Worker에서 돌린다 (화면이 멈추지 않음)
import { runAll } from './bench-core.js';

self.onmessage = (e) => {
  for (const ev of runAll(e.data)) self.postMessage(ev);
  self.postMessage({ type: 'done' });
};
