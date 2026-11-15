/**
 * 기록용 가짜 CanvasRenderingContext2D (Node에서 그림 코드를 돌려 보기 위해).
 * 변환(translate·rotate·scale·save·restore)을 따라가며 경로 점들의 바깥 경계를 모으고, 그리기 명령 수를 센다.
 * 덧붙여 (검토 반영) 칠하기·선 긋기마다 '종류 + 색 + 좌표'를 기록한다(`log`, `fingerprint()`) → 머리 장식·옷 색 같은 값 하나가
 * 실제 그림에 반영되는지 단위 테스트로 잡는다. `solid`는 빛(방사형 그라데이션)을 뺀 실제 칠의 경계.
 */

type M = [number, number, number, number, number, number]; // a b c d e f

function mul(m: M, n: M): M {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class MockCtx {
  private m: M = [1, 0, 0, 1, 0, 0];
  private stack: { m: M; alpha: number }[] = [];
  bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  /** 빛(그라데이션 칠)을 뺀 칠·선의 경계 */
  solid: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  /** 칠하기·선 긋기 기록: 'f|색|알파|좌표…' / 's|색|굵기|알파|좌표…' */
  log: string[] = [];
  /** 지금 경로의 (변환된) 점들 */
  private pathPts: number[] = [];
  draws = 0;
  paths = 0;
  /** 아무 의미 없는 값이 들어가면 기록 (NaN 좌표 등) */
  bad: string[] = [];
  globalAlpha = 1;
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  globalCompositeOperation = 'source-over';
  shadowBlur = 0;
  shadowColor = 'transparent';
  font = '10px sans-serif';
  textAlign = 'start';

  private pt(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this.bad.push(`좌표 ${x},${y}`);
      return;
    }
    const m = this.m;
    const tx = m[0] * x + m[2] * y + m[4];
    const ty = m[1] * x + m[3] * y + m[5];
    this.pathPts.push(tx, ty);
    const b = this.bounds;
    if (tx < b.minX) b.minX = tx;
    if (tx > b.maxX) b.maxX = tx;
    if (ty < b.minY) b.minY = ty;
    if (ty > b.maxY) b.maxY = ty;
  }

  resetBounds(): void {
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  /** 지금 경로를 칠·선으로 기록 (색이 문자열이 아니면 = 그라데이션 빛 → solid 경계에는 넣지 않는다) */
  private commitPath(kind: 'f' | 's'): void {
    const style = kind === 'f' ? this.fillStyle : this.strokeStyle;
    const solid = typeof style === 'string';
    const pts = this.pathPts;
    if (solid) {
      const b = this.solid;
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i] as number;
        const y = pts[i + 1] as number;
        if (x < b.minX) b.minX = x;
        if (x > b.maxX) b.maxX = x;
        if (y < b.minY) b.minY = y;
        if (y > b.maxY) b.maxY = y;
      }
    }
    const col = solid ? (style as string).toUpperCase() : 'grad';
    const coords = pts.map((v) => Math.round(v)).join(',');
    this.log.push(kind === 'f' ? `f|${col}|${this.globalAlpha.toFixed(2)}|${coords}` : `s|${col}|${this.lineWidth}|${this.globalAlpha.toFixed(2)}|${coords}`);
  }

  /** 그린 것 전체의 지문 (같은 그림 = 같은 문자열) */
  fingerprint(): string {
    let h = 2166136261;
    const text = this.log.join('\n');
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `${this.log.length}:${(h >>> 0).toString(16)}`;
  }

  save(): void {
    this.stack.push({ m: [...this.m] as M, alpha: this.globalAlpha });
  }
  restore(): void {
    const s = this.stack.pop();
    if (s) {
      this.m = s.m;
      this.globalAlpha = s.alpha;
    }
  }
  translate(x: number, y: number): void {
    this.m = mul(this.m, [1, 0, 0, 1, x, y]);
  }
  scale(x: number, y: number): void {
    this.m = mul(this.m, [x, 0, 0, y, 0, 0]);
  }
  rotate(a: number): void {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.m = mul(this.m, [c, s, -s, c, 0, 0]);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.m = [a, b, c, d, e, f];
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.m = mul(this.m, [a, b, c, d, e, f]);
  }
  beginPath(): void {
    this.paths++;
    this.pathPts = [];
  }
  closePath(): void {}
  moveTo(x: number, y: number): void {
    this.pt(x, y);
  }
  lineTo(x: number, y: number): void {
    this.pt(x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.pt(cx, cy);
    this.pt(x, y);
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.pt(c1x, c1y);
    this.pt(c2x, c2y);
    this.pt(x, y);
  }
  arc(x: number, y: number, r: number): void {
    if (!(r >= 0)) this.bad.push(`반지름 ${r}`);
    this.pt(x - r, y - r);
    this.pt(x + r, y + r);
    this.pt(x - r, y + r);
    this.pt(x + r, y - r);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot = 0): void {
    if (!(rx >= 0) || !(ry >= 0)) this.bad.push(`타원 반지름 ${rx},${ry}`);
    // 회전한 타원의 바깥 상자 반폭
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const hx = Math.sqrt(rx * rx * c * c + ry * ry * s * s);
    const hy = Math.sqrt(rx * rx * s * s + ry * ry * c * c);
    this.pt(x - hx, y - hy);
    this.pt(x + hx, y + hy);
    this.pt(x - hx, y + hy);
    this.pt(x + hx, y - hy);
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.pt(x, y);
    this.pt(x + w, y + h);
  }
  fill(): void {
    this.draws++;
    this.commitPath('f');
  }
  stroke(): void {
    this.draws++;
    this.commitPath('s');
  }
  clip(): void {}
  fillRect(x: number, y: number, w: number, h: number): void {
    const keep = this.pathPts;
    this.pathPts = [];
    this.rect(x, y, w, h);
    this.draws++;
    this.commitPath('f');
    this.pathPts = keep;
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.fillRect(x, y, w, h);
  }
  clearRect(): void {}
  drawImage(): void {
    this.draws++;
  }
  fillText(): void {
    this.draws++;
  }
  measureText(t: string): { width: number } {
    return { width: t.length * 6 };
  }
  createLinearGradient(): { addColorStop(o: number, c: string): void } {
    return { addColorStop: () => {} };
  }
  createRadialGradient(): { addColorStop(o: number, c: string): void } {
    return { addColorStop: () => {} };
  }
}

/** 그림 코드에 넘길 수 있게 타입을 맞춘다 */
export function mockCtx(): MockCtx & CanvasRenderingContext2D {
  return new MockCtx() as MockCtx & CanvasRenderingContext2D;
}

/**
 * 칠하기 기록(log)으로 대충의 실루엣 면적 격자를 만든다 (N×N, 상자 size 단위): 각 단색 칠 경로를 다각형으로 보고 홀짝 규칙으로 채운다.
 * 곡선은 조절점을 꼭짓점으로, 원은 바깥 상자로 근사한다 — 두 그림의 '몸 모양'이 거의 같은지 비교하기에는 충분하다.
 */
export function silhouetteMask(log: readonly string[], size: number, n = 32): Uint8Array {
  const mask = new Uint8Array(n * n);
  const cell = size / n;
  for (const entry of log) {
    if (!entry.startsWith('f|') || entry.startsWith('f|grad')) continue;
    const pts = (entry.split('|')[3] ?? '').split(',').filter((v) => v !== '').map(Number);
    const k = pts.length / 2;
    if (k < 3) continue;
    for (let gy = 0; gy < n; gy++) {
      const y = (gy + 0.5) * cell;
      const xs: number[] = [];
      for (let i = 0; i < k; i++) {
        const x1 = pts[i * 2] as number;
        const y1 = pts[i * 2 + 1] as number;
        const x2 = pts[((i + 1) % k) * 2] as number;
        const y2 = pts[((i + 1) % k) * 2 + 1] as number;
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let j = 0; j + 1 < xs.length; j += 2) {
        for (let gx = 0; gx < n; gx++) {
          const x = (gx + 0.5) * cell;
          if (x >= (xs[j] as number) && x <= (xs[j + 1] as number)) mask[gy * n + gx] = 1;
        }
      }
    }
  }
  return mask;
}

/** 두 격자의 겹침 비율 (교집합 / 합집합) */
export function maskIoU(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) union++;
    if (a[i] && b[i]) inter++;
  }
  return union === 0 ? 0 : inter / union;
}
