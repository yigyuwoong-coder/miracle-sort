// 해금 코드
//
// 공개 저장소라 소스에 코드를 그대로 두면 누구나 볼 수 있다. 그래서 코드 자체는 두지 않고
// SHA-256 해시값만 두고, 사용자가 입력한 내용을 해시해서 같은지 비교한다.
//
// 입력은 두벌식 자판의 "누른 글쇠 순서"로 바꿔서 비교한다.
//   - 화면 아무 데서나 칠 때: 한/영 상태와 상관없이 물리 키(e.code: KeyD → d)로 받는다.
//   - 입력칸에 칠 때: 완성된 한글(예: "원")을 글쇠 순서(ㅇ ㅜ ㅓ ㄴ → d n j s)로 풀어서 비교한다.

const L = ['r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g'];
const V = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
const T = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];
// 호환 자모 ㄱ(U+3131) ~ ㅣ(U+3163)
const JAMO = 'r R rt s sw sg e E f fr fa fq ft fx fv fg a q Q qt t T d w W c z x v g k o i O j p u P h hk ho hl y n nj np nl b m ml l'.split(' ');

export function toKeys(text) {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const i = c - 0xac00;
      out += L[Math.floor(i / 588)] + V[Math.floor((i % 588) / 28)] + T[i % 28];
    } else if (c >= 0x3131 && c <= 0x3163) {
      out += JAMO[c - 0x3131];
    } else if (/[a-z]/i.test(ch)) {
      out += ch;
    }
  }
  return out.toLowerCase();
}

// 해금 코드는 단계별로 4개. 앞 단계 코드는 다음 단계 코드의 앞부분이라, 끝까지 치면 차례로 열린다.
// 소스에는 원문 대신 (글쇠 순서 문자열의) SHA-256 해시만 둔다.
export const CODES = [
  { stage: 1, len: 8, hash: '88e24f8a29df37ed77ecc84ebccf84fa0ef057735c872f41ebeae7535c9efbcc' },
  { stage: 2, len: 13, hash: '9bfadc4ee4f5685814125b75c9e0fa4eac7a2105f71e56ff4cea038913392948' },
  { stage: 3, len: 23, hash: 'ef37808ec96b577cadc1ed4148716cf27cc77baf0c0438763d150e4c310ad703' },
  { stage: 4, len: 33, hash: '336c02eb5ade16bf8bad5e9a6386255309fc75a1d48eddf877415354feda80bf' },
];
export const MAX_CODE_LEN = Math.max(...CODES.map((c) => c.len));

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

// 방금 친 글쇠들의 끝부분이 어느 단계 코드와 같은지 → 가장 높은 단계 (없으면 0)
export async function stageFromSuffix(keys) {
  if (!globalThis.crypto?.subtle) return 0;
  let best = 0;
  for (const c of CODES) {
    if (keys.length >= c.len && (await sha256Hex(keys.slice(-c.len))) === c.hash) best = Math.max(best, c.stage);
  }
  return best;
}

// 입력칸 내용 어딘가에 코드가 들어 있으면 → 가장 높은 단계
export async function stageAnywhere(keys) {
  if (!globalThis.crypto?.subtle) return 0;
  let best = 0;
  for (const c of CODES) {
    for (let i = 0; i + c.len <= keys.length; i++) {
      if ((await sha256Hex(keys.slice(i, i + c.len))) === c.hash) { best = Math.max(best, c.stage); break; }
    }
  }
  return best;
}
