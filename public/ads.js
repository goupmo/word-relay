import { config } from './config.js';

// Kakao AdFit banners. Slots ([data-ad]) exist only on the home, lobby and round-result screens,
// never on the game board. Does nothing until config.adfitUnitId is set; a slot is filled once,
// the first time it is actually visible.
export function mountAds() {
  if (!config.adfitUnitId) return;
  for (const slot of document.querySelectorAll('[data-ad]')) {
    if (slot.dataset.mounted || slot.offsetParent === null) continue;
    slot.dataset.mounted = '1';
    const ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'none';
    ins.dataset.adUnit = config.adfitUnitId;
    ins.dataset.adWidth = '320';
    ins.dataset.adHeight = '100';
    const script = document.createElement('script');
    script.async = true;
    script.src = '//t1.daumcdn.net/kas/static/ba.min.js';
    slot.append(ins, script);
  }
}
