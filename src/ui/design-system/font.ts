import { assetUrl } from '../../assets';
let pending: Promise<void> | undefined;
/** Bundled OFL font; callers opt in. Existing screens never load or adopt this font. */
export function loadDesignFont(): Promise<void> {
  return pending ??= (async () => {
    if (typeof FontFace === 'undefined') return;
    const face = new FontFace('RTD Jua', `url("${assetUrl('assets/fonts/Jua-Regular.woff')}") format("woff")`, { weight: '400', style: 'normal', display: 'swap' });
    await face.load();
    document.fonts.add(face);
  })();
}
