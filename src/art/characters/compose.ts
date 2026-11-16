/**
 * 한 프레임의 캐릭터 조립 (순수 계산): 파츠 배치(rig) + 대기 동작(idleParts) → 그릴 순서와 변환.
 * Phaser(CharacterFigure)와 DOM 갤러리가 같은 결과를 그대로 쓴다 → 게임과 갤러리의 움직임이 같다.
 * 좌표: 그림 단위, 발밑 원점. 몸 전체 반복(떠오르기·흔들기)은 `rig` 변환으로 따로 준다.
 */
import { auraOf, auraRadius, fxOf, type HumanRender } from './draw';
import type { IdleParts, PartXf } from './idle';
import type { AuraId, FxId } from './library';
import type { PartName } from './rig';

export interface DrawOp {
  kind: 'part' | 'aura' | 'fx';
  part?: PartName;
  /** 회전 중심 자리 */
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  alpha: number;
}

export interface Composition {
  /** 몸 전체 추가 변환 (파츠 묶음에 적용) */
  rig: PartXf;
  ops: DrawOp[];
  aura: AuraId;
  /** 오라 그림 반지름 (그림 단위) */
  auraR: number;
  fx: FxId;
}

/** 오라 중심 높이 (발밑 기준) */
export const AURA_Y = -110;

/**
 * @param lean look.lean(몸 기울기)을 쓸지 — 바깥 그림(힉스필드)은 그림 자체 자세가 있으므로 false
 */
export function compose(r: HumanRender, idle: IdleParts, timeMs: number, seed: number, lean = true): Composition {
  const { rig, look } = r;
  const lift = rig.lift;
  const ops: DrawOp[] = [];
  const aura = auraOf(look, r.awakened);
  const auraR = auraRadius(look);
  if (aura !== 'none') {
    const pulse = 1 + 0.05 * Math.sin(timeMs * 0.0035 + seed * 6.283);
    ops.push({ kind: 'aura', x: 0, y: AURA_Y - lift, rot: 0, sx: pulse, sy: pulse, alpha: 0.8 + 0.2 * Math.sin(timeMs * 0.0035 + seed * 6.283) });
  }
  const bodyAlpha = idle.body.alpha;
  for (const part of rig.parts) {
    if (part === 'back' && rig.back) {
      const t = idle.back;
      ops.push({ kind: 'part', part, x: rig.back.x + t.x, y: rig.back.y - lift + t.y, rot: t.rot, sx: t.sx, sy: t.sy, alpha: t.alpha * bodyAlpha });
    } else if (part === 'body') {
      ops.push({ kind: 'part', part, x: 0, y: -lift, rot: 0, sx: 1, sy: 1, alpha: bodyAlpha });
    } else if (part === 'pet' && rig.pet) {
      const t = idle.pet;
      ops.push({ kind: 'part', part, x: rig.pet.x + t.x, y: rig.pet.y - lift + t.y, rot: t.rot, sx: t.sx, sy: t.sy, alpha: t.alpha });
    }
  }
  if (rig.parts.includes('prop')) {
    const t = idle.prop;
    ops.push({ kind: 'part', part: 'prop', x: rig.hand.x + t.x, y: rig.hand.y - lift + t.y, rot: t.rot, sx: t.sx, sy: t.sy, alpha: t.alpha * bodyAlpha });
  }
  const fx = fxOf(look);
  if (fx !== 'none') for (const p of idle.fx) ops.push({ kind: 'fx', x: p.x, y: p.y - lift, rot: 0, sx: p.scale, sy: p.scale, alpha: p.alpha });
  const tilt = lean && look.lean ? (look.lean * Math.PI) / 180 : 0;
  return { rig: tilt !== 0 ? { ...idle.body, rot: idle.body.rot + tilt } : idle.body, ops, aura, auraR, fx };
}
