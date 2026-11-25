// 결과 카드
//  - 비트 수가 클수록 등급이 오르고 더 번쩍번쩍 빛난다 (반짝이 수, 빛줄기, 글로우, 은하 소용돌이).
//  - 인증 코드마다 디자인이 다르다: 성운 색, 장식(고리 행성·초승달·혜성·별자리), 반짝이 모양, 막대 모양.
//    같은 코드면 언제 그려도 같은 카드다.
//  - 오른쪽 위에 정품인증 도장과 인증 코드. 코드는 검증 페이지에서 다시 계산해 확인할 수 있다.
import { fmtYearsLg, compareYearsLg } from './format.js';

export const W = 1080, H = 1350; // 4:5

export const TIERS = [
  { min: 0, name: '일반', stars: 1, color: '#7fa6ff', accent: '#d6e4ff', sparkles: 30, rays: 0, glow: 18 },
  { min: 32, name: '희귀', stars: 2, color: '#3fb6ff', accent: '#bff0ff', sparkles: 70, rays: 0, glow: 34 },
  { min: 64, name: '영웅', stars: 3, color: '#b56cff', accent: '#ecc9ff', sparkles: 130, rays: 12, glow: 50 },
  { min: 80, name: '전설', stars: 4, color: '#ffbf2e', accent: '#fff3b0', sparkles: 220, rays: 18, glow: 70 },
  { min: 128, name: '신화', stars: 5, color: '#ff5ec8', accent: '#ffffff', sparkles: 340, rays: 28, glow: 90, holo: true },
  { min: 256, name: '초월', stars: 6, color: '#4ff0ff', accent: '#ffffff', sparkles: 480, rays: 36, glow: 110, holo: true, swirl: 3 },
  { min: 1024, name: '우주', stars: 7, color: '#ffffff', accent: '#ffffff', sparkles: 640, rays: 48, glow: 140, holo: true, swirl: 5, pulse: true },
];
const MAX_STARS = TIERS[TIERS.length - 1].stars;
export const tierOf = (bits) => TIERS.reduce((t, x) => (bits >= x.min ? x : t), TIERS[0]);

// 디자인 변주 (인증 코드로 정해진다)
const NEBULAE = [
  ['#5b2a86', '#1d7a8c', '#0d1b4d'], ['#8c2a3b', '#d9822b', '#2b0f2e'], ['#1f4e8c', '#2a8c5b', '#0b1f2e'],
  ['#8c2a7a', '#d4af37', '#1e0f2b'], ['#2a3b8c', '#c2416b', '#0f1030'], ['#145c5c', '#6b2a8c', '#071c22'],
];
const DECOS = ['planet', 'moon', 'comet', 'constellation'];
const SPARKS = ['star4', 'star6', 'glint', 'diamond'];
const BARS = ['round', 'capsule', 'gradient'];

// lg = 걸린 시간의 log10 (년). 10^500년처럼 실수로 담을 수 없는 값도 표현한다
export function captionOf({ miracle, lg }) {
  const y = fmtYearsLg(lg);
  return miracle
    ? { head: `${y} 만에 저절로 정렬!`, line: compareYearsLg(lg) }
    : { head: `${y}째 기다리는 중`, line: '태양 입자가 비트를 뒤집어 주길 기다린다' };
}

export function shareText({ bits, lg, code }, url) {
  const c = captionOf({ miracle: true, lg });
  return `✨ Miracle Sort [${tierOf(bits).name}] ✨\n${bits}비트 메모리가 ${fmtYearsLg(lg)} 만에 저절로 정렬됐다!\n(${c.line})\n정품 인증 코드 ${code}\n확인: ${url}`;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const codeSeed = (code) => (code ? parseInt(code.split('-').pop(), 16) >>> 0 : 12345);

const FONT = '-apple-system, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sparkle(ctx, kind, x, y, r) {
  ctx.beginPath();
  if (kind === 'star4' || kind === 'star6') {
    const pts = kind === 'star4' ? 4 : 6;
    for (let i = 0; i < pts * 2; i++) {
      const a = (i * Math.PI) / pts - Math.PI / 2;
      const rr = i % 2 ? r * 0.22 : r;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
  } else if (kind === 'diamond') {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.55, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.55, y);
  } else { // glint: 둥근 빛망울
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();
}

function drawDeco(ctx, kind, rnd, t, tier, neb) {
  const x = 120 + rnd() * (W - 240), y = rnd() < 0.5 ? 320 + rnd() * 120 : 1000 + rnd() * 60;
  ctx.save();
  ctx.globalAlpha = 0.85;
  if (kind === 'planet') { // 고리 행성
    const r = 48 + rnd() * 30;
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#fff2d6'); g.addColorStop(1, neb[0]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = tier.accent; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.9, r * 0.45, -0.35, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'moon') { // 초승달
    const r = 46 + rnd() * 20;
    ctx.fillStyle = '#fff6d8';
    ctx.shadowColor = '#fff6d8'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.15, r * 0.9, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'comet') { // 혜성
    const len = 260 + rnd() * 160, ang = 0.4 + rnd() * 0.5;
    const tx = x - Math.cos(ang) * len, ty = y - Math.sin(ang) * len;
    const g = ctx.createLinearGradient(x, y, tx, ty);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = tier.color; ctx.shadowBlur = 25;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  } else { // 별자리: 점 몇 개를 잇는다
    const k = 5 + ((rnd() * 3) | 0), pts = [];
    for (let i = 0; i < k; i++) pts.push([x + (rnd() - 0.5) * 300, y + (rnd() - 0.5) * 180]);
    ctx.strokeStyle = 'rgba(220,230,255,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); pts.forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo'](px, py)); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (const [px, py] of pts) { ctx.beginPath(); ctx.arc(px, py, 5 + 2 * Math.abs(Math.sin(t * 2 + px)), 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// 정품인증 도장: 빨간 원형 인장 + 둘레 글자 + 잉크 번짐
let stampCache = null;
function stampCanvas(code) {
  if (stampCache?.code === code) return stampCache.canvas;
  const S = 300, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const red = '#d42a2a';
  g.translate(S / 2, S / 2);
  g.strokeStyle = red; g.fillStyle = red;
  g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 138, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 118, 0, Math.PI * 2); g.stroke();
  // 둘레 글자
  const ring = (text, start, sweep, r, flip) => {
    g.font = `800 22px ${FONT}`;
    const chars = [...text];
    chars.forEach((ch, i) => {
      const a = start + (sweep * (i + 0.5)) / chars.length;
      g.save();
      g.rotate(a);
      g.translate(0, flip ? r : -r);
      if (flip) g.rotate(Math.PI);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, 0, 0);
      g.restore();
    });
  };
  ring('★ MIRACLE SORT ★', -1.25, 2.5, 103, false);
  ring('GENUINE · 검증됨', 1.25 + Math.PI, -2.5, 103, true);
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(-82, -34); g.lineTo(82, -34); g.moveTo(-82, 40); g.lineTo(82, 40); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 52px ${FONT}`;
  g.fillText('정품인증', 0, 4);
  g.font = `700 15px ui-monospace, Menlo, monospace`;
  g.fillText(code, 0, 62);
  // 잉크 번짐: 군데군데 지워 도장 찍힌 느낌
  const rnd = seeded(codeSeed(code) ^ 0x5a5a);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.15 + rnd() * 0.5;
    g.beginPath(); g.arc((rnd() - 0.5) * S, (rnd() - 0.5) * S, 1 + rnd() * 4, 0, Math.PI * 2); g.fill();
  }
  stampCache = { code, canvas: c };
  return c;
}

// data = { bits, lg, values, code }, t = 초 (반짝임 애니메이션)
export function drawCard(canvas, data, t = 0) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tier = tierOf(data.bits);
  const ti = TIERS.indexOf(tier);
  const look = seeded(codeSeed(data.code)); // 디자인 변주
  const neb = NEBULAE[(look() * NEBULAE.length) | 0];
  const decos = [...DECOS].sort(() => look() - 0.5).slice(0, 2);
  const sparkKinds = [...SPARKS].sort(() => look() - 0.5).slice(0, 2);
  const barStyle = BARS[(look() * BARS.length) | 0];
  const rnd = seeded(codeSeed(data.code) ^ (data.bits * 7919)); // 배치 (매 프레임 같은 순서로 소비)
  const hue = (o = 0) => `hsl(${(t * 60 + o) % 360}, 95%, 70%)`;
  const cx = W / 2, cy = 470;

  // 배경: 우주 + 성운
  ctx.fillStyle = '#03040a';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) {
    const x = rnd() * W, y = rnd() * H, r = 320 + rnd() * 460;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${neb[i % 2]}cc`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const vg = ctx.createRadialGradient(cx, H / 2, H * 0.3, cx, H / 2, H * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `${neb[2]}aa`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(210,220,255,${0.1 + rnd() * 0.5})`;
    const s = rnd() < 0.1 ? 3 : 2;
    ctx.fillRect(rnd() * W, rnd() * H, s, s);
  }

  // 은하 소용돌이 (초월 등급부터)
  if (tier.swirl) {
    const arms = tier.swirl, perArm = 160;
    for (let a = 0; a < arms; a++) {
      for (let k = 0; k < perArm; k++) {
        const r = 30 + k * 3.4;
        const ang = t * 0.35 + (a * Math.PI * 2) / arms + r * 0.011 + (rnd() - 0.5) * 0.35;
        ctx.globalAlpha = 0.25 + 0.6 * (1 - k / perArm);
        ctx.fillStyle = hue(a * 70 + k * 2);
        const s = 3 + (k % 7 === 0 ? 3 : 0);
        ctx.fillRect(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.82, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 빛줄기 (영웅 등급부터)
  if (tier.rays) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.15);
    for (let i = 0; i < tier.rays; i++) {
      ctx.rotate((Math.PI * 2) / tier.rays);
      const g = ctx.createLinearGradient(0, 0, 0, -760);
      g.addColorStop(0, tier.holo ? `hsla(${(t * 60 + i * 40) % 360}, 95%, 70%, 0.55)` : `${tier.color}88`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-34, -760); ctx.lineTo(34, -760); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // 장식 2개
  for (const d of decos) drawDeco(ctx, d, rnd, t, tier, neb);

  // 중심 광채
  const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, 260 + ti * 60);
  halo.addColorStop(0, `${tier.color}${ti >= 3 ? 'aa' : '66'}`);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // 반짝이
  for (let i = 0; i < tier.sparkles; i++) {
    const x = rnd() * W, y = rnd() * H, r = 6 + rnd() * (10 + Math.min(ti, 4) * 7), ph = rnd() * 6.28, sp = 1.5 + rnd() * 3;
    const kind = sparkKinds[i % 2];
    const a = Math.max(0, Math.sin(t * sp + ph));
    if (a < 0.05) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = tier.holo ? hue(i * 23) : i % 3 ? tier.accent : '#ffffff';
    sparkle(ctx, kind, x, y, r * (0.6 + a * 0.6));
  }
  ctx.globalAlpha = 1;

  // 테두리
  let border = tier.color;
  if (tier.holo) {
    border = ctx.createLinearGradient(0, 0, W, H);
    for (let k = 0; k <= 6; k++) border.addColorStop(k / 6, hue(k * 60));
  }
  ctx.save();
  ctx.shadowColor = tier.color;
  ctx.shadowBlur = tier.glow;
  ctx.strokeStyle = border;
  ctx.lineWidth = 10 + ti * 3;
  roundRect(ctx, 30, 30, W - 60, H - 60, 48);
  ctx.stroke();
  ctx.restore();

  // 제목
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 64px ${FONT}`;
  const tg = ctx.createLinearGradient(cx - 300, 0, cx + 300, 0);
  tg.addColorStop(0, '#ffe7a3'); tg.addColorStop(0.55, '#ffb057'); tg.addColorStop(1, '#8ab4ff');
  ctx.fillStyle = tg;
  ctx.fillText('Miracle Sort', cx, 140);

  // 등급 배지
  const badge = `${'★'.repeat(tier.stars)}${'☆'.repeat(MAX_STARS - tier.stars)}  ${tier.name} 등급`;
  ctx.font = `800 34px ${FONT}`;
  const bwid = ctx.measureText(badge).width + 60;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, cx - bwid / 2, 176, bwid, 60, 30);
  ctx.fill();
  ctx.strokeStyle = tier.holo ? border : tier.color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = tier.holo ? hue(200) : tier.accent;
  ctx.fillText(badge, cx, 218);

  // 비트 수
  ctx.save();
  ctx.font = `900 ${String(data.bits).length >= 4 ? 250 : 300}px ${FONT}`;
  if (tier.pulse) {
    const sc = 1 + 0.04 * Math.sin(t * 3.2);
    ctx.translate(cx, cy + 10); ctx.scale(sc, sc); ctx.translate(-cx, -(cy + 10));
  }
  ctx.shadowColor = tier.color;
  ctx.shadowBlur = tier.glow + 20 * Math.abs(Math.sin(t * 2));
  let numFill = '#ffffff';
  if (tier.holo || ti >= 3) {
    numFill = ctx.createLinearGradient(cx - 260, 0, cx + 260, 0);
    if (tier.holo) for (let k = 0; k <= 5; k++) numFill.addColorStop(k / 5, hue(k * 72));
    else { numFill.addColorStop(0, '#fff6c9'); numFill.addColorStop(0.5, tier.color); numFill.addColorStop(1, '#fff6c9'); }
  }
  ctx.fillStyle = numFill;
  ctx.fillText(String(data.bits), cx, cy + 100);
  ctx.restore();
  ctx.font = `800 56px ${FONT}`;
  ctx.fillStyle = tier.accent;
  ctx.fillText('비트', cx, cy + 175);

  // 아래쪽 글자 받침 (성운 색이 살짝 비친다)
  const pg = ctx.createLinearGradient(90, 720, W - 90, 1240);
  pg.addColorStop(0, 'rgba(3, 4, 12, 0.72)'); pg.addColorStop(1, `${neb[2]}cc`);
  ctx.fillStyle = pg;
  roundRect(ctx, 90, 720, W - 180, 520, 36);
  ctx.fill();

  const cap = captionOf({ miracle: true, lg: data.lg });
  ctx.font = `900 72px ${FONT}`;
  ctx.fillStyle = '#7be0a8';
  ctx.fillText('기적 달성!', cx, 790);
  let fs = 52;
  do { ctx.font = `800 ${fs}px ${FONT}`; fs -= 2; } while (ctx.measureText(cap.head).width > W - 160 && fs > 28);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(cap.head, cx, 872);

  // 메모리 막대
  const vals = data.values, n = vals.length;
  const top = 950, bot = 1130, left = 130, right = W - 130;
  const colW = (right - left) / n, barW = Math.min(colW * 0.7, 70);
  for (let i = 0; i < n; i++) {
    const v = vals[i], x = left + (i + 0.5) * colW;
    const hgt = Math.max(6, ((bot - top) * v) / 255);
    const col = tier.holo ? hue(i * 25) : tier.color;
    if (barStyle === 'gradient') {
      const g = ctx.createLinearGradient(0, bot - hgt, 0, bot);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, col);
      ctx.fillStyle = g;
    } else ctx.fillStyle = col;
    ctx.shadowColor = tier.color; ctx.shadowBlur = tier.glow / 3;
    roundRect(ctx, x - barW / 2, bot - hgt, barW, hgt, barStyle === 'capsule' ? barW / 2 : Math.min(10, barW / 3));
    ctx.fill();
    ctx.shadowBlur = 0;
    if (n <= 12) {
      ctx.font = `700 ${n <= 8 ? 30 : 24}px ${FONT}`;
      ctx.fillStyle = '#dbe3f4';
      ctx.fillText(String(v), x, bot - hgt - 12);
    }
  }

  // 멘트
  ctx.font = `700 40px ${FONT}`;
  ctx.fillStyle = tier.accent;
  ctx.fillText(cap.line, cx, 1200);

  // 인증 코드 + 주소
  ctx.font = `700 26px ui-monospace, Menlo, monospace`;
  ctx.fillStyle = 'rgba(219,227,244,0.85)';
  ctx.fillText(`인증 코드 ${data.code ?? '-'}`, cx, H - 92);
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = 'rgba(219,227,244,0.6)';
  ctx.fillText('yigyuwoong-coder.github.io/miracle-sort 에서 코드로 진위 확인', cx, H - 58);

  // 정품인증 도장 (오른쪽 위, 살짝 기울여 찍은 느낌)
  if (data.code) {
    const st = stampCanvas(data.code);
    ctx.save();
    ctx.translate(880, 330);
    ctx.rotate(-0.22 + (codeSeed(data.code) % 100) / 1000);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(st, -135, -135, 270, 270);
    ctx.restore();
  }
}

export function cardBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
