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

class Sheet {
  constructor(inkEl) {
    this.el = inkEl;
    this.strikes = [];
  }

  clear() {
    this.strikes = [];
    this.el.textContent = '';
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

  /** A printable PDF: real Courier text at true US Letter size. */
  toPDF() {
    return PDFExport.build(this.strikes);
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
