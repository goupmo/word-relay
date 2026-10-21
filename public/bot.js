import { initialOf } from '../shared/chars.js';

// The computer opponent: picks an unused word from the category's own list.
// `state` is anything with { lang, usedLetters, usedWords } (a round or the room view's round).
// blankChance: sometimes it draws a blank so the player can win.
export function pickBotWord(state, category, rand, blankChance = 0.12) {
  if (rand() < blankChance) return null;
  const options = category.words.filter(
    (w) => !state.usedWords.includes(w) && !state.usedLetters.includes(initialOf(w, state.lang)),
  );
  return options.length ? options[Math.floor(rand() * options.length)] : null;
}
