/**
 * 바깥 그림(WebP)을 DOM 쪽(Phaser 없는 화면 — 캐릭터 갤러리)에서 쓰기 위한 이미지 묶음.
 *
 * - 목록은 게임과 같은 `assets/characters/manifest.json` (한 파일 빌드면 표에 든 객체, 아니면 fetch).
 * - 그림이 다 받아지기 전이나 파일이 없으면 `get`이 null → 부르는 쪽이 절차 그림으로 그린다.
 * - 한 장이 받아질 때마다 `onLoad`를 부른다 (갤러리가 카드를 다시 그림).
 */
import { assetUrl, currentAssetTable, embeddedAssetJson } from '../../assets';
import { EXTERNAL_ART_MANIFEST, externalArtKey, externalArtUrl, externalEntries } from './external';
import type { LookGroup } from './looks';

export class ExternalImages {
  private readonly images = new Map<string, HTMLImageElement>();
  /** 목록에 있는 그림 수 (받기 전 포함) */
  listed = 0;

  constructor(private readonly onLoad: () => void = () => {}) {}

  /** 매니페스트를 읽고 그림을 받기 시작한다. 실패해도 조용히 (절차 그림 그대로). */
  async start(): Promise<void> {
    let manifest: unknown = embeddedAssetJson(EXTERNAL_ART_MANIFEST, currentAssetTable());
    if (manifest === undefined) {
      try {
        const res = await fetch(assetUrl(EXTERNAL_ART_MANIFEST));
        manifest = res.ok ? await res.json() : null;
      } catch {
        manifest = null;
      }
    }
    const entries = externalEntries(manifest);
    this.listed = entries.length;
    for (const e of entries) {
      const key = externalArtKey(e.group, e.id, e.awakened);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.images.set(key, img);
        this.onLoad();
      };
      img.src = assetUrl(externalArtUrl(e.group, e.id, e.awakened));
    }
  }

  /** 받아 둔 그림 (없으면 null) */
  get(group: LookGroup, id: string, awakened: boolean): HTMLImageElement | null {
    return this.images.get(externalArtKey(group, id, awakened)) ?? null;
  }

  /** 받아 둔 그림 수 (E2E) */
  get loaded(): number {
    return this.images.size;
  }
}
