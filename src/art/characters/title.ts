/**
 * 타이틀 화면 캐릭터 (Boot 장면): 받침대 + 파츠 그림 + 캐릭터별 대기 동작. TowerSprite와 같은 자세 계산을 쓴다.
 */
import Phaser from 'phaser';
import { GRADE_STARS } from '../towerLook';
import { ensurePedestalTexture, PEDESTAL_ORIGIN_Y, FIGURE_TEX_H } from '../towers';
import { towerPose } from '../../view/render/towerPose';
import { compose } from './compose';
import { fxOf } from './draw';
import { IDLE_PRESETS, idleParts, type IdlePreset } from './idle';
import { towerLook } from './looks';
import { CharacterFigure, towerCharacterTexture } from './phaserArt';

/** 타이틀 캐릭터 높이 (기준 px, 예전 chibi와 같은 크기: 그림 단위 1 = 1px) */
const TITLE_UNIT_PX = 1;

export class TitleCharacter {
  private constructor(
    private readonly root: Phaser.GameObjects.Container,
    private readonly figure: Phaser.GameObjects.Container,
    private readonly character: CharacterFigure,
    private readonly preset: IdlePreset,
    private readonly seed: number,
    private readonly scale: number,
  ) {}

  /** 외형 데이터가 없으면 null (예전 chibi로 그린다) */
  static create(scene: Phaser.Scene, towerId: string, x: number, y: number, scale: number, seed: number): TitleCharacter | null {
    const look = towerLook(towerId);
    if (!look || !look.grade) return null;
    const ped = scene.add.image(0, 0, ensurePedestalTexture(scene, look.grade)).setOrigin(0.5, PEDESTAL_ORIGIN_Y);
    const character = new CharacterFigure(scene, towerCharacterTexture(scene, look, false));
    const s = scale * TITLE_UNIT_PX;
    const figure = scene.add.container(0, 0, [character.container]).setScale(s);
    const root = scene.add.container(x, y, [ped, figure]);
    root.setScale(1);
    ped.setScale(scale);
    void GRADE_STARS;
    void FIGURE_TEX_H;
    return new TitleCharacter(root, figure, character, IDLE_PRESETS[look.idle ?? 'hop'], seed, s);
  }

  update(timeMs: number): void {
    const p = this.preset;
    const pose = towerPose({ timeMs, seed: this.seed, attackAtMs: null, attackMs: 250, appearAtMs: null, gesture: p.gesture, gestureMs: p.gestureMs });
    // 타이틀은 그림 단위 1 = 1px, 타워 1칸 ≈ 249단위
    const tilePx = (274 / 1.1) * this.scale;
    this.figure.setPosition(pose.dx * tilePx, pose.bob * tilePx);
    this.figure.setScale(this.scale * pose.sx, this.scale * pose.sy);
    this.figure.setRotation(pose.angle);
    const r = this.character.tex.render;
    const look = r.look;
    const idle = idleParts({ preset: p, gesture: pose.gesture, attack: 0, timeMs, seed: this.seed, body: look.body, prop: look.prop, back: look.back, pet: look.pet, fx: fxOf(look), grade: look.grade });
    this.character.apply(compose(r, idle, timeMs, this.seed));
  }

  destroy(): void {
    this.root.destroy();
  }
}
