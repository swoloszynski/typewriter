# Typewriter Simulator

A browser typewriter that behaves like a machine instead of a text box.
There is no cursor and no undo: the carriage sits where it sits, and every
key stamps ink onto the sheet at that exact spot. Overprinting is the whole
medium — accents, bold, exclamation marks and blacked-out mistakes all fall
out of letting strikes stack in one column.

## Run it

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173/. No build step, no dependencies.

## What is simulated

- **A real page.** US Letter at 100dpi, 10 characters per inch across and
  6 lines per inch down — an 85x66 grid, the true dimensions of a typed page.
- **A moving sheet.** The type guide is fixed to the screen and the paper
  slides beneath it, left one column per character, thrown back on return.
- **Stacked strikes.** A cell holds a list of impressions, not a character.
- **A period-correct keyboard.** No `1` (use capital I), no `0` (use capital
  O), no `!` (apostrophe, backspace, period), no `+` or `=`. Dead keys for
  the four accents print without advancing the carriage.
- **The escapement.** Backspace moves the carriage back without erasing; the
  bell rings eight columns before the right margin; the keys lock at the
  margin unless the margin release is held.
- **Ribbon and correction tape.** Black, red, and a correcting ribbon that
  lifts a character back off the page.
- **Sound**, synthesised with the Web Audio API — no audio files.

## Pages

**NEW PAGE** keeps the sheet you are on and winds a fresh one in behind it.
Finished pages stack on the desk beside the machine; click one to roll it
back in, carriage and all — the carriage belongs to the page, so you come
back to where you stopped writing. **START OVER** throws the whole document
away, and asks first.

A PNG is a picture of one sheet, so it saves the page you are looking at.
The PDF and the text are the document, so they take every page.

## Exporting

**PNG** flattens the sheet to a 2x bitmap — the paper colour, the texture,
the whole object.

**PDF** is for printing. It is written by hand in `js/pdf.js` with no
library, because the page is an unusually good fit for plain vector PDF:
the machine types in Courier, and Courier is one of the fourteen fonts
every PDF reader must already have. Nothing is embedded, the file stays a
few kilobytes, and the output is real selectable text on a true US Letter
page at exactly ten characters to the inch — the same measurements the
sheet was typed at. No paper colour is drawn, so it prints on the paper you
actually put in the tray.

Per-strike ink density is flattened against the paper colour rather than
carried as transparency, which is exact over an opaque background.

## Keys

| Key | Does |
| --- | --- |
| `Return` | carriage return |
| `Backspace` | carriage back, no erase |
| `Tab` | next tab stop |
| `Esc` | zoom between the typing view and the whole page |
| `F1` | change ribbon |
| `F2` | correction tape |
| `F3` | half space |
| `F4` | margin release |
| arrows | walk the carriage / roll the platen |

Click anywhere on the sheet to move the carriage there. **PNG** and **PDF**
save the page.

## Files

| File | Holds |
| --- | --- |
| `js/layout.js` | the keyboard layout and its deliberate gaps |
| `js/audio.js` | synthesised strikes, bell, carriage return |
| `js/paper.js` | the sheet: strike model, rendering, exports |
| `js/pdf.js` | a hand-written vector PDF writer |
| `serve.py` | dev server that refuses to let the browser cache |
| `js/app.js` | the mechanism: carriage, margins, input, view transform |
