// 피드백 #4: `npm run check`의 `python3 tools/gen_tables.py --check`가 Python 3.11에서
// 3.12 전용 f-string 문법(PEP 701, 같은 따옴표 중첩) 때문에 읽히지 않고 실패했다.
// 설치된 Python 3.11 이상 모두에서 통과하고, 출력 문구가 버전마다 같아야 한다.
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'tools/gen_tables.py');
const VERSIONS = ['3.11', '3.12', '3.13'];

const has = (bin: string): boolean => spawnSync(bin, ['--version']).status === 0;
const available = VERSIONS.map((v) => `python${v}`).filter(has);

const runCheck = (bin: string) =>
  spawnSync(bin, [SCRIPT, '--check'], { cwd: ROOT, encoding: 'utf-8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

describe('tools/gen_tables.py --check: Python 버전 호환 (피드백 #4)', () => {
  it.skipIf(!has('python3.11'))('Python 3.11에서 문법 오류 없이 통과한다', () => {
    const r = runCheck('python3.11');
    expect(r.stderr).not.toContain('SyntaxError');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('✅ 검사 통과');
  });

  it.skipIf(available.length < 2)('설치된 Python 버전마다 출력 문구가 같다', () => {
    const outs = available.map((bin) => {
      const r = runCheck(bin);
      expect(r.status, `${bin}: ${r.stderr}`).toBe(0);
      return r.stdout;
    });
    for (const o of outs) expect(o).toBe(outs[0]);
  });

  it.skipIf(!has('python3.11'))('Python 3.11로 파일 전체를 컴파일할 수 있다', () => {
    expect(() => execFileSync('python3.11', ['-c', `import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())`, SCRIPT])).not.toThrow();
  });
});
