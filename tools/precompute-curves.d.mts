// tools/precompute-curves.mjs 의 타입 선언 (테스트에서 import할 때 사용)
export interface GrowthSpec {
  maxStage: number;
  hp: { base: number; segments: { from: number; rate: number }[] };
  armor: { perStage: number; flatFrom: number; flatPerStage: number };
  reward?: { base: number; perStages: number };
}
export interface CurvesOut {
  version: number;
  source: string;
  maxStage: number;
  hp: number[];
  armorMulBp: number[];
  armorFlat: number[];
}
export const ENEMIES_PATH: string;
export const CURVES_PATH: string;
export function checkGrowth(growth: unknown): string[];
export function computeCurves(growth: GrowthSpec): { curves: CurvesOut; exactHp: number[] };
export function formatCurves(curves: CurvesOut): string;
export function readGrowth(path?: string): GrowthSpec;
