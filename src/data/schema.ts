/**
 * 아주 작은 JSON 스키마 검사기 (외부 라이브러리 없음).
 *
 * 필수 필드·타입·허용 값·정수 여부·범위를 검사하고, 문제마다 **필드 경로**(예: `towers[3].aps`)를 남긴다.
 * 데이터 파일이 잘못되면 게임을 시작하기 전에 어느 파일의 어느 필드인지 바로 알 수 있게 하는 것이 목적이다.
 */

export interface Issue {
  /** 필드 경로. 예: `towers[3].aps` (최상위면 빈 문자열) */
  path: string;
  message: string;
  /** 문제가 있는 파일 (여러 파일을 한꺼번에 보고할 때) */
  file?: string;
}

interface Common {
  /** 추가 의미 검사. 문제가 있으면 메시지, 없으면 null. */
  check?: (value: never, path: string, issues: Issue[]) => void;
}

export type Schema =
  | (Common & { kind: 'string'; enum?: readonly string[]; nonEmpty?: boolean })
  | (Common & { kind: 'number'; integer?: boolean; min?: number; max?: number })
  | (Common & { kind: 'boolean' })
  | (Common & { kind: 'array'; items: Schema; minLength?: number; maxLength?: number; uniqueBy?: string })
  | (Common & { kind: 'tuple'; items: readonly Schema[] })
  | (Common & { kind: 'object'; fields: Readonly<Record<string, Schema>> })
  | (Common & { kind: 'record'; values: Schema; keyPattern?: RegExp })
  | (Common & { kind: 'nullable'; inner: Schema })
  | (Common & { kind: 'optional'; inner: Schema })
  | (Common & { kind: 'oneOf'; options: readonly Schema[]; label: string })
  | (Common & { kind: 'any' });

/** 스키마 만들기 도우미. */
export const s = {
  str: (opts: { enum?: readonly string[]; nonEmpty?: boolean } = {}): Schema => ({ kind: 'string', ...opts }),
  num: (opts: { min?: number; max?: number } = {}): Schema => ({ kind: 'number', ...opts }),
  int: (opts: { min?: number; max?: number } = {}): Schema => ({ kind: 'number', integer: true, ...opts }),
  bool: (): Schema => ({ kind: 'boolean' }),
  arr: (items: Schema, opts: { minLength?: number; maxLength?: number; uniqueBy?: string } = {}): Schema => ({
    kind: 'array',
    items,
    ...opts,
  }),
  tuple: (...items: Schema[]): Schema => ({ kind: 'tuple', items }),
  obj: (fields: Record<string, Schema>): Schema => ({ kind: 'object', fields }),
  rec: (values: Schema, keyPattern?: RegExp): Schema =>
    keyPattern ? { kind: 'record', values, keyPattern } : { kind: 'record', values },
  nullable: (inner: Schema): Schema => ({ kind: 'nullable', inner }),
  opt: (inner: Schema): Schema => ({ kind: 'optional', inner }),
  oneOf: (label: string, ...options: Schema[]): Schema => ({ kind: 'oneOf', options, label }),
  any: (): Schema => ({ kind: 'any' }),
  /** 스키마에 의미 검사 추가. */
  withCheck: <T>(schema: Schema, check: (value: T, path: string, issues: Issue[]) => void): Schema =>
    ({ ...schema, check: check as Common['check'] }) as Schema,
};

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '배열';
  if (typeof v === 'string') return `문자열 ${JSON.stringify(v.length > 30 ? `${v.slice(0, 30)}…` : v)}`;
  if (typeof v === 'number') return `숫자 ${v}`;
  if (typeof v === 'boolean') return `불리언 ${v}`;
  if (typeof v === 'object') return '객체';
  return typeof v;
}

const KIND_NAME: Record<string, string> = {
  string: '문자열',
  number: '숫자',
  boolean: '불리언',
  array: '배열',
  tuple: '배열',
  object: '객체',
  record: '객체',
};

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 값을 검사해 문제 목록에 추가한다. 반환값: 이 값이 타입 검사를 통과했는지. */
export function validate(value: unknown, schema: Schema, path: string, issues: Issue[]): boolean {
  const before = issues.length;
  switch (schema.kind) {
    case 'any':
      break;
    case 'optional':
      if (value !== undefined) validate(value, schema.inner, path, issues);
      break;
    case 'nullable':
      if (value !== null) validate(value, schema.inner, path, issues);
      break;
    case 'oneOf': {
      const ok = schema.options.some((opt) => validate(value, opt, path, []));
      if (!ok) issues.push({ path, message: `${schema.label} 형식이어야 하는데 ${describe(value)}` });
      else {
        // 통과한 첫 옵션으로 다시 검사해 의미 검사까지 적용
        const opt = schema.options.find((o) => validate(value, o, path, []));
        if (opt) validate(value, opt, path, issues);
      }
      break;
    }
    case 'string':
      if (typeof value !== 'string') {
        issues.push({ path, message: `${KIND_NAME.string}이어야 하는데 ${describe(value)}` });
        break;
      }
      if (schema.nonEmpty && value.length === 0) issues.push({ path, message: '빈 문자열이면 안 된다' });
      if (schema.enum && !schema.enum.includes(value)) {
        issues.push({ path, message: `허용 값(${schema.enum.join(', ')})이 아님: ${JSON.stringify(value)}` });
      }
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ path, message: `${schema.integer ? '정수' : KIND_NAME.number}여야 하는데 ${describe(value)}` });
        break;
      }
      if (schema.integer && !Number.isInteger(value)) issues.push({ path, message: `정수여야 하는데 ${value}` });
      if (schema.min !== undefined && value < schema.min) issues.push({ path, message: `${schema.min} 이상이어야 하는데 ${value}` });
      if (schema.max !== undefined && value > schema.max) issues.push({ path, message: `${schema.max} 이하여야 하는데 ${value}` });
      break;
    case 'boolean':
      if (typeof value !== 'boolean') issues.push({ path, message: `${KIND_NAME.boolean}이어야 하는데 ${describe(value)}` });
      break;
    case 'array': {
      if (!Array.isArray(value)) {
        issues.push({ path, message: `${KIND_NAME.array}이어야 하는데 ${describe(value)}` });
        break;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        issues.push({ path, message: `항목이 ${schema.minLength}개 이상이어야 하는데 ${value.length}개` });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        issues.push({ path, message: `항목이 ${schema.maxLength}개 이하여야 하는데 ${value.length}개` });
      }
      value.forEach((item, i) => validate(item, schema.items, `${path}[${i}]`, issues));
      if (schema.uniqueBy) {
        const key = schema.uniqueBy;
        const seen = new Map<unknown, number>();
        value.forEach((item, i) => {
          if (!isPlainObject(item)) return;
          const k = item[key];
          if (k === undefined) return;
          const first = seen.get(k);
          if (first !== undefined) {
            issues.push({ path: `${path}[${i}].${key}`, message: `${key} 중복: ${JSON.stringify(k)} (처음: ${path}[${first}])` });
          } else seen.set(k, i);
        });
      }
      break;
    }
    case 'tuple':
      if (!Array.isArray(value)) {
        issues.push({ path, message: `길이 ${schema.items.length} ${KIND_NAME.tuple}이어야 하는데 ${describe(value)}` });
        break;
      }
      if (value.length !== schema.items.length) {
        issues.push({ path, message: `항목이 정확히 ${schema.items.length}개여야 하는데 ${value.length}개` });
        break;
      }
      schema.items.forEach((itemSchema, i) => validate(value[i], itemSchema, `${path}[${i}]`, issues));
      break;
    case 'object':
      if (!isPlainObject(value)) {
        issues.push({ path, message: `${KIND_NAME.object}여야 하는데 ${describe(value)}` });
        break;
      }
      for (const [key, fieldSchema] of Object.entries(schema.fields)) {
        const fieldPath = join(path, key);
        if (!(key in value) || value[key] === undefined) {
          if (fieldSchema.kind !== 'optional') issues.push({ path: fieldPath, message: '필수 필드가 없다' });
          continue;
        }
        validate(value[key], fieldSchema, fieldPath, issues);
      }
      break;
    case 'record':
      if (!isPlainObject(value)) {
        issues.push({ path, message: `${KIND_NAME.record}여야 하는데 ${describe(value)}` });
        break;
      }
      for (const [key, v] of Object.entries(value)) {
        if (schema.keyPattern && !schema.keyPattern.test(key)) {
          issues.push({ path: join(path, key), message: `키 형식이 맞지 않음 (${String(schema.keyPattern)})` });
        }
        validate(v, schema.values, join(path, key), issues);
      }
      break;
  }
  const typeOk = issues.length === before;
  if (typeOk && schema.check) (schema.check as (v: unknown, p: string, i: Issue[]) => void)(value, path, issues);
  return typeOk;
}
