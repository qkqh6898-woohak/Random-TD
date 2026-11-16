/** 오프라인 SD 보스: 큰 머리·짧은 몸, 종류별 외곽선과 소품. 128×128. */
import { circle, ellipse, poly, rrect, shade, shine, stroke, type Ctx } from './cv';
import type { EnemyLook } from './looks';

export function usesSdBoss(look: EnemyLook): boolean { return look.rank !== 'minion'; }

export function drawSdBoss(c: Ctx, look: EnemyLook): void {
  const body = shade(look.colors[0] ?? '#8866AA', 0.15);
  const accent = look.colors[1] ?? '#FFE09B';
  const id = look.creature;
  let faceY = 58;
  let faceX = 64;
  const round = (x: number, y: number, rx: number, ry: number, color = body): void => ellipse(c, x, y, rx, ry, color, { lw: 3, cel: true, celOffset: 4 });
  const crown = (): void => {
    poly(c, [45, 30, 42, 14, 55, 21, 64, 9, 73, 21, 86, 14, 83, 30], '#FFD969', { lw: 3 });
    circle(c, 64, 23, 3, accent, { lw: 1 });
  };
  const wings = (wide: boolean): void => {
    for (const s of [-1, 1]) {
      poly(c, [64 + s * 15, 62, 64 + s * 57, wide ? 30 : 45, 64 + s * 53, 61, 64 + s * 59, 83, 64 + s * 35, 77, 64 + s * 20, 92], shade(body, -0.2), { lw: 3 });
      stroke(c, [64 + s * 22, 64, 64 + s * 47, 56], accent, 2);
    }
  };
  const feet = (): void => { round(48, 106, 13, 9, shade(body, -0.15)); round(80, 106, 13, 9, shade(body, -0.15)); };
  switch (id) {
    case 'bat_queen':
      wings(true); round(64, 85, 23, 23); round(64, 56, 29, 30);
      for (const s of [-1, 1]) poly(c, [64 + s * 16, 38, 64 + s * 29, 12, 64 + s * 30, 46], body, { lw: 3 });
      crown(); break;
    case 'king_slime':
      round(64, 83, 47, 33); round(64, 66, 37, 30); faceY = 74;
      shine(c, 38, 61, 10, 5, 0.8); crown(); break;
    case 'rune_giant':
    case 'steel_colossus':
    case 'lava_giant':
    case 'rock_heart': {
      feet();
      const stone = id === 'rune_giant' ? 10 : id === 'steel_colossus' ? 3 : 17;
      rrect(c, 34, 67, 60, 36, stone, body, { lw: 3, cel: true });
      for (const s of [-1, 1]) rrect(c, 64 + s * 40 - 12, 64, 24, 34, stone, shade(body, -0.13), { lw: 3 });
      rrect(c, 34, 27, 60, 49, stone, body, { lw: 3, cel: true }); faceY = 52;
      if (id === 'rune_giant') { stroke(c, [50, 86, 64, 77, 78, 86, 64, 97, 50, 86], accent, 4); round(39, 28, 7, 9, '#8EBD8C'); }
      if (id === 'steel_colossus') { rrect(c, 43, 36, 42, 11, 3, '#CEDBE4', { lw: 2 }); for (const x of [29, 99]) circle(c, x, 72, 5, accent, { lw: 2 }); }
      if (id === 'lava_giant') { poly(c, [45, 31, 48, 11, 62, 28, 72, 7, 83, 35], '#FFB14A', { lw: 3 }); stroke(c, [50, 83, 60, 92, 74, 80], '#FFBA5F', 4); }
      if (id === 'rock_heart') { for (const s of [-1, 1]) poly(c, [64 + s * 31, 52, 64 + s * 48, 28, 64 + s * 48, 61], accent, { lw: 3 }); round(64, 85, 12, 10, '#FFAF70'); crown(); }
      break;
    }
    case 'wraith_lord':
    case 'shadow_assassin':
    case 'dark_lord':
      poly(c, [35, 110, 29, 76, 40, 40, 88, 40, 99, 76, 93, 110, 77, 101, 64, 113, 51, 101], body, { lw: 3, cel: true });
      round(64, 51, 29, 30); faceY = 53;
      if (id === 'wraith_lord') { round(26, 86, 10, 12, accent); round(102, 86, 10, 12, accent); }
      if (id === 'shadow_assassin') { poly(c, [32, 72, 9, 97, 37, 88], '#E0E3F2', { lw: 3 }); rrect(c, 43, 64, 42, 12, 5, accent, { lw: 2 }); }
      if (id === 'dark_lord') { wings(false); round(64, 51, 29, 30); crown(); }
      break;
    case 'chaos_dragon':
    case 'frost_wyrm':
      wings(id === 'chaos_dragon'); feet();
      poly(c, [82, 88, 117, 94, 105, 72, 110, 104, 80, 106], accent, { lw: 3 });
      round(64, 84, 24, 24); round(64, 53, 30, 29);
      for (const s of [-1, 1]) poly(c, [64 + s * 16, 31, 64 + s * 31, 11, 64 + s * 29, 40], accent, { lw: 3 });
      if (id === 'frost_wyrm') { poly(c, [49, 82, 64, 73, 79, 82, 64, 103], '#E2FAFF', { lw: 2 }); }
      else { round(64, 91, 12, 13, '#FFC780'); } break;
    case 'sand_worm':
    case 'crystal_worm':
      for (let i = 0; i < 4; i++) round(26 + i * 17, 103 - i * 6, 14 + i, 12 + i);
      round(78, 48, 28, 31); faceX = 78; faceY = 49;
      if (id === 'crystal_worm') for (const x of [29, 49, 68]) poly(c, [x - 5, 89, x, 66 - x / 6, x + 8, 85], accent, { lw: 3 });
      else { for (const s of [-1, 1]) round(78 + s * 28, 60, 7, 17, accent); crown(); }
      break;
    case 'rot_treant':
      feet(); rrect(c, 38, 64, 52, 42, 12, body, { lw: 3 });
      for (const s of [-1, 1]) { stroke(c, [64 + s * 22, 81, 64 + s * 46, 59, 64 + s * 45, 39], body, 11); round(64 + s * 42, 33, 13, 10, '#AAAE7B'); }
      round(64, 49, 28, 28); break;
    case 'abyss_jelly':
      for (let i = 0; i < 5; i++) stroke(c, [32 + i * 16, 75, 28 + i * 16, 93, 36 + i * 14, 112], accent, 7);
      round(64, 53, 43, 34); faceY = 55; shine(c, 45, 34, 11, 6, 0.75); break;
    case 'wraith_rider':
      round(64, 94, 37, 16, shade(body, -0.15)); round(95, 82, 15, 19, accent); feet();
      round(55, 62, 20, 26); round(55, 41, 25, 26); faceX = 55; faceY = 42;
      stroke(c, [28, 91, 20, 35], '#D2EBFF', 6); break;
    case 'blade_lady':
      for (const s of [-1, 1]) poly(c, [64 + s * 36, 90, 64 + s * 48, 26, 64 + s * 57, 74], '#D4F7FF', { lw: 3 });
      poly(c, [42, 72, 25, 110, 64, 99, 103, 110, 86, 72], body, { lw: 3 });
      round(64, 51, 29, 30); crown(); break;
    case 'rot_king':
      round(64, 89, 42, 24); round(64, 53, 34, 29); faceY = 56;
      for (const [x, y, r] of [[23, 72, 13], [104, 79, 12], [33, 30, 10]]) round(x!, y!, r!, r!, accent);
      crown(); break;
    default: // 선봉장 그락스: 짧은 기사 몸 + 큰 투구 + 방패
      feet(); round(64, 85, 24, 24); round(64, 52, 30, 30);
      poly(c, [43, 29, 64, 9, 85, 29], accent, { lw: 3 });
      rrect(c, 14, 65, 24, 36, 9, accent, { lw: 3 });
      stroke(c, [101, 99, 101, 44], '#E5F8FF', 7); break;
  }
  // 둥근 눈·반짝임·볼·작은 입: 작은 휴대폰에서도 읽히는 SD 표정.
  for (const s of [-1, 1]) {
    ellipse(c, faceX + s * 11, faceY, 5, 7, '#2C213B', { lw: 0 });
    circle(c, faceX + s * 11 - 1.5, faceY - 2, 1.8, '#FFFFFF', { lw: 0 });
    ellipse(c, faceX + s * 21, faceY + 10, 5, 3, '#F49AAE', { lw: 0, alpha: 0.8 });
  }
  stroke(c, [faceX - 4, faceY + 12, faceX, faceY + 15, faceX + 4, faceY + 12], '#3B2416', 2.5);
}
