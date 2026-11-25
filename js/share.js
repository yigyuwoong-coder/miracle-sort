// 결과 카드: 비트 수가 클수록 등급이 오르고 더 번쩍번쩍 빛난다.
// 미리보기에서는 반짝임이 움직이고, 저장·공유할 때는 그 순간의 한 장면을 PNG로 만든다.
import { fmtYearsLg, compareYearsLg } from './format.js';

export const W = 1080, H = 1350; // 4:5 (인스타그램·카카오톡에 알맞은 세로 비율)

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

// 공유 문구
// lg = 걸린 시간의 log10 (년). 10^500년처럼 실수로 담을 수 없는 값도 표현한다
export function captionOf({ miracle, lg }) {
  const y = fmtYearsLg(lg);
  return miracle
    ? { head: `${y} 만에 저절로 정렬!`, line: compareYearsLg(lg) }
    : { head: `${y}째 기다리는 중`, line: '태양 입자가 비트를 뒤집어 주길 기다린다' };
}

export function shareText({ bits, miracle, lg }, url) {
  const c = captionOf({ miracle, lg });
  const tier = tierOf(bits);
  return miracle
    ? `✨ Miracle Sort [${tier.name}] ✨\n${bits}비트 메모리가 ${fmtYearsLg(lg)} 만에 저절로 정렬됐다!\n(${c.line})\n${url}`
    : `⏳ Miracle Sort\n${bits}비트 메모리가 정렬되길 ${fmtYearsLg(lg)}째 기다리는 중…\n${url}`;
}

// 비트 수로 정해지는 난수 (같은 비트 수면 같은 별·반짝이 배치)
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FONT = '-apple-system, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif';

function star4(ctx, x, y, r) { // 네 갈래 반짝이
  const k = r * 0.22;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [''];
  for (const w of words) {
    const test = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
    if (ctx.measureText(test).width > maxW && lines[lines.length - 1]) lines.push(w);
    else lines[lines.length - 1] = test;
  }
  return lines;
}

// data = { bits, miracle, lg, values: number[] }, t = 초 (반짝임 애니메이션)
export function drawCard(canvas, data, t = 0) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tier = tierOf(data.bits);
  const ti = TIERS.indexOf(tier);
  const rnd = seeded(data.bits * 7919);
  const hue = (o = 0) => `hsl(${(t * 60 + o) % 360}, 95%, 70%)`;

  // 배경: 우주
  const bg = ctx.createRadialGradient(W / 2, H * 0.36, 40, W / 2, H * 0.5, H * 0.85);
  bg.addColorStop(0, tier.holo ? '#2a0f3a' : '#141a33');
  bg.addColorStop(1, '#03040a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(210,220,255,${0.1 + rnd() * 0.5})`;
    ctx.fillRect(rnd() * W, rnd() * H, rnd() < 0.1 ? 3 : 2, rnd() < 0.1 ? 3 : 2);
  }

  const cx = W / 2, cy = 470;

  // 은하 소용돌이 (초월 등급부터): 나선 팔을 따라 별이 돈다
  if (tier.swirl) {
    const arms = tier.swirl, perArm = 160;
    for (let a = 0; a < arms; a++) {
      for (let k = 0; k < perArm; k++) {
        const r = 30 + k * 3.4;
        const ang = t * 0.35 + (a * Math.PI * 2) / arms + r * 0.011 + (rnd() - 0.5) * 0.35;
        const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.82;
        ctx.globalAlpha = 0.25 + 0.6 * (1 - k / perArm);
        ctx.fillStyle = hue(a * 70 + k * 2);
        ctx.fillRect(x, y, 3 + (k % 7 === 0 ? 3 : 0), 3 + (k % 7 === 0 ? 3 : 0));
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
      g.addColorStop(0, tier.holo ? hue(i * 40).replace('70%)', '70%, 0.55)').replace('hsl', 'hsla') : `${tier.color}88`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-34, -760);
      ctx.lineTo(34, -760);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 중심 광채
  const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, 260 + ti * 60);
  halo.addColorStop(0, `${tier.color}${ti >= 3 ? 'aa' : '66'}`);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // 반짝이
  for (let i = 0; i < tier.sparkles; i++) {
    const x = rnd() * W, y = rnd() * H, r = 6 + rnd() * (10 + Math.min(ti, 4) * 7), ph = rnd() * 6.28, sp = 1.5 + rnd() * 3;
    const a = Math.max(0, Math.sin(t * sp + ph));
    if (a < 0.05) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = tier.holo ? hue(i * 23) : rnd() < 0.5 ? tier.accent : '#ffffff';
    star4(ctx, x, y, r * (0.6 + a * 0.6));
  }
  ctx.globalAlpha = 1;

  // 테두리
  const bw = 10 + ti * 3;
  let border = tier.color;
  if (tier.holo) {
    border = ctx.createLinearGradient(0, 0, W, H);
    for (let k = 0; k <= 6; k++) border.addColorStop(k / 6, hue(k * 60));
  }
  ctx.save();
  ctx.shadowColor = tier.color;
  ctx.shadowBlur = tier.glow;
  ctx.strokeStyle = border;
  ctx.lineWidth = bw;
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

  // 비트 수 (가장 크게)
  ctx.save();
  const digits = String(data.bits).length;
  ctx.font = `900 ${digits >= 4 ? 250 : 300}px ${FONT}`;
  if (tier.pulse) { // 우주 등급: 숫자가 두근거린다
    const sc = 1 + 0.04 * Math.sin(t * 3.2);
    ctx.translate(cx, cy + 10);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -(cy + 10));
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

  // 아래쪽 글자가 반짝이에 묻히지 않도록 어두운 받침
  ctx.fillStyle = 'rgba(3, 4, 12, 0.55)';
  roundRect(ctx, 90, 720, W - 180, 545, 36);
  ctx.fill();

  // 상태 + 연도
  const cap = captionOf(data);
  ctx.font = `900 72px ${FONT}`;
  ctx.fillStyle = data.miracle ? '#7be0a8' : '#dbe3f4';
  ctx.fillText(data.miracle ? '기적 달성!' : '정렬 대기 중', cx, 790);
  let fs = 52; // 한 줄에 들어갈 때까지 줄인다
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
    const bad = !data.miracle && ((i > 0 && vals[i - 1] > v) || (i + 1 < n && v > vals[i + 1]));
    ctx.fillStyle = data.miracle ? (tier.holo ? hue(i * 25) : tier.color) : bad ? '#e8736f' : '#5aa9ff';
    if (data.miracle) { ctx.shadowColor = tier.color; ctx.shadowBlur = tier.glow / 3; }
    roundRect(ctx, x - barW / 2, bot - hgt, barW, hgt, Math.min(10, barW / 3));
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
  for (const [i, l] of wrap(ctx, cap.line, W - 200).entries()) ctx.fillText(l, cx, 1200 + i * 50);

  // 주소
  ctx.font = `600 28px ${FONT}`;
  ctx.fillStyle = 'rgba(219,227,244,0.65)';
  ctx.fillText('yigyuwoong-coder.github.io/miracle-sort', cx, H - 66);
}

export function cardBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
