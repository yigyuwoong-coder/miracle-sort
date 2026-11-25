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

export const CODE_LEN = 33;
const CODE_HASH = '336c02eb5ade16bf8bad5e9a6386255309fc75a1d48eddf877415354feda80bf';

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

// keys의 어느 연속 구간이든 코드와 같으면 true
export async function matches(keys) {
  if (keys.length < CODE_LEN || !globalThis.crypto?.subtle) return false;
  for (let i = 0; i + CODE_LEN <= keys.length; i++) {
    if ((await sha256Hex(keys.slice(i, i + CODE_LEN))) === CODE_HASH) return true;
  }
  return false;
}
