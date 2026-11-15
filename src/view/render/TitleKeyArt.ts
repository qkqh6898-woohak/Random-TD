/**
 * 타이틀 그림 (HF-2): 힉스필드 키 아트(연합 영웅들 + 녹스 균열)를 타이틀 화면 뒤에 꽉 차게(cover) 깐다.
 * 켤 때마다 하나를 무작위로 고른다 (화면 전용 무작위 — sim과 무관). 위(로고)·아래([▶ 시작])에 옅은 어둠을 깔아 글자가 잘 보이게 한다.
 * 그림이 없거나 못 받으면 Boot 장면이 예전 절차 타이틀(하늘·성벽·대기 동작 타워)을 그린다.
 */
import Phaser from 'phaser';
import { assetUrl } from '../../assets';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { coverScale, titleArtKey, titleArtPath } from '../artBand';

export { pickTitleArt } from '../artBand';

/** Boot.preload: 고른 타이틀 그림을 로더에 올린다 (이미 있으면 그대로) → 텍스처 키 */
export function queueTitleArt(scene: Phaser.Scene, n: number): string {
  const key = titleArtKey(n);
  if (!scene.textures.exists(key)) scene.load.image(key, assetUrl(titleArtPath(n)));
  return key;
}

const SCRIM_KEY = 'title-scrim';

/** 타이틀 그림 + 글자용 어둠을 그린다. 텍스처가 없으면 false (절차 타이틀로) */
export function drawTitleKeyArt(scene: Phaser.Scene, key: string): boolean {
  if (!scene.textures.exists(key)) return false;
  const img = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, key).setDepth(-10);
  img.setScale(coverScale(img.width, img.height, GAME_WIDTH, GAME_HEIGHT));
  if (!scene.textures.exists(SCRIM_KEY)) {
    const tex = scene.textures.createCanvas(SCRIM_KEY, 4, 256);
    if (tex) {
      const ctx = tex.getContext();
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      // 위: 로고·부제 자리 (무대 위쪽 약 15~40%), 아래: [▶ 시작] 자리 (약 70~100%)
      g.addColorStop(0, 'rgba(10, 8, 26, 0.35)');
      g.addColorStop(0.24, 'rgba(10, 8, 26, 0.5)');
      g.addColorStop(0.42, 'rgba(10, 8, 26, 0)');
      g.addColorStop(0.68, 'rgba(10, 8, 26, 0)');
      g.addColorStop(0.86, 'rgba(10, 8, 26, 0.45)');
      g.addColorStop(1, 'rgba(10, 8, 26, 0.7)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 256);
      tex.refresh();
    }
  }
  scene.add.image(0, 0, SCRIM_KEY).setOrigin(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(-9);
  return true;
}
