/**
 * 피드백 #64 '일꾼 수 안보이는 버그': 아래 자원 줄의 👷 일꾼 수가 [⬆ 승급 가능]·접은 카드 알약이 보이면 CSS로 숨겨졌다.
 * 일꾼 수를 숨기는 CSS 규칙이 없어야 한다 (화면 검사는 e2e/fb64).
 * 판 기록 JSON이 없는 화면(CSS)만의 버그라 리플레이 재현 대상은 없다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = ['styles.css', 'feedback-design.css', 'theme.css'];

/** `선택자 { 내용 }` 덩어리 (주석 뺌, 한 단계 중첩 @media 안도 잡힌다) */
function rules(css: string): { sel: string; body: string }[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
}

describe('피드백 #64 일꾼 수는 늘 보인다', () => {
  it('.hud-workers(일꾼 수)를 display: none으로 숨기는 규칙이 없다', () => {
    const hiding: string[] = [];
    for (const f of files) {
      const css = readFileSync(new URL(`../../src/ui/${f}`, import.meta.url), 'utf8');
      for (const r of rules(css)) {
        const targetsWorkers = r.sel.split(',').some((s) => /\.hud-workers\s*$/.test(s.trim()));
        if (targetsWorkers && /display\s*:\s*none/.test(r.body)) hiding.push(`${f}: ${r.sel}`);
      }
    }
    expect(hiding).toEqual([]);
  });
});
