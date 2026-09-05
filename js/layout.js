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

/* What to say when someone reaches for a key the machine does not have,
   and which keys to light up on the keyboard instead. The substitutions
   are the ones typists actually used. */
const MISSING_KEYS = {
  '1': { say: 'There is no 1 on this machine.',
         use: 'Typebars cost money. Use a capital I — everyone did.',
         keys: ['I'] },
  '0': { say: 'There is no 0 on this machine.',
         use: 'Use a capital O for zero.',
         keys: ['O'] },
  '!': { say: 'There is no exclamation mark.',
         use: "Build one: apostrophe, Backspace, then a period.",
         keys: ["'", '.'] },
  '+': { say: 'There is no plus sign.',
         use: 'Overprint a hyphen and a slash.',
         keys: ['-', '/'] },
  '=': { say: 'There is no equals sign.',
         use: 'Overprint a hyphen and an underscore.',
         keys: ['-', '_'] },
  '*': { say: 'There is no asterisk.',
         use: 'Overprint an x and a hyphen.',
         keys: ['x', '-'] }
};

function missingKeyInfo(ch) {
  return MISSING_KEYS[ch] || {
    say: 'This machine has no "' + ch + '" key.',
    use: 'Everything it can print is on the keyboard below.',
    keys: []
  };
}
