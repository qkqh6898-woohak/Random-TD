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
  /** 초월 강화 Lv → Lv+1 비용 (M5-3). computeCurves 결과에는 없고 computeAll이 붙인다 */
  transcendCost?: number[];
}
export const ENEMIES_PATH: string;
export const CURVES_PATH: string;
export const GAME_PATH: string;
export function decimalFraction(x: number): [bigint, bigint];
export function computeTranscendCost(spec: { costBase: number; costGrowth: number }): number[];
export function readTranscend(path?: string): { costBase: number; costGrowth: number };
export function computeAll(): CurvesOut & { transcendCost: number[] };
export function checkGrowth(growth: unknown): string[];
export function computeCurves(growth: GrowthSpec): { curves: CurvesOut; exactHp: number[] };
export function formatCurves(curves: CurvesOut): string;
export function readGrowth(path?: string): GrowthSpec;
