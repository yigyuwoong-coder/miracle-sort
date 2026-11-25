// 정품 인증 코드
//
//   2048-1a2b3c-1-9f8e7d6c
//   └비트 └시드(36진수) └몇 번째 기적 └검증값 (결과의 SHA-256 앞 8자리)
//
// 결과(플립 수, 정렬된 배열)는 비트 수·시드·몇 번째 기적만으로 정해진다 (js/sim/flips.js).
// 그래서 검증 페이지는 처음부터 다시 계산해 검증값이 맞는지 보고, 진짜 결과 카드를 다시 그린다.
// 숫자를 고친 이미지는 코드가 맞지 않거나, 다시 계산한 진짜 결과와 달라서 바로 드러난다.
import { sha256Hex } from './unlock.js';

export const VALID_BITS = [16, 24, 32, 48, 64, 80, 96, 128, 192, 256, 512, 1024, 2048];
export const MAX_M = 50;

export async function certHash(bits, seed, info) {
  const s = `miracle-sort|${bits}|${seed}|${info.m}|${info.total}|${info.approx ? 1 : 0}|${info.values.join(',')}`;
  return (await sha256Hex(s)).slice(0, 8);
}

export async function makeCode(bits, seed, info) {
  return `${bits}-${seed.toString(36)}-${info.m}-${await certHash(bits, seed, info)}`;
}

export function parseCode(code) {
  const m = /^(\d+)-([0-9a-z]{1,8})-(\d{1,3})-([0-9a-f]{8})$/.exec(String(code).trim().toLowerCase());
  if (!m) return null;
  const c = { bits: +m[1], seed: parseInt(m[2], 36), m: +m[3], h: m[4] };
  if (!VALID_BITS.includes(c.bits) || c.m < 1 || c.m > MAX_M || !(c.seed >= 0 && c.seed < 2 ** 31)) return null;
  return c;
}
