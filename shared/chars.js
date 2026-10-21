export const KO_LETTERS = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
// q, x, z are left out: almost no category has words for them.
export const EN_LETTERS = 'abcdefghijklmnoprstuvwy'.split('');

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const FOLD = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };

export function normalizeWord(raw, lang) {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').trim();
  if (lang === 'ko') return /^[가-힣]{2,}$/.test(s) ? s : null;
  if (lang === 'en') {
    const l = s.toLowerCase();
    return /^[a-z]{2,}$/.test(l) ? l : null;
  }
  return null;
}

export function initialOf(word, lang) {
  if (typeof word !== 'string' || !word) return null;
  if (lang === 'ko') {
    const code = word.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return null;
    const c = CHOSEONG[Math.floor(code / 588)];
    return FOLD[c] ?? c;
  }
  const c = word[0].toLowerCase();
  return EN_LETTERS.includes(c) ? c : null;
}
