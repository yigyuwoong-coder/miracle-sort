// 터미널 해싱 벤치마크: node bench/run.mjs
// 결과를 마크다운 표로 출력하고 bench/results-node.md 로 저장한다 (브라우저 bench.html 과 같은 코드).
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { runAll, toMarkdown } from '../js/bench/bench-core.js';

const res = { collision: [], throughput: [] };
for (const ev of runAll()) {
  res[ev.type].push(ev);
  process.stderr.write(`\r진행 ${ev.done}/${ev.total}   `);
}
process.stderr.write('\n');
const md = toMarkdown(res, `Node ${process.version} · ${os.cpus()[0]?.model ?? 'CPU'} · ${new Date().toLocaleString('ko-KR')}`);
console.log(md);
writeFileSync(new URL('./results-node.md', import.meta.url), md);
console.log('저장: bench/results-node.md');
