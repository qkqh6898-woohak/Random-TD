/**
 * HF-2 그림 단계: 전투 배경 밴드 고르기, 보스 컷인 id, 타워 캐릭터 설명(lore·role) 데이터·패널·카드 글자,
 * 캐릭터별 화면 크기(looks scale), 바깥 그림 배율(칸 너비 제한 없음), 타이틀 그림 고르기.
 */
import { describe, expect, it } from 'vitest';
import { DataError, buildGameData, bundledRawData, loadGameData, towersSchema, type RawGameData } from '../../src/data/load';
import { validate, type Issue } from '../../src/data/schema';
import { backgroundBand, backgroundPath, backgroundTextureKey, coverScale, pickTitleArt, sameBand, titleArtPath, upcomingBand } from '../../src/view/artBand';
import { bossCutinId, cutinPath } from '../../src/ui/cutin/BossCutin';
import { allLooks, enemyLook, isEnemyLook, lookScale, towerLook, LOOK_SCALE_MAX, LOOK_SCALE_MIN, parseLooks } from '../../src/art/characters/looks';
import { EXTERNAL_FIGURE_UNITS, externalFigureScale } from '../../src/art/characters/external';
import { towerFigureSpanTiles } from '../../src/view/render/towerGeom';
import { buildTowerPanelModel } from '../../src/ui/panels/towerPanelModel';
import { characterCardModel } from '../../src/ui/panels/characterCardModel';
import { createMatch } from '../../src/sim/match';
import { NO_MODS, effectiveStats } from '../../src/sim/stats';
import looksJson from '../../src/data/characterLooks.json';

const data = loadGameData();
const art = data.game.art;

describe('전투 배경 밴드 (game.json art)', () => {
  it('설정 값', () => {
    expect(art).toMatchObject({ bandStages: 10, bands: 5, infiniteThemeStages: 50, themes: 10 });
  });

  it('캠페인: 테마 = 캠페인 테마, 밴드 = 10단계마다, 5에서 멈춤', () => {
    expect(backgroundBand(art, 'campaign', 1, 3)).toEqual({ theme: 3, band: 1 });
    expect(backgroundBand(art, 'campaign', 10, 3)).toEqual({ theme: 3, band: 1 });
    expect(backgroundBand(art, 'campaign', 11, 3)).toEqual({ theme: 3, band: 2 });
    expect(backgroundBand(art, 'campaign', 25, 7)).toEqual({ theme: 7, band: 3 });
    expect(backgroundBand(art, 'campaign', 50, 10)).toEqual({ theme: 10, band: 5 });
    expect(backgroundBand(art, 'campaign', 60, 1)).toEqual({ theme: 1, band: 5 });
    // 준비 시간(0단계) = 1단계, 테마 범위 밖은 자름
    expect(backgroundBand(art, 'campaign', 0, 0)).toEqual({ theme: 1, band: 1 });
    expect(backgroundBand(art, 'campaign', 5, 99)).toEqual({ theme: 10, band: 1 });
  });

  it('무한: 50단계마다 다음 테마(10개 순환), 그 안에서 10단계마다 밴드', () => {
    expect(backgroundBand(art, 'infinite', 0, 0)).toEqual({ theme: 1, band: 1 });
    expect(backgroundBand(art, 'infinite', 1, 0)).toEqual({ theme: 1, band: 1 });
    expect(backgroundBand(art, 'infinite', 11, 0)).toEqual({ theme: 1, band: 2 });
    expect(backgroundBand(art, 'infinite', 25, 0)).toEqual({ theme: 1, band: 3 });
    expect(backgroundBand(art, 'infinite', 45, 0)).toEqual({ theme: 1, band: 5 });
    expect(backgroundBand(art, 'infinite', 50, 0)).toEqual({ theme: 1, band: 5 });
    expect(backgroundBand(art, 'infinite', 51, 0)).toEqual({ theme: 2, band: 1 });
    expect(backgroundBand(art, 'infinite', 55, 0)).toEqual({ theme: 2, band: 1 });
    expect(backgroundBand(art, 'infinite', 499, 0)).toEqual({ theme: 10, band: 5 });
    expect(backgroundBand(art, 'infinite', 501, 0)).toEqual({ theme: 1, band: 1 });
  });

  it('미리 받기: 밴드가 끝나기 preloadStages단계 전부터 다음 배경', () => {
    const cfg = { ...art, preloadStages: 2 };
    expect(upcomingBand(cfg, 'infinite', 7, 0)).toBeNull();
    expect(upcomingBand(cfg, 'infinite', 8, 0)).toBeNull(); // 8 + 2 = 10 → 아직 밴드 1
    expect(upcomingBand(cfg, 'infinite', 9, 0)).toEqual({ theme: 1, band: 2 });
    expect(upcomingBand(cfg, 'infinite', 49, 0)).toEqual({ theme: 2, band: 1 });
    expect(upcomingBand(cfg, 'campaign', 49, 4)).toBeNull(); // 캠페인 50단계 뒤는 같은 밴드
    expect(upcomingBand({ ...cfg, preloadStages: 0 }, 'infinite', 9, 0)).toBeNull();
  });

  it('파일 경로·텍스처 키·덮기 배율', () => {
    expect(backgroundPath({ theme: 1, band: 2 })).toBe('assets/backgrounds/bg_t01_b2.webp');
    expect(backgroundPath({ theme: 10, band: 5 })).toBe('assets/backgrounds/bg_t10_b5.webp');
    expect(backgroundTextureKey({ theme: 3, band: 4 })).toBe('bg-t03-b4');
    expect(sameBand({ theme: 1, band: 1 }, { theme: 1, band: 1 })).toBe(true);
    expect(sameBand({ theme: 1, band: 1 }, null)).toBe(false);
    // 720×1280 → 1080×1920 = 1.5배 (같은 9:16), 넓은 그림은 높이에 맞춰 옆이 잘림
    expect(coverScale(720, 1280, 1080, 1920)).toBeCloseTo(1.5);
    expect(coverScale(2000, 1000, 1080, 1920)).toBeCloseTo(1.92);
    expect(coverScale(0, 0, 1080, 1920)).toBe(1);
  });

  it('타이틀 그림: 1~n 중 하나, 0이면 없음', () => {
    expect(pickTitleArt(2, 0)).toBe(1);
    expect(pickTitleArt(2, 0.49)).toBe(1);
    expect(pickTitleArt(2, 0.5)).toBe(2);
    expect(pickTitleArt(2, 0.9999)).toBe(2);
    expect(pickTitleArt(0, 0.3)).toBeNull();
    expect(titleArtPath(2)).toBe('assets/title/title_keyart_2.webp');
  });
});

describe('보스 컷인 id (game.json art.cutins)', () => {
  it('무한 모드 기본 보스 5종 모두 컷인 그림이 있다', () => {
    for (const b of data.enemies.bosses) expect(bossCutinId(b.id, art.cutins)).toBe(b.id);
  });

  it('목록에 없는 보스(도전 보스 등)는 null', () => {
    expect(bossCutinId('goldslime', art.cutins)).toBeNull();
    expect(bossCutinId('', art.cutins)).toBeNull();
    expect(cutinPath('nox')).toBe('assets/cutins/cutin_nox.webp');
  });

  it('컷인 19종: 대장 14 + 4천왕 4 + 군주', () => {
    expect(art.cutins).toHaveLength(19);
    expect(new Set(art.cutins).size).toBe(19);
    expect(art.cutins).toEqual(expect.arrayContaining(['zephira', 'gordam', 'morgath', 'nocturne', 'nox', 'grax', 'chaosdragon']));
  });

  it('보스 데이터·군단 체계에 없는 id는 데이터 오류', () => {
    const raw = structuredClone(bundledRawData()) as RawGameData & { game: { art: { cutins: string[] } } };
    raw.game.art.cutins.push('nobody');
    let issues: readonly Issue[] = [];
    try {
      buildGameData(raw);
    } catch (e) {
      if (e instanceof DataError) issues = e.issues;
      else throw e;
    }
    expect(issues.some((i) => i.path.startsWith('art.cutins') && i.message.includes('nobody'))).toBe(true);
  });
});

describe('타워 캐릭터 설명 lore·role (towers.json)', () => {
  it('65종 모두 한 문장씩, 비어 있지 않다', () => {
    expect(data.towers.towers).toHaveLength(65);
    for (const t of data.towers.towers) {
      for (const v of [t.lore, t.role]) {
        expect(v.trim().length).toBeGreaterThan(5);
        expect(v).toMatch(/[.!?]$/);
        expect(v.slice(0, -1)).not.toMatch(/[.!?]\s/);
      }
    }
    expect(data.towers.towers.find((t) => t.id === 'miner')?.lore).toBe('광산일을 마치고 전투에 참여한 드워프 광부다.');
  });

  it('스키마: 빠지거나 두 문장이면 오류', () => {
    const raw = structuredClone(bundledRawData().towers) as { towers: Record<string, unknown>[] };
    delete raw.towers[0]!.lore;
    raw.towers[1]!.role = '첫 문장이다. 둘째 문장이다.';
    raw.towers[2]!.lore = '마침표가 없다';
    const issues: Issue[] = [];
    validate(raw, towersSchema, '', issues);
    expect(issues.some((i) => i.path === 'towers[0].lore')).toBe(true);
    expect(issues.some((i) => i.path === 'towers[1].role')).toBe(true);
    expect(issues.some((i) => i.path === 'towers[2].lore')).toBe(true);
  });

  it('정보 패널·캐릭터 카드 글자', () => {
    const m = createMatch(data, { seed: 1, mode: 'infinite' });
    const rules = m.ctx.rules;
    const td = data.towers.towers.find((t) => t.id === 'icemage')!;
    const stats = rules.towers.get('icemage')!;
    const panel = buildTowerPanelModel({
      data: td,
      stats,
      eff: effectiveStats(rules, stats, NO_MODS),
      factionName: data.towers.factions[td.faction]!.name,
      owned: 1,
      mergeCount: 3,
      mergeableGrade: true,
      outcomes: [],
      paused: false,
      penMaxBp: rules.penMaxBp,
    });
    expect(panel.lore).toBe(td.lore);
    expect(panel.role).toBe(td.role);
    const card = characterCardModel({ data: td, panel, factionName: data.towers.factions[td.faction]!.name, elementName: '얼음' });
    expect(card).toMatchObject({ towerId: 'icemage', name: td.name, lore: td.lore, role: td.role, awakened: false });
    expect(card.tagline).toMatch(/^유니크 · .+ · 얼음$/);
    expect(card.awaken).toBe(td.awaken);
    expect(card.stats).toEqual(panel.stats);
    // 원소 없음 → 두 마디, 각성 '—' → 빈 글자
    const noElem = characterCardModel({ data: { ...td, awaken: '—' }, panel, factionName: '연합', elementName: null, awakened: true });
    expect(noElem.tagline).toBe('유니크 · 연합');
    expect(noElem.awaken).toBe('');
    expect(noElem.awakened).toBe(true);
  });
});

describe('캐릭터별 화면 크기 (characterLooks.json scale)', () => {
  it('타워(각성 포함)·적 모두 범위 안의 크기를 가진다', () => {
    for (const t of data.towers.towers) {
      const look = towerLook(t.id)!;
      expect(look.scale, t.id).toBeGreaterThanOrEqual(LOOK_SCALE_MIN);
      expect(look.scale, t.id).toBeLessThanOrEqual(LOOK_SCALE_MAX);
      if (look.awaken) expect(look.awaken.scale, `${t.id} 각성`).toBeDefined();
    }
    for (const l of allLooks()) if (isEnemyLook(l)) expect(l.scale).toBeGreaterThanOrEqual(LOOK_SCALE_MIN);
  });

  it('같은 등급 안에서는 몸집대로 (요정·고블린 < 사람 < 골렘), 등급이 높으면 더 크다 (피드백 #20), 각성은 조금 더', () => {
    expect(lookScale(towerLook('bard'))).toBeLessThan(lookScale(towerLook('scout'))); // 같은 레어: 요정 < 사람
    expect(lookScale(towerLook('goblin'))).toBeLessThan(lookScale(towerLook('archer')));
    expect(lookScale(towerLook('miner'))).toBeLessThan(lookScale(towerLook('warrior')));
    expect(lookScale(towerLook('archer'))).toBeLessThan(lookScale(towerLook('stonegolem')));
    expect(lookScale(towerLook('stonegolem'))).toBeLessThan(lookScale(towerLook('fate')));
    expect(lookScale(towerLook('archer'))).toBeLessThan(lookScale(towerLook('windarcher'))); // 같은 엘프 궁수, 레어가 조금 크다
    expect(lookScale(towerLook('miner'), true)).toBeGreaterThan(lookScale(towerLook('miner'), false));
    // 크기가 모두 같지 않다 (다양함)
    expect(new Set(data.towers.towers.map((t) => lookScale(towerLook(t.id)))).size).toBeGreaterThan(20);
  });

  it('적: 하수인 < 대장 < 4천왕 < 군주', () => {
    expect(lookScale(enemyLook('bat'))).toBeLessThan(lookScale(enemyLook('batqueen')));
    expect(lookScale(enemyLook('batqueen'))).toBeLessThan(lookScale(enemyLook('zephira')));
    expect(lookScale(enemyLook('gordam'))).toBeLessThan(lookScale(enemyLook('nox')));
  });

  it('외형이 없으면 1, 범위 밖 값은 자른다', () => {
    expect(lookScale(undefined)).toBe(1);
    const look = { ...towerLook('miner')!, scale: 9 };
    expect(lookScale(look)).toBe(LOOK_SCALE_MAX);
  });

  it('타워에 scale이 없거나 범위 밖이면 데이터 오류', () => {
    const raw = structuredClone(looksJson) as { characters: Record<string, unknown>[] };
    const i = raw.characters.findIndex((c) => c.id === 'miner');
    delete raw.characters[i]!.scale;
    const j = raw.characters.findIndex((c) => c.kind === 'mob');
    raw.characters[j]!.scale = 3;
    expect(() => parseLooks(raw)).toThrow(DataError);
    try {
      parseLooks(raw);
    } catch (e) {
      const paths = (e as DataError).issues.map((x) => x.path);
      expect(paths).toContain(`characters[${i}].scale`);
      expect(paths).toContain(`characters[${j}].scale`);
    }
  });

  it('바깥 그림 배율: 칸 너비에 맞추지 않는다 (넓은 그림도 높이 기준, 아주 넓을 때만 상한)', () => {
    // 256×256 그림: 예전에는 너비 200단위에 맞춰 200/256, 이제 높이 230단위
    expect(externalFigureScale(256, 256)).toBeCloseTo(EXTERNAL_FIGURE_UNITS / 256);
    expect(externalFigureScale(174, 256)).toBeCloseTo(EXTERNAL_FIGURE_UNITS / 256);
    // 아주 넓은 그림(가로 3배)은 상한 400단위
    expect(externalFigureScale(768, 256)).toBeCloseTo(400 / 768);
  });

  it('정보 패널이 가리지 않을 그림 범위는 크기 배수만큼 위로 커진다', () => {
    const base = towerFigureSpanTiles();
    const big = towerFigureSpanTiles(1.5);
    expect(big.top).toBeLessThan(base.top);
    expect(big.bottom).toBe(base.bottom);
    expect(towerFigureSpanTiles(1)).toEqual(base);
  });
});
