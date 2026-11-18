/**
 * 캐릭터 갤러리 (URL `?gallery=1`): 절차 생성 캐릭터 106명을 한 화면에서 확인한다. Phaser 없이 DOM 캔버스로 그린다.
 *
 * - 탭: 타워 65 / 적 32 / 인물 9. 타워는 등급 묶음 거르기(노말·레어 / 유니크·히어로 / 레전드·신·히든).
 * - 각성 토글: 각성 외형이 있는 53종은 각성 모습으로 (히든 12종은 각성 없음 → 그대로).
 * - 대기 동작 재생/멈춤: 게임과 같은 자세 계산(towerPose + idleParts + compose)을 쓴다 → 게임에서도 같은 동작.
 * - 인물 카드를 누르면 표정(보통 → 화남 → 웃음)이 바뀐다.
 * - 휴대폰 412×915에서 세로로 스크롤. 기존 게임 흐름과 무관 (main.ts가 ?gallery=1일 때만 이 화면을 띄우고 Phaser를 만들지 않는다).
 * - 🖼 그림 토글 (G 통합, 기본 켜짐): 바깥 그림(통통한 캐주얼 WebP, assets/characters)이 있으면 그것을 같은 대기 몸동작으로 그리고,
 *   그림이 아직 안 받아졌거나 없으면 절차 그림. 끄면 절차 그림만 (파츠 확인용). 인물은 WebP가 '보통' 표정 한 장뿐이라 다른 표정은 절차 그림.
 * - 쿼리로 처음 상태를 정할 수 있다 (스크린샷용): tab=towers|enemies|people, filter=all|nr|uh|lgh, awaken=1, play=0, art=0.
 */
import './gallery.css';
import { ensureEnemyTexture, ensureHumanTexture, ensurePortraitTexture, type HumanTexture } from '../../art/characters/cache';
import { compose } from '../../art/characters/compose';
import { DomTextureStore, drawComposition, drawPedestal2D } from '../../art/characters/domArt';
import { fxOf } from '../../art/characters/draw';
import { IDLE_PRESETS, idleParts } from '../../art/characters/idle';
import { allLooks, hasAwaken, isEnemyLook, type EnemyLook, type HumanLook } from '../../art/characters/looks';
import { EXPRESSIONS, type Expression } from '../../art/characters/portraits';
import { externalFigureScale } from '../../art/characters/external';
import { ExternalImages } from '../../art/characters/externalDom';
import { outlinedArt } from '../../art/characters/gradeOutline';
import { ENEMY_BOX, PORTRAIT_BOX } from '../../art/characters/rig';
import { GRADE_COLORS } from '../../art/palette';
import type { Grade } from '../../data/load';
import { bossPose, mobPose, type MobMotion } from '../../view/render/mobPose';
import { towerPose } from '../../view/render/towerPose';
import { h } from '../dom';

export type GalleryTab = 'towers' | 'enemies' | 'people';
export type TowerFilter = 'all' | 'nr' | 'uh' | 'lgh';

const FILTER_GRADES: Record<TowerFilter, readonly Grade[]> = {
  all: ['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden'],
  nr: ['normal', 'rare'],
  uh: ['unique', 'hero'],
  lgh: ['legend', 'god', 'hidden'],
};

const FILTER_LABEL: Record<TowerFilter, string> = { all: '전체', nr: '노말·레어', uh: '유니크·히어로', lgh: '레전드·신·신화' };
const GRADE_KO: Record<Grade, string> = { normal: '노말', rare: '레어', unique: '유니크', hero: '히어로', legend: '레전드', god: '신', hidden: '신화' };
const RANK_KO: Record<string, string> = { minion: '하수인', captain: '대장', commander: '4천왕', lord: '군주' };
const EXPR_KO: Record<Expression, string> = { normal: '보통', angry: '화남', happy: '웃음' };

/** 타워 1칸 = 그림 단위 (캐릭터 274단위 = 1.1칸) */
const TILE_UNITS = 274 / 1.1;
/** 타워 카드 보기 상자 (그림 단위) */
const TOWER_VIEW = { left: -150, top: -300, width: 300, height: 330 };

export interface GalleryOptions {
  tab?: GalleryTab;
  filter?: TowerFilter;
  awaken?: boolean;
  play?: boolean;
  /** 바깥 그림(WebP) 우선 (기본 true) */
  art?: boolean;
  legionColor: (legion: string) => string;
}

interface Card {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  draw: (t: number) => void;
  visible: boolean;
}

export function readGalleryOptions(search: string): { enabled: boolean; tab?: GalleryTab; filter?: TowerFilter; awaken?: boolean; play?: boolean; art?: boolean } {
  const p = new URLSearchParams(search);
  const tab = p.get('tab');
  const filter = p.get('filter');
  return {
    enabled: p.get('gallery') === '1',
    tab: tab === 'towers' || tab === 'enemies' || tab === 'people' ? tab : undefined,
    filter: filter === 'all' || filter === 'nr' || filter === 'uh' || filter === 'lgh' ? filter : undefined,
    awaken: p.get('awaken') === '1' ? true : undefined,
    play: p.get('play') === '0' ? false : undefined,
    art: p.get('art') === '0' ? false : undefined,
  };
}

export class Gallery {
  readonly el: HTMLElement;
  private tab: GalleryTab;
  private filter: TowerFilter;
  private awaken: boolean;
  private play: boolean;
  private art: boolean;
  private readonly ext: ExternalImages;
  private redrawQueued = false;
  private readonly store = new DomTextureStore();
  private readonly grid: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly filterRow: HTMLElement;
  private cards: Card[] = [];
  private raf = 0;
  private observer: IntersectionObserver | null = null;
  private readonly dpr: number;
  private readonly t0 = performance.now();
  private frozenAt = 0;

  constructor(private readonly opts: GalleryOptions) {
    this.tab = opts.tab ?? 'towers';
    this.filter = opts.filter ?? 'all';
    this.awaken = opts.awaken ?? false;
    this.play = opts.play ?? true;
    this.art = opts.art ?? true;
    // 바깥 그림이 한 장씩 받아질 때마다 (한 프레임에 한 번) 모두 다시 그린다
    this.ext = new ExternalImages(() => {
      if (this.redrawQueued) return;
      this.redrawQueued = true;
      requestAnimationFrame(() => {
        this.redrawQueued = false;
        this.drawAll(false);
      });
    });
    void this.ext.start();
    this.dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    this.countEl = h('span', { class: 'gal-count', attrs: { 'data-testid': 'gallery-count' } });
    const awakenBtn = h('button', { class: 'gal-toggle', attrs: { 'data-testid': 'gallery-awaken', 'aria-pressed': String(this.awaken), type: 'button' }, text: '✨ 각성' });
    awakenBtn.addEventListener('click', () => {
      this.awaken = !this.awaken;
      awakenBtn.setAttribute('aria-pressed', String(this.awaken));
      this.render();
    });
    const playBtn = h('button', { class: 'gal-toggle', attrs: { 'data-testid': 'gallery-play', 'aria-pressed': String(this.play), type: 'button' }, text: this.play ? '⏸ 동작' : '▶ 동작' });
    playBtn.addEventListener('click', () => {
      this.play = !this.play;
      if (!this.play) this.frozenAt = this.now();
      playBtn.setAttribute('aria-pressed', String(this.play));
      playBtn.textContent = this.play ? '⏸ 동작' : '▶ 동작';
      this.drawAll();
    });
    const artBtn = h('button', { class: 'gal-toggle', attrs: { 'data-testid': 'gallery-art', 'aria-pressed': String(this.art), type: 'button' }, text: '🖼 그림' });
    artBtn.addEventListener('click', () => {
      this.art = !this.art;
      artBtn.setAttribute('aria-pressed', String(this.art));
      this.drawAll(false);
    });
    const tabs = h('div', { class: 'gal-tabs', attrs: { role: 'tablist' } });
    for (const [id, label] of [
      ['towers', '타워 65'],
      ['enemies', '적 32'],
      ['people', '인물 9'],
    ] as const) {
      const b = h('button', { class: 'gal-tab', attrs: { role: 'tab', 'data-testid': `gallery-tab-${id}`, 'aria-selected': String(this.tab === id), type: 'button' }, text: label });
      b.addEventListener('click', () => {
        this.tab = id;
        for (const other of Array.from(tabs.children)) other.setAttribute('aria-selected', String(other === b));
        this.render();
      });
      tabs.append(b);
    }
    this.filterRow = h('div', { class: 'gal-filters' });
    for (const f of ['all', 'nr', 'uh', 'lgh'] as const) {
      const b = h('button', { class: 'gal-chip', attrs: { 'data-testid': `gallery-filter-${f}`, 'aria-pressed': String(this.filter === f), type: 'button' }, text: FILTER_LABEL[f] });
      b.addEventListener('click', () => {
        this.filter = f;
        for (const other of Array.from(this.filterRow.children)) other.setAttribute('aria-pressed', String(other === b));
        this.render();
      });
      this.filterRow.append(b);
    }
    this.grid = h('div', { class: 'gal-grid', attrs: { 'data-testid': 'gallery-grid' } });
    const header = h(
      'header',
      { class: 'gal-header' },
      h('div', { class: 'gal-top' }, h('h1', { class: 'gal-title', text: '캐릭터 갤러리' }), this.countEl, h('span', { class: 'gal-spacer' }), artBtn, awakenBtn, playBtn),
      tabs,
      this.filterRow,
    );
    this.el = h('div', { class: 'gallery', attrs: { 'data-testid': 'gallery' } }, header, this.grid);
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const card = this.cards.find((c) => c.el === e.target);
          if (card) card.visible = e.isIntersecting;
        }
      });
    }
    this.render();
    const loop = (): void => {
      this.raf = requestAnimationFrame(loop);
      if (this.play) this.drawAll(true);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private now(): number {
    return performance.now() - this.t0;
  }

  /** 바깥 그림: 목록 수 · 받은 수 (E2E) */
  get artStats(): { listed: number; loaded: number } {
    return { listed: this.ext.listed, loaded: this.ext.loaded };
  }

  /** 바깥 그림 (그림 토글이 꺼져 있으면 null) */
  private extImage(group: 'tower' | 'enemy' | 'person', id: string, awakened: boolean): HTMLImageElement | null {
    return this.art ? this.ext.get(group, id, awakened) : null;
  }

  /** 지금 그리드의 카드 수 (E2E) */
  get cardCount(): number {
    return this.cards.length;
  }

  private drawAll(onlyVisible = false): void {
    const t = this.play ? this.now() : this.frozenAt;
    for (const c of this.cards) if (!onlyVisible || c.visible) c.draw(t);
  }

  private render(): void {
    for (const c of this.cards) this.observer?.unobserve(c.el);
    this.cards = [];
    this.grid.replaceChildren();
    this.grid.dataset.tab = this.tab;
    this.filterRow.hidden = this.tab !== 'towers';
    const looks = allLooks();
    if (this.tab === 'towers') {
      const grades = FILTER_GRADES[this.filter];
      const towers = looks.filter((l): l is HumanLook => !isEnemyLook(l) && l.kind === 'tower' && grades.includes(l.grade as Grade));
      let group: Grade | null = null;
      for (const l of towers) {
        if (l.grade !== group) {
          group = l.grade as Grade;
          this.grid.append(h('div', { class: 'gal-group', attrs: { style: `--grade:${GRADE_COLORS[group]}` }, text: GRADE_KO[group] }));
        }
        this.add(this.towerCard(l));
      }
      const awakened = towers.filter((l) => hasAwaken(l)).length;
      this.countEl.textContent = this.awaken ? `${towers.length}명 · 각성 ${awakened}` : `${towers.length}명`;
    } else if (this.tab === 'enemies') {
      const enemies = looks.filter((l): l is EnemyLook => isEnemyLook(l));
      let group = '';
      for (const l of enemies) {
        if (l.rank !== group) {
          group = l.rank;
          this.grid.append(h('div', { class: 'gal-group', text: RANK_KO[group] ?? group }));
        }
        this.add(this.enemyCard(l));
      }
      this.countEl.textContent = `${enemies.length}명`;
    } else {
      const people = looks.filter((l): l is HumanLook => !isEnemyLook(l) && l.kind !== 'tower');
      for (const l of people) this.add(this.personCard(l));
      this.countEl.textContent = `${people.length}명 · 눌러서 표정`;
    }
    this.el.scrollTop = 0;
    // 첫 그림은 곧바로 (보이지 않는 카드도 한 번은 그려 둔다)
    this.drawAll(false);
  }

  private add(card: Card): void {
    this.cards.push(card);
    this.grid.append(card.el);
    if (this.observer) this.observer.observe(card.el);
    else card.visible = true;
  }

  private makeCanvas(cssW: number, cssH: number): HTMLCanvasElement {
    const canvas = h('canvas', { class: 'gal-canvas' });
    canvas.width = Math.round(cssW * this.dpr);
    canvas.height = Math.round(cssH * this.dpr);
    canvas.style.aspectRatio = `${cssW} / ${cssH}`;
    return canvas;
  }

  private towerCard(base: HumanLook): Card {
    const cssW = 76;
    const cssH = (cssW * TOWER_VIEW.height) / TOWER_VIEW.width;
    const canvas = this.makeCanvas(cssW, cssH);
    const scale = (canvas.width / TOWER_VIEW.width) * 1;
    const res = Math.min(1, Math.max(0.35, scale * 1.15));
    const awakened = this.awaken && hasAwaken(base);
    const tex: HumanTexture = ensureHumanTexture(this.store, base, 'tower', awakened, res);
    const look = tex.render.look;
    const preset = IDLE_PRESETS[look.idle ?? 'hop'];
    const seed = Math.random();
    const ctx = canvas.getContext('2d');
    const grade = base.grade as Grade;
    let el: HTMLElement | null = null;
    const draw = (t: number): void => {
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, -TOWER_VIEW.left * scale, -TOWER_VIEW.top * scale);
      drawPedestal2D(ctx, GRADE_COLORS[grade], grade);
      const pose = towerPose({ timeMs: t, seed, attackAtMs: null, attackMs: 250, appearAtMs: null, gesture: preset.gesture, gestureMs: preset.gestureMs });
      const ext = this.extImage('tower', base.id, awakened);
      if (el) el.dataset.art = ext ? 'webp' : 'procedural';
      if (ext) {
        // 바깥 그림: 발밑 = 그림 아래 가운데 (게임 CharacterFigure와 같은 배율), 대기 몸동작만
        const k = externalFigureScale(ext.naturalWidth, ext.naturalHeight);
        ctx.save();
        if (this.play) {
          ctx.translate(pose.dx * TILE_UNITS, pose.bob * TILE_UNITS);
          ctx.rotate(pose.angle + pose.sway);
          ctx.scale(pose.sx, pose.sy);
        }
        const art = outlinedArt(ext, ext.naturalWidth, ext.naturalHeight, grade);
        ctx.drawImage(art.canvas, (-ext.naturalWidth * k) / 2 - art.pad * k, -(ext.naturalHeight + art.pad) * k, art.canvas.width * k, art.canvas.height * k);
        ctx.restore();
        return;
      }
      const idle = idleParts({ preset, gesture: pose.gesture, attack: 0, timeMs: t, seed, body: look.body, prop: look.prop, back: look.back, pet: look.pet, fx: fxOf(look), grade: look.grade, play: this.play });
      const comp = compose(tex.render, idle, t, seed);
      ctx.save();
      if (this.play) {
        ctx.translate(pose.dx * TILE_UNITS, pose.bob * TILE_UNITS);
        ctx.rotate(pose.angle);
        ctx.scale(pose.sx, pose.sy);
      }
      drawComposition(ctx, this.store, tex, comp);
      ctx.restore();
    };
    el = h(
      'figure',
      { class: 'gal-card', attrs: { 'data-testid': 'gallery-card', 'data-id': base.id, 'data-kind': 'tower', 'data-awakened': String(awakened), title: `${base.name} — ${preset.label}` } },
      canvas,
      h('figcaption', { class: 'gal-name', attrs: { style: `--grade:${GRADE_COLORS[grade]}` } }, awakened ? h('span', { class: 'gal-badge', text: '✨' }) : null, base.name),
    );
    return { el, canvas, draw, visible: false };
  }

  private enemyCard(look: EnemyLook): Card {
    const cssW = 70;
    const canvas = this.makeCanvas(cssW, cssW);
    const scale = canvas.width / ENEMY_BOX;
    const res = Math.min(1.5, Math.max(0.5, scale * 1.1));
    const legion = this.opts.legionColor(look.legion);
    const tex = ensureEnemyTexture(this.store, look, legion, res);
    const img = this.store.get(tex.key);
    const motion: MobMotion = look.motion;
    const phase = Math.random() * Math.PI * 2;
    const ctx = canvas.getContext('2d');
    let el: HTMLElement | null = null;
    const draw = (t: number): void => {
      if (!ctx || !img) return;
      const ext = this.extImage('enemy', look.id, false);
      if (el) el.dataset.art = ext ? 'webp' : 'procedural';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(64, 112, 40, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      const p = this.play ? (look.rank === 'minion' ? mobPose(motion, t, phase) : bossPose(look.id, motion, t, phase)) : { bob: 0, sx: 1, sy: 1, angle: 0 };
      ctx.translate(64, 79 + p.bob * 9);
      ctx.rotate(p.angle);
      ctx.scale(p.sx, p.sy);
      if (ext) {
        // 바깥 그림: 너비 92%·높이 88% 안에 맞추고 발밑을 그림자(아래 112) 조금 아래에 (위가 잘리지 않게)
        const k = Math.min((ENEMY_BOX * 0.92) / Math.max(1, ext.naturalWidth), (ENEMY_BOX * 0.88) / Math.max(1, ext.naturalHeight));
        ctx.drawImage(ext, (-ext.naturalWidth * k) / 2, 116 - 79 - ext.naturalHeight * k, ext.naturalWidth * k, ext.naturalHeight * k);
      } else ctx.drawImage(img.canvas, -64, -79, ENEMY_BOX, ENEMY_BOX);
    };
    el = h(
      'figure',
      { class: 'gal-card gal-enemy', attrs: { 'data-testid': 'gallery-card', 'data-id': look.id, 'data-kind': look.kind } },
      canvas,
      h('figcaption', { class: 'gal-name', attrs: { style: `--grade:${legion}` } }, look.name),
    );
    return { el, canvas, draw, visible: false };
  }

  private personCard(look: HumanLook): Card {
    const cssW = 118;
    const cssH = (cssW * PORTRAIT_BOX.height) / PORTRAIT_BOX.width;
    const canvas = this.makeCanvas(cssW, cssH);
    const scale = canvas.width / PORTRAIT_BOX.width;
    let ex: Expression = 'normal';
    const ctx = canvas.getContext('2d');
    const caption = h('figcaption', { class: 'gal-name gal-person-name' }, look.name);
    const exLabel = h('span', { class: 'gal-expr', text: EXPR_KO[ex] });
    let el: HTMLElement | null = null;
    const draw = (t: number): void => {
      if (!ctx) return;
      // 바깥 그림은 '보통' 표정 한 장 → 다른 표정은 절차 그림
      const ext = ex === 'normal' ? this.extImage('person', look.id, false) : null;
      if (el) el.dataset.art = ext ? 'webp' : 'procedural';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // 대화 초상은 숨쉬기만 (세로 1.5%)
      const b = this.play ? 0.5 - 0.5 * Math.cos((t / 1500) * Math.PI * 2) : 0;
      ctx.setTransform(scale, 0, 0, scale * (1 + 0.015 * b), 0, -canvas.height * 0.015 * b);
      if (ext) {
        // 상자에 맞춰 (가로세로 비율 유지), 아래 가운데 정렬
        const k = Math.min(PORTRAIT_BOX.width / Math.max(1, ext.naturalWidth), PORTRAIT_BOX.height / Math.max(1, ext.naturalHeight));
        ctx.drawImage(ext, (PORTRAIT_BOX.width - ext.naturalWidth * k) / 2, PORTRAIT_BOX.height - ext.naturalHeight * k, ext.naturalWidth * k, ext.naturalHeight * k);
        return;
      }
      const tex = ensurePortraitTexture(this.store, look, ex, Math.min(2, scale * 1.1));
      const img = this.store.get(tex.key);
      if (!img) return;
      ctx.drawImage(img.canvas, 0, 0, PORTRAIT_BOX.width, PORTRAIT_BOX.height);
    };
    el = h('figure', { class: 'gal-card gal-person', attrs: { 'data-testid': 'gallery-card', 'data-id': look.id, 'data-kind': look.kind, role: 'button', tabindex: '0' } }, canvas, caption, exLabel);
    el.addEventListener('click', () => {
      ex = EXPRESSIONS[(EXPRESSIONS.indexOf(ex) + 1) % EXPRESSIONS.length] as Expression;
      exLabel.textContent = EXPR_KO[ex];
      draw(this.play ? this.now() : this.frozenAt);
    });
    return { el, canvas, draw, visible: false };
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.el.remove();
  }
}

/** 갤러리를 문서에 띄운다 (main.ts). */
export function mountGallery(parent: HTMLElement, opts: GalleryOptions): Gallery {
  const g = new Gallery(opts);
  parent.append(g.el);
  (window as unknown as { __gallery?: Gallery }).__gallery = g;
  return g;
}
