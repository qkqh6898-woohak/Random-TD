/**
 * 캐릭터 외형 데이터 (src/data/characterLooks.json) — 106명 모두 있는지, 타워끼리 겹치지 않는지, 각성 53종, 디자인 시트·게임 데이터와 교차 검사.
 */
import { describe, expect, it } from 'vitest';
import sheet from '../../docs/art/characterArt.json';
import looksJson from '../../src/data/characterLooks.json';
import { DataError, loadGameData } from '../../src/data/load';
import { allLooks, enemyLook, groupOf, hasAwaken, isEnemyLook, parseLooks, personLook, resolveLook, towerLook, type EnemyLook, type HumanLook } from '../../src/art/characters/looks';

/** 녹스 군단 보라 눈 (art/characters/enemies.ts NOX_EYE와 같은 값) */
const NOX_EYE = '#B36BFF';

const data = loadGameData();
const looks = allLooks();
const towers = looks.filter((l): l is HumanLook => !isEnemyLook(l) && l.kind === 'tower');
const enemies = looks.filter((l): l is EnemyLook => isEnemyLook(l));
const people = looks.filter((l): l is HumanLook => !isEnemyLook(l) && l.kind !== 'tower');

describe('캐릭터 외형 데이터: 106명', () => {
  it('타워 65 · 적 32 (하수인 13·대장 14·4천왕 4·군주 1) · 인물 9 (조언자 7·미오·총지휘관)', () => {
    expect(looks).toHaveLength(106);
    expect(towers).toHaveLength(65);
    expect(enemies).toHaveLength(32);
    expect(enemies.filter((e) => e.rank === 'minion')).toHaveLength(13);
    expect(enemies.filter((e) => e.rank === 'captain')).toHaveLength(14);
    expect(enemies.filter((e) => e.rank === 'commander')).toHaveLength(4);
    expect(enemies.filter((e) => e.rank === 'lord')).toHaveLength(1);
    expect(people).toHaveLength(9);
    expect(people.filter((p) => p.kind === 'advisor')).toHaveLength(7);
    expect(personLook('mio')?.item).toBe('drone');
    expect(personLook('commander')?.item).toBe('baton');
  });

  it('디자인 시트(docs/art/characterArt.json)의 106명과 종류·id·이름이 같다', () => {
    const want = new Set(sheet.characters.map((c) => `${groupOf(c.kind as never)}:${c.id}:${c.name}`));
    const got = new Set(looks.map((l) => `${groupOf(l.kind)}:${l.id}:${l.name}`));
    expect(got).toEqual(want);
  });

  it('towers.json 65종 모두 외형이 있고 등급·종족이 같다', () => {
    for (const t of data.towers.towers) {
      const l = towerLook(t.id);
      expect(l, t.id).toBeDefined();
      expect(l?.grade, t.id).toBe(t.grade);
      expect(l?.faction, t.id).toBe(t.faction);
    }
  });

  it('enemies.json의 몹·기본 대장·편성 대장·4천왕·군주 모두 외형이 있다', () => {
    const h = data.enemies.hierarchy as { lord: { id: string }; legions: Record<string, { commander: { id: string }; captains: string[] }> };
    const ids = [...data.enemies.mobs.map((m) => m.id), ...data.enemies.bosses.map((b) => b.id), h.lord.id];
    for (const lg of Object.values(h.legions)) ids.push(lg.commander.id, ...lg.captains);
    for (const id of ids) expect(enemyLook(id), id).toBeDefined();
    // 몹의 군단도 enemies.json과 같다 (그림의 군단 색 강조)
    for (const m of data.enemies.mobs) expect(enemyLook(m.id)?.legion, m.id).toBe(m.legion);
  });
});

describe('타워 65종은 한눈에 구별된다', () => {
  it('(체형 + 머리 장식 + 주 소품 + 주 색) 조합이 서로 겹치지 않는다', () => {
    const seen = new Map<string, string>();
    for (const t of towers) {
      const key = [t.body, t.head, t.prop, t.colors[0]].join('|');
      expect(seen.get(key), `${t.id} = ${seen.get(key)}`).toBeUndefined();
      seen.set(key, t.id);
    }
  });

  it('같은 종족끼리는 주 소품이 모두 다르고, 대기 동작도 거의 다르다', () => {
    const byFaction = new Map<string, HumanLook[]>();
    for (const t of towers) byFaction.set(t.faction, [...(byFaction.get(t.faction) ?? []), t]);
    for (const [f, list] of byFaction) {
      const props = list.map((t) => t.prop);
      expect(new Set(props).size, f).toBe(props.length);
      const idles = new Set(list.map((t) => t.idle));
      expect(idles.size, f).toBeGreaterThanOrEqual(list.length - 1);
    }
  });

  it('라이브러리를 고루 쓴다: 주 소품 60종 이상, 머리 장식 35종 이상, 대기 동작 50종 이상', () => {
    expect(new Set(towers.map((t) => t.prop)).size).toBeGreaterThanOrEqual(60);
    expect(new Set(towers.map((t) => t.head)).size).toBeGreaterThanOrEqual(35);
    expect(new Set(towers.map((t) => t.idle)).size).toBeGreaterThanOrEqual(50);
  });

  it('연합의 고블린·돌 골렘은 초록·금빛 눈, 군단의 암흑 고블린·암흑 골렘은 보라 눈 (ART.md 1.5)', () => {
    const allyEyes = [towerLook('goblin')?.eyeColor, towerLook('stonegolem')?.eyeColor];
    for (const e of allyEyes) {
      expect(e).toBeDefined();
      expect(e?.toUpperCase()).not.toBe(NOX_EYE.toUpperCase());
    }
    expect(enemyLook('goblin')?.eyes ?? 'nox').toBe('nox');
    expect(enemyLook('golem')?.eyes ?? 'nox').toBe('nox');
    // 녹투르만 붉은 눈
    expect(enemies.filter((e) => e.eyes === 'red').map((e) => e.id)).toEqual(['nocturne']);
  });
});

describe('각성 외형 53종', () => {
  it('신·히든을 뺀 각성 외형은 히든 12종을 뺀 53종에만 있다', () => {
    const awakened = towers.filter((t) => hasAwaken(t));
    expect(awakened).toHaveLength(53);
    expect(awakened.every((t) => t.grade !== 'hidden')).toBe(true);
    expect(towers.filter((t) => t.grade === 'hidden' && t.awaken)).toHaveLength(0);
    // 디자인 시트에서 각성 설명이 있는 타워와 같다
    const sheetAwaken = new Set(sheet.characters.filter((c) => c.kind === 'tower' && c.awaken).map((c) => c.id));
    expect(new Set(awakened.map((t) => t.id))).toEqual(sheetAwaken);
  });

  it('각성하면 보이는 값(소품·색·머리 장식·등·오라·동반자 …)이 실제로 바뀐다', () => {
    for (const t of towers.filter((x) => hasAwaken(x))) {
      const a = resolveLook(t, true);
      expect(JSON.stringify(a), t.id).not.toBe(JSON.stringify(t));
      expect(resolveLook(t, false)).toBe(t);
    }
  });
});

describe('외형 데이터 검사 (DataError)', () => {
  const clone = (): { version: number; note: string; characters: Record<string, unknown>[] } => JSON.parse(JSON.stringify(looksJson));

  it('허용 값이 아닌 머리 장식 → 파일 이름 + 필드 경로', () => {
    const raw = clone();
    (raw.characters[0] as Record<string, unknown>).head = 'banana_hat';
    try {
      parseLooks(raw);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataError);
      expect(String(e)).toContain('characterLooks.json');
      expect(String(e)).toContain('characters[0].head');
    }
  });

  it('같은 묶음 안 id 중복, 색 형식, 타워의 필수 소품, 각성에서 못 바꾸는 필드', () => {
    const raw = clone();
    raw.characters[1] = { ...raw.characters[1], id: raw.characters[0]?.id };
    (raw.characters[2] as Record<string, unknown>).skin = 'pink';
    delete (raw.characters[3] as Record<string, unknown>).prop;
    (raw.characters[4] as Record<string, unknown>).awaken = { grade: 'god' };
    expect(() => parseLooks(raw)).toThrow(/id 중복/);
    try {
      parseLooks(raw);
    } catch (e) {
      const msg = String(e);
      expect(msg).toContain('characters[2].skin');
      expect(msg).toContain('characters[3].prop');
      expect(msg).toContain('characters[4].awaken.grade');
    }
  });

  it('타워 고블린과 적 암흑 고블린은 같은 id지만 다른 묶음이라 둘 다 있다', () => {
    expect(towerLook('goblin')?.kind).toBe('tower');
    expect(enemyLook('goblin')?.kind).toBe('mob');
  });
});
