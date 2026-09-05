/* ------------------------------------------------------------------ *
 * PDF export.
 *
 * Written by hand, with no library, because this page is an unusually
 * good fit for a plain vector PDF: the machine types in Courier, and
 * Courier is one of the fourteen fonts every PDF reader is required to
 * have. Nothing needs embedding, the file stays small, and the result
 * is real selectable text that prints at exactly ten characters to the
 * inch — the same measurements the sheet was typed at.
 *
 * The only thing that cannot be said directly is a partly-inked strike.
 * Rather than carry a transparency group around for it, each strike's
 * alpha is flattened against the paper colour, which is exact whenever
 * the background is opaque — and paper is.
 * ------------------------------------------------------------------ */

const PDFExport = (() => {

  const PT = 72 / 100;            // page pixels (100dpi) -> PDF points
  const PAPER = [0.949, 0.933, 0.882];   // #f2eee1, for flattening only

  /* Trim floats: PDF does not care, but the file is smaller and far
     easier to read when something goes wrong. */
  const f = (n) => {
    const s = n.toFixed(3);
    return s.replace(/\.?0+$/, '') || '0';
  };

  const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  };

  /* Latin-1 doubles as WinAnsiEncoding across the range this machine can
     print, so a code point under 256 is already its own byte. */
  function encodeGlyph(ch) {
    const cp = ch.codePointAt(0);
    if (cp > 255) return null;
    const c = String.fromCharCode(cp);
    if (c === '(' || c === ')' || c === '\\') return '\\' + c;
    if (cp < 32) return null;
    return c;
  }

  function contentStream(strikes) {
    const out = [];
    out.push('BT');
    out.push('/F1 ' + f(PAGE.fontSize * PT) + ' Tf');

    let lastColor = null;

    for (const s of strikes) {
      const glyph = encodeGlyph(s.ch);
      if (glyph === null) continue;

      // Flatten the strike's ink density against the paper behind it.
      const ink = hexToRgb(s.color);
      const col = ink.map((v, i) => PAPER[i] + (v - PAPER[i]) * s.alpha);
      const key = col.map(f).join(' ');
      if (key !== lastColor) {
        out.push(key + ' rg');
        lastColor = key;
      }

      const x = (s.col * PAGE.chW + s.jx) * PT;
      const y = (PAGE.h - (s.line * PAGE.lineH + PAGE.baseline + s.jy)) * PT;

      // CSS rotates clockwise with y pointing down; PDF is the mirror of
      // that on both counts, so the angle simply flips sign.
      const th = (-s.rot * Math.PI) / 180;
      const cos = Math.cos(th), sin = Math.sin(th);

      // Rotate about the middle of the glyph rather than its origin.
      const dx = -(PAGE.chW * PT) / 2;
      const dy = -(PAGE.fontSize * 0.3 * PT);
      const cx = x - dx, cy = y - dy;
      const e = cx + dx * cos - dy * sin;
      const g = cy + dx * sin + dy * cos;

      out.push(
        [f(cos), f(sin), f(-sin), f(cos), f(e), f(g)].join(' ') +
        ' Tm (' + glyph + ') Tj'
      );
    }

    out.push('ET');
    return out.join('\n');
  }

  /** Assemble the file, tracking byte offsets for the xref table. */
  function build(strikes) {
    const content = contentStream(strikes);
    const w = PAGE.w * PT, h = PAGE.h * PT;

    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(w) + ' ' + f(h) + ']' +
        ' /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier' +
        ' /Encoding /WinAnsiEncoding >>'
    ];

    let file = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(file.length);
      file += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });

    const xref = file.length;
    file += 'xref\n0 ' + (objects.length + 1) + '\n';
    file += '0000000000 65535 f \n';
    for (const off of offsets) {
      file += String(off).padStart(10, '0') + ' 00000 n \n';
    }
    file += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\n';
    file += 'startxref\n' + xref + '\n%%EOF\n';

    // Every character written above is a single byte by construction,
    // so string offsets and byte offsets agree and the xref is valid.
    const bytes = new Uint8Array(file.length);
    for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  return { build };
})();
