// 렌더링 (Canvas 2D)
//  - 입자·소행성 수천 개는 arc()로 하나씩 그리지 않고 픽셀 버퍼(ImageData)에 직접 찍어 한 번에 올린다.
//  - 빠른 배속에서도 한 화면 프레임에 한 번만 그린다 (계산한 스텝마다 그리지 않는다).

import { VIEW_R, BELT_IN, BELT_OUT, SUN_R } from './sim/constants.js';

const rgba = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const PARTICLE = rgba(255, 196, 96);
const ASTEROID = rgba(196, 200, 216);
const ASTEROID_DIM = rgba(110, 114, 128);

export class SkyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.w = this.h = 0;
    this.dpr = 1;
    this.layer = document.createElement('canvas');
    this.lctx = this.layer.getContext('2d');
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.layer.width = Math.max(1, w);
    this.layer.height = Math.max(1, h);
    this.img = this.lctx.createImageData(this.layer.width, this.layer.height);
    this.buf = new Uint32Array(this.img.data.buffer);
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = '#04050a';
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0, n = (c.width * c.height) / 4500; i < n; i++) {
      g.fillStyle = `rgba(200,210,255,${Math.random() * 0.45 + 0.08})`;
      const s = Math.random() < 0.07 ? 2 : 1;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, s, s);
    }
    this.starfield = c;
  }

  get scale() { return (this.zoom * Math.min(this.w, this.h) * 0.46) / VIEW_R; }

  draw(world, astro) {
    const { ctx, dpr, w, h } = this;
    if (!w || !h) return;
    const S = this.scale;
    const cx = w / 2 - this.panX * S, cy = h / 2 + this.panY * S;
    const K = world.planets, B = world.belt, P = world.particles;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.starfield, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 궤도와 소행성대 띠
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(140,160,210,0.13)';
    ctx.beginPath();
    for (const d of K.defs) { ctx.moveTo(cx + d.a * S, cy); ctx.arc(cx, cy, d.a * S, 0, Math.PI * 2); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(150,140,120,0.045)';
    ctx.beginPath();
    ctx.arc(cx, cy, BELT_OUT * S, 0, Math.PI * 2);
    ctx.arc(cx, cy, BELT_IN * S, 0, Math.PI * 2, true);
    ctx.fill();

    // 픽셀 레이어: 소행성 + 입자 (천문 시간 모드에서는 입자를 계산하지 않으므로 그리지 않는다)
    const { buf } = this;
    const LW = this.layer.width, LH = this.layer.height;
    buf.fill(0);
    const ac = astro ? ASTEROID_DIM : ASTEROID;
    for (let i = 0; i < B.n; i++) {
      const s = Math.max(2, Math.round(2 * B.rad[i] * S));
      const sx = ((cx + B.x[i] * S) | 0) - (s >> 1), sy = ((cy - B.y[i] * S) | 0) - (s >> 1);
      if (sx < 0 || sy < 0 || sx + s >= LW || sy + s >= LH) continue;
      for (let dy = 0; dy < s; dy++) {
        const row = (sy + dy) * LW + sx;
        for (let dx = 0; dx < s; dx++) buf[row + dx] = ac;
      }
    }
    if (!astro) {
      const big = this.zoom >= 2.5;
      for (let i = 0; i < P.count; i++) {
        const sx = (cx + P.x[i] * S) | 0, sy = (cy - P.y[i] * S) | 0;
        if (sx < 0 || sy < 0 || sx >= LW - 1 || sy >= LH - 1) continue;
        const o = sy * LW + sx;
        buf[o] = PARTICLE;
        if (big) { buf[o + 1] = PARTICLE; buf[o + LW] = PARTICLE; buf[o + LW + 1] = PARTICLE; }
      }
    }
    this.lctx.putImageData(this.img, 0, 0);
    ctx.drawImage(this.layer, 0, 0, w, h);

    // 태양
    const sr = Math.max(6, SUN_R * S);
    const glow = ctx.createRadialGradient(cx, cy, sr * 0.3, cx, cy, sr * 4);
    glow.addColorStop(0, 'rgba(255,220,120,0.9)');
    glow.addColorStop(0.3, 'rgba(255,170,60,0.25)');
    glow.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, sr * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe6a3';
    ctx.beginPath(); ctx.arc(cx, cy, sr, 0, Math.PI * 2); ctx.fill();

    // 행성
    ctx.font = '600 12px -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    for (let k = 0; k < K.n; k++) {
      const d = K.defs[k];
      const px = cx + K.x[k] * S, py = cy - K.y[k] * S;
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(px, py, Math.max(d.radius * S * 0.75, d.earth ? 5 : 3), 0, Math.PI * 2); ctx.fill();
      if (d.earth) {
        ctx.fillStyle = 'rgba(200,225,255,0.95)';
        ctx.fillText('지구', px, py - Math.max(d.radius * S, 7) - 6);
      }
    }

    // 지구 피격 섬광
    if (!astro) {
      const now = performance.now();
      ctx.lineWidth = 1;
      for (let j = 0; j < world.hitT.length; j++) {
        const age = (now - world.hitT[j]) / 350;
        if (age < 0 || age > 1) continue;
        ctx.strokeStyle = `rgba(255,236,170,${(1 - age) * 0.8})`;
        ctx.beginPath(); ctx.arc(cx + world.hitX[j] * S, cy - world.hitY[j] * S, 2 + age * 7, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  zoomAt(px, py, factor) {
    const S = this.scale;
    const wx = this.panX + (px - this.w / 2) / S, wy = this.panY - (py - this.h / 2) / S;
    this.zoom = Math.min(60, Math.max(0.3, this.zoom * factor));
    const S2 = this.scale;
    this.panX = wx - (px - this.w / 2) / S2;
    this.panY = wy + (py - this.h / 2) / S2;
  }
  panBy(dx, dy) { this.panX -= dx / this.scale; this.panY += dy / this.scale; }
  resetView() { this.zoom = 1; this.panX = 0; this.panY = 0; }
}

// 메모리: 원소마다 값 막대 + 8비트. 방금 뒤집힌 비트는 금색 테두리, 정렬되면 모두 초록색.
export class MemoryRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.seen = 0;
    this.flashAt = -1e9;
  }

  draw(mem) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(ch * dpr)) {
      this.canvas.width = Math.round(cw * dpr);
      this.canvas.height = Math.round(ch * dpr);
    }
    const ctx = this.ctx;
    const now = performance.now();
    if (mem.flips !== this.seen) { this.seen = mem.flips; this.flashAt = now; }
    const flash = Math.max(0, 1 - (now - this.flashAt) / 600);
    const { a, n } = mem;
    const sorted = mem.descents === 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#080a12';
    ctx.fillRect(0, 0, cw, ch);
    const colW = cw / n;
    const bitW = Math.max(4, Math.min(12, (colW - 12) / 8));
    const top = 20, bot = ch - 36;
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const mid = (i + 0.5) * colW, v = a[i];
      const bw = Math.min(colW * 0.6, 64);
      const bh = Math.max(2, ((bot - top) * v) / 255);
      const bad = (i > 0 && a[i - 1] > v) || (i + 1 < n && v > a[i + 1]);
      ctx.fillStyle = sorted ? '#7be0a8' : bad ? '#e8736f' : '#5aa9ff';
      ctx.fillRect(mid - bw / 2, bot - bh, bw, bh);
      ctx.fillStyle = '#dbe3f4';
      ctx.font = '600 12px ui-monospace, Menlo, monospace';
      ctx.fillText(String(v), mid, bot - bh - 5);
      const bx0 = mid - (bitW * 8) / 2;
      for (let b = 7; b >= 0; b--) {
        const bx = bx0 + (7 - b) * bitW;
        ctx.fillStyle = (v >> b) & 1 ? '#c9d6f5' : '#1b2236';
        ctx.fillRect(bx + 0.5, bot + 8, bitW - 1, 11);
        if (flash > 0 && i === mem.lastIdx && b === mem.lastBit) {
          ctx.strokeStyle = `rgba(255,215,106,${0.3 + flash * 0.7})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(bx - 0.5, bot + 7, bitW + 1, 13);
        }
      }
      if (i + 1 < n && v > a[i + 1]) {
        ctx.fillStyle = '#e8736f';
        ctx.font = '700 13px ui-monospace, Menlo, monospace';
        ctx.fillText('>', (i + 1) * colW, top + 2);
      }
    }
  }
}
