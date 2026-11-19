/**
 * V2 검토 L9: 갈래·PR CI(ci.yml)가 자바 검사(android/check-java.sh)를 돌리지 않고 액션을 태그(@v4)로만 가리키던 것.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '..', '..', '.github', 'workflows');
const ci = readFileSync(join(dir, 'ci.yml'), 'utf8');

describe('L9 CI', () => {
  it('ci.yml은 setup-java 뒤 android/check-java.sh를 돌린다', () => {
    expect(ci).toMatch(/uses: actions\/setup-java@/);
    expect(ci).toContain('run: bash android/check-java.sh');
    expect(ci.indexOf('actions/setup-java@')).toBeLessThan(ci.indexOf('android/check-java.sh'));
  });

  it('ci.yml·android.yml의 액션은 모두 40자리 커밋 SHA로 고정', () => {
    for (const f of ['ci.yml', 'android.yml']) {
      const text = readFileSync(join(dir, f), 'utf8');
      const uses = [...text.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]!);
      expect(uses.length, f).toBeGreaterThan(0);
      for (const u of uses) expect(u, `${f}: ${u}`).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  });
});
