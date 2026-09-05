/* ------------------------------------------------------------------ *
 * Keyboard layout of a mid-century office typewriter.
 *
 * The notable absences are the point of the whole exercise: there is no
 * `1` (type a capital I), no `0` (type a capital O), no `!` (apostrophe,
 * backspace, period) and no `+` or `=`. Typebars cost money, and a
 * typist could always fake the rest.
 * ------------------------------------------------------------------ */

const DEAD_KEYS = ['´', '`', '¨', '¸']; // acute, grave, diaeresis, cedilla

/* Each row is a list of key definitions:
 *   { b: base char, s: shifted char }         a printing key
 *   { fn: action id, label, sub, w }          a function key
 * `letter: true` marks A-Z, whose shifted form is just the capital.  */
const KEY_ROWS = [
  [
    { fn: 'halfspace', label: 'HS',  sub: 'F3', w: 'wide' },
    { b: '2', s: '"' }, { b: '3', s: '#' }, { b: '4', s: '$' },
    { b: '5', s: '%' }, { b: '6', s: '_' }, { b: '7', s: '&' },
    { b: '8', s: "'" }, { b: '9', s: '(' }, { b: '-', s: ')' },
    { b: '´', s: '¸', dead: true },
    { b: '`',      s: '¨', dead: true },
    { fn: 'marginrelease', label: 'MR', sub: 'F4', w: 'wide' }
  ],
  [
    ...'qwertyuiop'.split('').map(c => ({ b: c, s: c.toUpperCase(), letter: true })),
    { b: '¼', s: '½' },
    { fn: 'backspace', label: 'BK', sub: '⌫', w: 'wide' }
  ],
  [
    ...'asdfghjkl'.split('').map(c => ({ b: c, s: c.toUpperCase(), letter: true })),
    { b: ';', s: ':' },
    { b: '@', s: '¢' },
    { fn: 'return', label: 'RET', sub: '↵', w: 'wide' }
  ],
  [
    { fn: 'shift', label: 'SHIFT', sub: '⇧', w: 'wide' },
    ...'zxcvbnm'.split('').map(c => ({ b: c, s: c.toUpperCase(), letter: true })),
    { b: ',', s: ',' }, { b: '.', s: '.' }, { b: '/', s: '?' },
    { fn: 'shift', label: 'SHIFT', sub: '⇧', w: 'wide' }
  ],
  [
    { fn: 'space', label: '', sub: '', w: 'space' }
  ]
];

/* Every glyph this machine is physically able to print. */
const PRINTABLE = (() => {
  const set = new Set([' ']);
  for (const row of KEY_ROWS) {
    for (const k of row) {
      if (k.b) set.add(k.b);
      if (k.s) set.add(k.s);
    }
  }
  return set;
})();

/* Hints shown when someone reaches for a key the machine does not have. */
const MISSING_KEY_HINTS = {
  '1': 'No 1 on this machine — type a capital I.',
  '0': 'No 0 on this machine — type a capital O.',
  '!': "No ! key — type ' then Backspace then a period.",
  '+': 'No + key — overprint a hyphen and a slash.',
  '=': 'No = key — overprint a hyphen and an underscore.',
  '*': 'No * key — overprint x and a hyphen.'
};

function hintForMissingKey(ch) {
  return MISSING_KEY_HINTS[ch] || 'This machine has no "' + ch + '" key.';
}
