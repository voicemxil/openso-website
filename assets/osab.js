/* OSAB floating link — reroll its look on every page load, just for fun. Randomizes:
   (1) the font, (2) the rainbow-gradient flow direction, (3) the word's capitalization.
   Only the ONE chosen web font is fetched per load (not the whole pool). */
(function () {
  var link = document.querySelector('.osab-link');
  var word = link && link.querySelector('.osab-word');
  if (!link || !word) return;

  /* Font pool. `google` = Google Fonts css2 axis spec (null = system font, nothing to load).
     `scale` normalizes apparent size across very different faces — it's an em, applied to the
     word, so it stays relative to the link's responsive font-size. `track` = letter-spacing
     (kept at 0 for cursive/handwriting so the strokes still connect). */
  var FONTS = [
    { label: 'kanit',     css: "'Kanit', sans-serif",                  weight: 800, style: 'italic', track: '.5px', scale: 1,    google: 'Kanit:ital,wght@1,800' },
    { label: 'cormorant', css: "'Cormorant', Georgia, serif",          weight: 600, style: 'italic', track: '.3px', scale: 1.28, google: 'Cormorant:ital,wght@1,600' },
    { label: 'pacifico',  css: "'Pacifico', cursive",                  weight: 400, style: 'normal', track: '0',   scale: 1.02, google: 'Pacifico' },
    { label: 'caveat',    css: "'Caveat', cursive",                    weight: 700, style: 'normal', track: '0',   scale: 1.4,  google: 'Caveat:wght@700' },
    { label: 'comic',     css: "'Comic Sans MS','Comic Sans',cursive", weight: 700, style: 'italic', track: '0',   scale: 1.05, google: null },
    { label: 'papyrus',   css: "'Papyrus', fantasy",                   weight: 400, style: 'normal', track: '0',   scale: .95,  google: null }
  ];
  var CASES = ['OSAB', 'osab', 'oSab', 'Osab'];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  var font = pick(FONTS);

  // Lazily fetch only the chosen Google font (display=swap: fallback shows, then swaps in).
  if (font.google) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + font.google + '&display=swap';
    document.head.appendChild(l);
  }
  link.style.fontFamily = font.css;
  link.style.fontWeight = String(font.weight);
  link.style.fontStyle = font.style;
  link.style.letterSpacing = font.track;
  word.style.fontSize = font.scale + 'em';
  link.dataset.osabFont = font.label; // handy for debugging / inspection

  // Gradient flow: rainbow scrolls one way or the other.
  word.style.animationDirection = Math.random() < 0.5 ? 'normal' : 'reverse';

  // Capitalization variant — visible text only; the link keeps its "OSAB on Tumblr" aria-label.
  word.textContent = pick(CASES);
})();
