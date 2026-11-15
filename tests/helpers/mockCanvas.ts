/**
 * 기록용 가짜 CanvasRenderingContext2D (Node에서 그림 코드를 돌려 보기 위해).
 * 변환(translate·rotate·scale·save·restore)을 따라가며 경로 점들의 바깥 경계를 모으고, 그리기 명령 수를 센다.
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
    const b = this.bounds;
    if (tx < b.minX) b.minX = tx;
    if (tx > b.maxX) b.maxX = tx;
    if (ty < b.minY) b.minY = ty;
    if (ty > b.maxY) b.maxY = ty;
  }

  resetBounds(): void {
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
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
  }
  stroke(): void {
    this.draws++;
  }
  clip(): void {}
  fillRect(x: number, y: number, w: number, h: number): void {
    this.rect(x, y, w, h);
    this.draws++;
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
