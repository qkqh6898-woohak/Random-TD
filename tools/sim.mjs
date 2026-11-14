#!/usr/bin/env node
/**
 * 헤드리스 밸런스 시뮬레이터 자리 (M11-6에서 구현).
 * 예정 사용법: npm run sim -- --seed 1 --deck base --mode infinite --bot greedy
 */
console.log('npm run sim: 헤드리스 봇 시뮬레이터는 M11에서 구현됩니다 (docs/DEV_PLAN.md M11-6).');
console.log(`받은 인자: ${process.argv.slice(2).join(' ') || '(없음)'}`);
