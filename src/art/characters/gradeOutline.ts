import type { Grade } from '../../data/load';
import { COLORS, GRADE_COLORS } from '../palette';

/** 등급 띠는 받침대/배지와 같은 색. 신화의 검은 면은 금색 테두리로 구별한다. */
export function gradeOutlineColor(grade: Grade): string {
  return grade === 'hidden' ? COLORS.hiddenRim : GRADE_COLORS[grade];
}

export interface OutlinedArt { canvas: HTMLCanvasElement; pad: number; w: number; h: number }
const cache = new WeakMap<object, Map<Grade | undefined, OutlinedArt>>();

/** 알파 실루엣 바깥에만 등급 띠를 그린다. 원본 색·진갈색 선과 발밑은 유지한다. */
export function outlinedArt(source: CanvasImageSource, w: number, h: number, grade?: Grade, retain = true): OutlinedArt {
  let entries = retain ? cache.get(source) : undefined;
  if (retain && !entries) { entries = new Map(); cache.set(source, entries); }
  const old = entries?.get(grade);
  if (old) return old;
  const line = Math.max(2, Math.round(h * 0.022));
  const pad = line + Math.max(2, Math.round(h * (grade ? 0.028 : 0.012)));
  const canvas = document.createElement('canvas');
  canvas.width = w + pad * 2; canvas.height = h + pad * 2;
  const mask = document.createElement('canvas');
  mask.width = w; mask.height = h;
  const g = canvas.getContext('2d'); const sg = mask.getContext('2d');
  if (!g || !sg) throw new Error('캐릭터 테두리 캔버스를 만들 수 없다');
  const ring = (color: string, radius: number): void => {
    sg.globalCompositeOperation = 'copy'; sg.drawImage(source, 0, 0, w, h);
    sg.globalCompositeOperation = 'source-in'; sg.fillStyle = color; sg.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      g.drawImage(mask, pad + Math.cos(a) * radius, pad + Math.sin(a) * radius);
    }
  };
  ring(grade ? gradeOutlineColor(grade) : 'rgba(255,244,214,0.5)', pad);
  ring('rgba(40,24,14,0.9)', line);
  g.drawImage(source, pad, pad, w, h);
  const result = { canvas, pad, w, h };
  entries?.set(grade, result);
  return result;
}
