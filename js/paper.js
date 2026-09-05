/* ------------------------------------------------------------------ *
 * The sheet.
 *
 * A page is US Letter drawn at 100dpi: 850x1100 px, 10 characters per
 * inch across and 6 lines per inch down. That gives an 85x66 grid, the
 * real dimensions of a typed page.
 *
 * Crucially a cell is not "the character here" but "the list of strikes
 * that have landed here". Overprinting is the whole medium: accents,
 * bold, exclamation marks, blacked-out mistakes and typewriter art all
 * fall out of letting strikes stack.
 * ------------------------------------------------------------------ */

const PAGE = {
  w: 850,
  h: 1100,
  cols: 85,
  lines: 66,
  chW: 10,
  lineH: 1100 / 66,
  fontSize: 16.6667,
  font: '"Courier New", "Nimbus Mono PS", Courier, monospace',

  /* Where the baseline sits inside a line box, measured from its top.
     The browser derives this from the font's own ascent and descent;
     both exporters need the same number or the ink drifts off the line
     it was typed on. Verified against the rendered sheet. */
  baseline: 12.77
};

const MARGIN = {
  left: 10,   // one inch in
  right: 75,  // one inch from the right edge
  top: 6,     // one inch down
  bell: 8     // columns of warning before the right margin
};

const INK = { black: '#23211e', red: '#b5322e' };

/* What each dead key leaves on the page, and the combining mark it stands
   for. Overprinting an accent onto a letter is how the machine makes an
   accented character; composing them is how we read it back. */
const COMBINING = {
  '\u00b4': '\u0301',   // acute
  '`':       '\u0300',   // grave
  '\u00a8': '\u0308',   // diaeresis
  '\u00b8': '\u0327'    // cedilla
};

/* Overprints where two strikes unambiguously mean one character.
   Deliberately short. Hyphen-over-underscore would give an equals sign,
   but it is also just what underlining a hyphen looks like, and typists
   underlined far more often than they faked an equals sign. */
const OVERPRINTS = [
  { of: ["'", '.'], gives: '!' },
  { of: ['-', '/'], gives: '+' }
];

/**
 * Read one cell of the page back as a single character.
 *
 * The page holds impressions, not characters, so a cell may have several
 * stacked in it. Taking the topmost is the right fallback but the wrong
 * default: it would turn the machine's own tricks back into the raw
 * strikes they were built from, and hand back a period where the sheet
 * plainly reads "!".
 */
function flattenCell(chars) {
  if (chars.length === 1) return chars[0];

  const unique = [...new Set(chars)];

  // Struck twice to embolden it. Still one letter.
  if (unique.length === 1) return unique[0];

  // A dead-key accent over the letter beneath it.
  const accents = chars.filter(c => COMBINING[c]);
  if (accents.length) {
    const base = chars.filter(c => !COMBINING[c]).pop();
    if (base) {
      const composed = (base + accents.map(a => COMBINING[a]).join('')).normalize('NFC');
      if ([...composed].length === 1) return composed;
    }
  }

  for (const o of OVERPRINTS) {
    if (unique.length === o.of.length && o.of.every(c => unique.includes(c))) return o.gives;
  }

  // Underlining does not change the letter it sits under.
  const inked = chars.filter(c => c !== '_');
  if (inked.length && inked.length < chars.length) return inked[inked.length - 1];

  // Anything else: the last impression is the one sitting on top.
  return chars[chars.length - 1];
}

class Sheet {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'ink';
    this.strikes = [];

    // Where the carriage was left on this page, so returning to it puts
    // you back where you stopped rather than at the top.
    this.col = MARGIN.left;
    this.line = MARGIN.top;
    this.bellRung = false;
  }

  /**
   * Stamp one character. Every impression is a little off: the type slug
   * never lands in exactly the same place twice, the ribbon is unevenly
   * inked, and the force of the keystroke varies. Without that jitter
   * the output reads as a screenshot of a monospace font.
   */
  stamp(ch, col, line, color) {
    const s = {
      ch, col, line, color,
      jx: (Math.random() - 0.5) * 1.7,
      jy: (Math.random() - 0.5) * 1.5,
      rot: (Math.random() - 0.5) * 3.2,
      alpha: Math.random() < 0.06
        ? 0.34 + Math.random() * 0.16   // an occasional weak strike
        : 0.74 + Math.random() * 0.26
    };
    this.strikes.push(s);
    this.el.appendChild(this._render(s, true));
    return s;
  }

  _render(s, fresh) {
    const el = document.createElement('span');
    el.className = 'ch' + (fresh ? ' fresh' : '');
    el.textContent = s.ch;
    const tf = `translate(${s.jx.toFixed(2)}px, ${s.jy.toFixed(2)}px) rotate(${s.rot.toFixed(2)}deg)`;
    el.style.setProperty('--tf', tf);
    el.style.setProperty('--a', s.alpha.toFixed(3));
    el.style.left = (s.col * PAGE.chW).toFixed(2) + 'px';
    el.style.top = (s.line * PAGE.lineH).toFixed(2) + 'px';
    el.style.transform = tf;
    el.style.color = s.color;
    el.style.opacity = s.alpha.toFixed(3);
    s.el = el;
    return el;
  }

  /**
   * Correction tape: lift every impression sitting in this column off
   * the page. A real correcting ribbon covered ink with opaque white,
   * which took the whole cell with it.
   */
  lift(col, line) {
    const kept = [];
    let removed = 0;
    for (const s of this.strikes) {
      if (s.line === line && Math.abs(s.col - col) < 0.5) {
        if (s.el) s.el.remove();
        removed++;
      } else {
        kept.push(s);
      }
    }
    this.strikes = kept;
    return removed;
  }

  isEmpty() { return this.strikes.length === 0; }

  /* ------------------------------------------------------ persistence */

  /**
   * A compact form for storage. Strikes become plain arrays rather than
   * objects -- a full page is a few thousand of them, and the field names
   * would otherwise be most of the file.
   *
   * The jitter has to be stored, not regenerated. It is what makes this
   * page this page; rolling fresh numbers on load would give back the
   * same words on visibly different paper.
   */
  toJSON() {
    return {
      col: this.col,
      line: this.line,
      bell: this.bellRung,
      s: this.strikes.map((k) => [
        k.ch,
        +k.col.toFixed(1),
        k.line,
        k.color === INK.red ? 1 : 0,
        +k.jx.toFixed(2),
        +k.jy.toFixed(2),
        +k.rot.toFixed(2),
        +k.alpha.toFixed(3)
      ])
    };
  }

  /** Put stored strikes back on the page, without re-animating them. */
  restore(rows) {
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      if (!Array.isArray(r) || typeof r[0] !== 'string') continue;
      const s = {
        ch: r[0], col: +r[1] || 0, line: +r[2] || 0,
        color: r[3] === 1 ? INK.red : INK.black,
        jx: +r[4] || 0, jy: +r[5] || 0, rot: +r[6] || 0,
        alpha: typeof r[7] === 'number' ? r[7] : 1
      };
      this.strikes.push(s);
      frag.appendChild(this._render(s, false));
    }
    this.el.appendChild(frag);
  }

  /**
   * The sheet as plain text.
   *
   * Columns are shifted so the left margin becomes column zero -- the
   * one-inch margin is a property of the paper, not of the writing, and
   * ten leading spaces on every line is not what anyone wants to paste
   * into a document. Relative indentation is kept.
   */
  toText() {
    if (!this.strikes.length) return '';

    const cells = new Map();
    let minCol = Infinity, maxCol = -Infinity;
    let minLine = Infinity, maxLine = -Infinity;

    for (const s of this.strikes) {
      const col = Math.round(s.col);
      const key = s.line + ',' + col;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(s.ch);
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
      if (s.line < minLine) minLine = s.line;
      if (s.line > maxLine) maxLine = s.line;
    }

    const lines = [];
    for (let line = minLine; line <= maxLine; line++) {
      let out = '';
      for (let col = minCol; col <= maxCol; col++) {
        const chars = cells.get(line + ',' + col);
        out += chars ? flattenCell(chars) : ' ';
      }
      lines.push(out.replace(/\s+$/, ''));
    }
    return lines.join('\n');
  }

  /** Flatten the sheet to a canvas so it can be saved as a PNG. */
  toCanvas(scale = 2) {
    const cv = document.createElement('canvas');
    cv.width = PAGE.w * scale;
    cv.height = PAGE.h * scale;
    const c = cv.getContext('2d');
    c.scale(scale, scale);

    c.fillStyle = '#f2eee1';
    c.fillRect(0, 0, PAGE.w, PAGE.h);

    c.font = PAGE.fontSize + 'px ' + PAGE.font;
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';

    for (const s of this.strikes) {
      const x = s.col * PAGE.chW + s.jx;
      const y = s.line * PAGE.lineH + PAGE.baseline + s.jy;
      c.save();
      c.translate(x + PAGE.chW / 2, y);
      c.rotate((s.rot * Math.PI) / 180);
      c.globalAlpha = s.alpha;
      c.fillStyle = s.color;
      c.fillText(s.ch, -PAGE.chW / 2, 0);
      c.restore();
    }
    return cv;
  }
}
