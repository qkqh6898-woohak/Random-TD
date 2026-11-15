#!/usr/bin/env node
/**
 * 몹 성장 곡선 표 미리 계산 → src/data/curves.json (DEV_PLAN M1-1).
 *
 * sim은 결정성 규칙(CLAUDE.md 2장 2번) 때문에 Math.pow·** 를 쓸 수 없다. 그래서 거듭제곱이 들어가는 체력 곡선은
 * 여기서(도구, 한 번) 계산해 정수 표로 저장하고, sim은 표를 읽기만 한다. 표가 저장소에 들어가므로 기기마다 같은 값이다.
 *
 * 입력: src/data/enemies.json 의 growth (ENEMIES.md 2장, BALANCE.md 1·3장 공식의 숫자)
 *   - hp: HP(1) = base, 구간 from부터 rate배씩. 구간 첫 단계 from > 1이면 앞 구간 끝 값 HP(from-1)이 기준:
 *         HP(s) = HP(from-1) × rate^(s-(from-1)).  첫 구간(from = 1)은 HP(s) = base × rate^(s-1).
 *         → 1~20: 120×1.151^(s-1) / 21~50: HP(20)×1.08^(s-20) / 51~100: HP(50)×1.06^(s-50) / 101~: HP(100)×1.05^(s-100)
 *         기준 값은 반올림하지 않은 실수로 이어 가고, 표에는 마지막에 가장 가까운 정수로 반올림해 넣는다
 *         (BALANCE.md 3장 표가 같은 방식: 5단계 210.6 → 211).
 *   - armor: 방어력·마법 저항 = 기본값 × (1 + perStage × s) + max(0, s − flatFrom) × flatPerStage
 *         → 곱하는 부분은 bp 정수(armorMulBp[s] = 10000 + 200s), 더하는 부분은 armorFlat[s].
 *         sim: mulBp(기본값, armorMulBp[s]) + armorFlat[s] (곱한 뒤 내림)
 *
 * 출력: { version, source, maxStage, hp[0..maxStage], armorMulBp[0..maxStage], armorFlat[0..maxStage], transcendCost[0..] }
 *   - 0단계(준비)에는 몹이 없으므로 hp[0] = 0.
 *   - transcendCost[Lv] (M5-3): 초월 강화 Lv → Lv+1 비용 = ⌊costBase × costGrowth^Lv⌋ (src/data/game.json upgrade.transcend).
 *     costGrowth(1.15)를 십진 분수(115/100)로 바꿔 BigInt로 정확히 계산한다(부동소수 오차로 57,499가 되지 않게).
 *     비용이 안전한 정수(2^53 − 1)를 넘기 직전까지만 싣고, 표 끝 = 초월 최대 레벨.
 *
 * 사용법:  node tools/precompute-curves.mjs           (curves.json 다시 쓰기)
 *          node tools/precompute-curves.mjs --check   (저장된 표가 지금 enemies.json 과 맞는지만 확인, 다르면 종료 코드 1)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ENEMIES_PATH = resolve(ROOT, 'src/data/enemies.json');
export const CURVES_PATH = resolve(ROOT, 'src/data/curves.json');
export const GAME_PATH = resolve(ROOT, 'src/data/game.json');
const BP_ONE = 10000;

/** growth 값 검사. 문제가 있으면 메시지 배열. */
export function checkGrowth(growth) {
  const errors = [];
  if (!growth || typeof growth !== 'object') return ['growth가 없다'];
  const { maxStage, hp, armor } = growth;
  if (!Number.isInteger(maxStage) || maxStage < 1) errors.push(`maxStage는 1 이상 정수 (${maxStage})`);
  if (!hp || !(hp.base > 0)) errors.push('hp.base는 0보다 커야 한다');
  const segs = hp?.segments;
  if (!Array.isArray(segs) || segs.length === 0) errors.push('hp.segments가 비었다');
  else {
    if (segs[0].from !== 1) errors.push(`첫 구간은 1단계부터 (${segs[0].from})`);
    segs.forEach((g, i) => {
      if (!(g.rate > 0)) errors.push(`hp.segments[${i}].rate는 0보다 커야 한다`);
      if (i > 0 && !(g.from > segs[i - 1].from)) errors.push(`hp.segments[${i}].from은 앞 구간보다 커야 한다`);
    });
  }
  if (!armor || typeof armor.perStage !== 'number' || !Number.isInteger(armor.flatFrom) || typeof armor.flatPerStage !== 'number') {
    errors.push('armor { perStage, flatFrom, flatPerStage } 가 필요하다');
  }
  return errors;
}

/** growth → 곡선 표 (실수 HP도 함께, 테스트용). */
export function computeCurves(growth) {
  const errors = checkGrowth(growth);
  if (errors.length > 0) throw new Error(`enemies.json growth 오류: ${errors.join(' / ')}`);
  const { maxStage, hp: hpSpec, armor } = growth;
  const exact = [0];
  let anchorStage = 1;
  let anchorValue = hpSpec.base;
  let rate = hpSpec.segments[0].rate;
  for (let s = 1; s <= maxStage; s++) {
    const seg = hpSpec.segments.find((g) => g.from === s);
    if (seg && s > 1) {
      // 새 구간: 앞 구간 끝 값(실수)이 기준
      anchorStage = s - 1;
      anchorValue = exact[s - 1];
      rate = seg.rate;
    }
    exact[s] = s === 1 ? hpSpec.base : anchorValue * Math.pow(rate, s - anchorStage);
  }
  const hp = exact.map((v, s) => (s === 0 ? 0 : Math.round(v)));
  const armorMulBp = [];
  const armorFlat = [];
  for (let s = 0; s <= maxStage; s++) {
    armorMulBp.push(Math.round(BP_ONE * (1 + armor.perStage * s)));
    armorFlat.push(Math.max(0, s - armor.flatFrom) * armor.flatPerStage);
  }
  for (const [name, arr] of [['hp', hp], ['armorMulBp', armorMulBp], ['armorFlat', armorFlat]]) {
    arr.forEach((v, s) => {
      if (!Number.isSafeInteger(v)) throw new Error(`${name}[${s}] = ${v}: 안전한 정수가 아니다 (maxStage를 줄일 것)`);
    });
  }
  return {
    curves: {
      version: 1,
      source: 'tools/precompute-curves.mjs ← src/data/enemies.json growth + game.json upgrade.transcend. 직접 고치지 말고 도구를 다시 돌린다',
      maxStage,
      hp,
      armorMulBp,
      armorFlat,
    },
    exactHp: exact,
  };
}

/** 십진수 → 분수 [분자, 분모] (BigInt). 1.15 → [115n, 100n]. */
export function decimalFraction(x) {
  if (!(typeof x === 'number' && Number.isFinite(x) && x > 0)) throw new Error(`양수가 아니다: ${x}`);
  const text = String(x);
  if (/e/i.test(text)) throw new Error(`지수 표기는 받지 않는다: ${text}`);
  const [int, frac = ''] = text.split('.');
  let den = 1n;
  for (let i = 0; i < frac.length; i++) den *= 10n;
  return [BigInt(int + frac), den];
}

/**
 * 초월 강화 비용 표 (M5-3): transcendCost[Lv] = ⌊costBase × costGrowth^Lv⌋. 안전한 정수를 넘기 전까지.
 * @param spec game.json upgrade.transcend { costBase, costGrowth }
 */
export function computeTranscendCost(spec) {
  if (!spec || !Number.isSafeInteger(spec.costBase) || spec.costBase < 1) throw new Error('upgrade.transcend.costBase는 1 이상 정수');
  if (!(spec.costGrowth > 1)) throw new Error('upgrade.transcend.costGrowth는 1보다 커야 한다');
  const [num, den] = decimalFraction(spec.costGrowth);
  const out = [];
  let n = BigInt(spec.costBase);
  let d = 1n;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  for (let lv = 0; lv < 1000; lv++) {
    const cost = n / d;
    if (cost > max) break;
    out.push(Number(cost));
    n *= num;
    d *= den;
  }
  return out;
}

/** 표를 저장 형식(JSON 문자열)으로. 배열은 한 줄에 10개씩 끊어 사람이 읽기 쉽게. */
export function formatCurves(curves) {
  const arr = (a) => {
    const lines = [];
    for (let i = 0; i < a.length; i += 10) lines.push(`    ${a.slice(i, i + 10).join(', ')}`);
    return `[\n${lines.join(',\n')}\n  ]`;
  };
  return [
    '{',
    `  "version": ${curves.version},`,
    `  "source": ${JSON.stringify(curves.source)},`,
    `  "maxStage": ${curves.maxStage},`,
    `  "hp": ${arr(curves.hp)},`,
    `  "armorMulBp": ${arr(curves.armorMulBp)},`,
    `  "armorFlat": ${arr(curves.armorFlat)},`,
    `  "transcendCost": ${arr(curves.transcendCost ?? [])}`,
    '}',
    '',
  ].join('\n');
}

export function readGrowth(path = ENEMIES_PATH) {
  return JSON.parse(readFileSync(path, 'utf8')).growth;
}

/** game.json upgrade.transcend (초월 강화 비용 공식). */
export function readTranscend(path = GAME_PATH) {
  return JSON.parse(readFileSync(path, 'utf8')).upgrade?.transcend;
}

/** 저장할 전체 표: 몹 성장 곡선 + 초월 강화 비용. */
export function computeAll() {
  const { curves } = computeCurves(readGrowth());
  return { ...curves, transcendCost: computeTranscendCost(readTranscend()) };
}

function main(argv) {
  const curves = computeAll();
  const text = formatCurves(curves);
  if (argv.includes('--check')) {
    let saved = '';
    try {
      saved = readFileSync(CURVES_PATH, 'utf8');
    } catch {
      saved = '';
    }
    if (saved !== text) {
      console.error('❌ src/data/curves.json 이 enemies.json growth·game.json upgrade.transcend 와 다르다 → node tools/precompute-curves.mjs 로 다시 만든다');
      return 1;
    }
    console.log(`✅ 곡선 표 최신: 단계 0~${curves.maxStage}, HP(1)=${curves.hp[1]}, HP(50)=${curves.hp[50]}, HP(${curves.maxStage})=${curves.hp[curves.maxStage]}, 초월 비용 Lv0~${curves.transcendCost.length - 1}`);
    return 0;
  }
  writeFileSync(CURVES_PATH, text);
  console.log(`📝 src/data/curves.json 저장: 단계 0~${curves.maxStage}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
