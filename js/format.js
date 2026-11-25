// 시간·숫자 표기 (화면과 공유 카드가 같이 쓴다)

// 큰 수를 만·억·조 단위로 두 자리까지: 56억 3,214만
export function fmtYears(y) {
  if (y < 1) return `${Math.floor(y * 365.25)}일`;
  if (y < 1e4) return `${Math.floor(y).toLocaleString()}년 ${Math.floor((y % 1) * 365.25)}일`;
  if (y >= 1e16) return `${fmtSci(y)}년`;
  let rest = Math.floor(y);
  const parts = [];
  for (const [u, name] of [[1e12, '조'], [1e8, '억'], [1e4, '만']]) {
    if (parts.length === 2) break;
    if (rest >= u) { const q = Math.floor(rest / u); parts.push(q.toLocaleString() + name); rest -= q * u; }
    else if (parts.length) parts.push(null); // 두 번째 자리가 0이면 생략
  }
  const shown = parts.filter(Boolean);
  if (shown.length === 1 && parts.length < 2 && rest > 0) shown.push(rest.toLocaleString());
  const last = shown[shown.length - 1];
  return shown.join(' ') + (/[만억조]$/.test(last) ? ' 년' : '년');
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export function fmtSci(v) {
  const e = Math.floor(Math.log10(v));
  return `${(v / 10 ** e).toFixed(1)} × 10${String(e).split('').map((d) => SUP[+d]).join('')}`;
}

// 배수 표기: 12배, 435배, 3.2만 배
export function fmtTimes(v) {
  if (v >= 1e16) return `${fmtSci(v)}배`;
  for (const [u, name] of [[1e12, '조'], [1e8, '억'], [1e4, '만']]) {
    if (v >= u) { const m = v / u; return `${m >= 10 ? Math.round(m).toLocaleString() : m.toFixed(1)}${name} 배`; }
  }
  return `${v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1)}배`;
}

// 걸린 시간을 천문학적 기준과 비교한 한 줄
const MILESTONES = [
  [1e4, '인류 문명의 역사'],
  [3e5, '호모 사피엔스의 역사'],
  [6.6e7, '공룡이 사라진 뒤 흐른 시간'],
  [2.3e8, '태양이 은하를 한 바퀴 도는 시간'],
  [4.54e9, '지구의 나이'],
];
export const UNIVERSE_AGE = 1.38e10;

export function compareYears(y) {
  if (y >= UNIVERSE_AGE) return `우주 나이의 ${fmtTimes(y / UNIVERSE_AGE)}`;
  if (y < MILESTONES[0][0]) return `${MILESTONES[0][1]}보다 짧다`;
  let label = MILESTONES[0][1];
  for (const [t, name] of MILESTONES) if (y >= t) label = name;
  return `${label}보다 길다`;
}

// ── 아주 큰 시간 (log10 년으로 받는다: 10^500년처럼 실수로 담을 수 없는 값까지) ──
const sup = (k) => String(k).split('').map((d) => SUP[+d]).join('');
export function fmtSciLg(lg) {
  const e = Math.floor(lg);
  let m = 10 ** (lg - e);
  if (m >= 9.95) return `1.0 × 10${sup(e + 1)}`;
  return `${m.toFixed(1)} × 10${sup(e)}`;
}
export function fmtYearsLg(lg) {
  if (lg === -Infinity || Number.isNaN(lg)) return '0일';
  return lg < 16 ? fmtYears(10 ** lg) : `${fmtSciLg(lg)}년`;
}
export function compareYearsLg(lg) {
  const lgAge = Math.log10(UNIVERSE_AGE);
  if (lg < lgAge) return compareYears(10 ** lg);
  const r = lg - lgAge;
  return `우주 나이의 ${r < 16 ? fmtTimes(10 ** r) : `${fmtSciLg(r)}배`}`;
}
