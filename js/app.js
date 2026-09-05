/* ------------------------------------------------------------------ *
 * The machine.
 *
 * The illusion depends on one inversion: the type guide is nailed to
 * the screen and the paper moves. Typing slides the sheet left one
 * column, a carriage return throws it back to the right and rolls it up
 * one line. That is why there is no cursor to be found anywhere.
 * ------------------------------------------------------------------ */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const stage     = $('stage');
  const wrap      = $('paperWrap');
  const paper     = $('paper');
  const inkEl     = $('ink');
  const guide     = $('typeGuide');
  const typebar   = $('typebar');
  const hintEl    = $('hint');
  const keyboardEl= $('keyboard');
  const ribbonEl  = $('ribbonStrip');
  const carriageEl= $('carriage');
  const tableEl   = $('paperTable');
  const helpEl    = $('help');
  const alertEl   = $('keyAlert');
  const textModal = $('textModal');

  const sheet = new Sheet(inkEl);

  const TYPE_SCALE = 1.8;
  const TAB_STOP   = 5;

  const state = {
    col: MARGIN.left,
    line: MARGIN.top,
    ribbon: 'black',      // black | red | correction
    shiftLock: false,
    shiftHeld: false,
    marginRelease: false,
    zoom: 'type',         // type | page
    sound: true,
    strict: true,
    bellRung: false,
    touched: false
  };

  /* The carriage scale, one tick per column. Positions are percentages
     of the sheet width so the ruler stays true at any zoom. */
  (function buildScale() {
    const el = $('scale');
    for (let c = 0; c <= PAGE.cols; c++) {
      const pct = (c * PAGE.chW / PAGE.w) * 100;
      const tick = document.createElement('i');
      if (c % 5 === 0) tick.className = 'major';
      tick.style.left = pct + '%';
      el.appendChild(tick);
      if (c % 10 === 0 && c > 0) {
        const label = document.createElement('b');
        label.textContent = c;
        label.style.left = pct + '%';
        el.appendChild(label);
      }
    }
  })();

  /* ------------------------------------------------------- the caret */

  const caret = document.createElement('div');
  Object.assign(caret.style, {
    position: 'absolute',
    width: PAGE.chW + 'px',
    height: '2px',
    background: 'rgba(201,112,92,.85)',
    pointerEvents: 'none',
    transition: 'left .07s linear, top .12s ease'
  });
  paper.appendChild(caret);

  /* --------------------------------------------------- view geometry */

  /* The strike point. Biased left of centre: at the start of a line the
     sheet lies to the right of it, and that is where the writing goes. */
  function focusPoint() {
    return {
      x: Math.max(260, stage.clientWidth * 0.44),
      y: Math.max(120, stage.clientHeight - 62)
    };
  }

  function pageScale() {
    return Math.min(
      (stage.clientWidth - 80) / PAGE.w,
      (stage.clientHeight - 60) / PAGE.h
    );
  }

  /** Move the sheet so the current cell sits under the type guide. */
  function updateView(dur = 70, ease = 'linear') {
    let s, tx, ty;

    if (state.zoom === 'page') {
      s = pageScale();
      tx = (stage.clientWidth - PAGE.w * s) / 2;
      ty = (stage.clientHeight - PAGE.h * s) / 2 - 6;
      guide.style.opacity = '0';
      carriageEl.classList.add('hidden');
      tableEl.classList.add('hidden');
    } else {
      const f = focusPoint();
      s = TYPE_SCALE;
      tx = f.x - s * (state.col * PAGE.chW + PAGE.chW / 2);
      ty = f.y - s * (state.line * PAGE.lineH + PAGE.lineH / 2);
      guide.style.left = f.x + 'px';
      guide.style.top = f.y + 'px';
      guide.style.opacity = '1';
      carriageEl.classList.remove('hidden');
      tableEl.classList.remove('hidden');
    }

    /* The platen holds the paper, so it travels with it -- same tx, and
       the same easing, or the sheet would visibly slide on the roller. */
    carriageEl.style.width = (PAGE.w * s).toFixed(1) + 'px';
    carriageEl.style.transition = `transform ${dur}ms ${ease}, opacity .3s`;
    carriageEl.style.transform = `translateX(${tx.toFixed(2)}px)`;

    wrap.style.transition = `transform ${dur}ms ${ease}`;
    wrap.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;

    caret.style.left = (state.col * PAGE.chW) + 'px';
    caret.style.top = (state.line * PAGE.lineH + PAGE.lineH - 1.5) + 'px';

    $('roLine').textContent = state.line + 1;
    $('roCol').textContent = Math.round(state.col) + 1;
  }

  /* ------------------------------------------------------------ hint */

  let hintTimer = null;
  function say(msg, warn) {
    hintEl.textContent = msg;
    hintEl.classList.remove('gone');
    hintEl.classList.toggle('warn', !!warn);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.add('gone'), 2600);
  }

  /* ----------------------------------------------- missing-key alert */

  let alertTimer = null;

  function showKeyAlert(ch) {
    const info = missingKeyInfo(ch);
    $('kaChar').textContent = ch;
    $('kaTitle').textContent = info.say;
    $('kaUse').textContent = info.use;

    hintEl.classList.add('gone');
    alertEl.hidden = false;
    alertEl.classList.remove('shake', 'out');
    void alertEl.offsetWidth;              // restart the animation
    alertEl.classList.add('shake');

    clearSuggestions();
    info.keys.forEach(suggestKey);

    clearTimeout(alertTimer);
    alertTimer = setTimeout(dismissKeyAlert, 4200);
  }

  function dismissKeyAlert() {
    if (alertEl.hidden) return;
    clearTimeout(alertTimer);
    clearSuggestions();
    alertEl.classList.add('out');
    setTimeout(() => {
      alertEl.hidden = true;
      alertEl.classList.remove('out', 'shake');
    }, 300);
  }

  function suggestKey(ch) {
    for (const el of keyEls) {
      if (el.dataset.b === ch || el.dataset.s === ch) { el.classList.add('suggest'); return; }
    }
  }

  function clearSuggestions() {
    for (const el of keyEls) el.classList.remove('suggest');
  }

  function firstTouch() {
    if (state.touched) return;
    state.touched = true;
    hintEl.classList.add('gone');
    Sound.unlock();
  }

  /* --------------------------------------------------- the mechanism */

  function inkColor() {
    return state.ribbon === 'red' ? INK.red : INK.black;
  }

  function atRightMargin() {
    return state.col >= MARGIN.right && !state.marginRelease;
  }

  function advance(n) {
    const before = state.col;
    state.col = Math.min(state.col + n, state.marginRelease ? PAGE.cols - 1 : MARGIN.right);

    const bellCol = MARGIN.right - MARGIN.bell;
    if (!state.bellRung && before < bellCol && state.col >= bellCol) {
      state.bellRung = true;
      Sound.bell();
    }
  }

  function flashTypebar() {
    if (state.zoom !== 'type') return;
    typebar.classList.remove('strike');
    void typebar.offsetWidth;
    typebar.classList.add('strike');
  }

  /** Print one character at the carriage position. */
  function type(ch) {
    firstTouch();
    dismissKeyAlert();

    if (ch === ' ') {
      if (atRightMargin()) return marginLock();
      advance(1);
      Sound.space();
      updateView(70);
      return;
    }

    if (atRightMargin()) return marginLock();

    if (state.ribbon === 'correction') {
      const lifted = sheet.lift(state.col, state.line);
      advance(1);
      Sound.strike();
      flashTypebar();
      updateView(70);
      if (!lifted) say('Nothing to lift off there.');
      return;
    }

    const dead = DEAD_KEYS.includes(ch);
    sheet.stamp(ch, state.col, state.line, inkColor());
    flashTypebar();
    Sound.strike();

    if (!dead) advance(1);
    updateView(70);
  }

  function marginLock() {
    Sound.jam();
    say('Right margin — throw the carriage, or hold margin release (F4).', true);
  }

  function backspace() {
    firstTouch();
    const floor = state.marginRelease ? 0 : MARGIN.left;
    if (state.col <= floor) { Sound.jam(); return; }
    state.col = Math.max(floor, state.col - 1);
    Sound.backspace();
    updateView(90, 'ease-out');
  }

  function halfSpace() {
    firstTouch();
    if (atRightMargin()) return marginLock();
    state.col += 0.5;
    Sound.backspace();
    updateView(80, 'ease-out');
  }

  function carriageReturn() {
    firstTouch();
    state.col = MARGIN.left;
    state.line = Math.min(state.line + 1, PAGE.lines - 1);
    state.bellRung = false;
    state.marginRelease = false;
    syncKeyLatches();
    Sound.carriageReturn();
    updateView(420, 'cubic-bezier(.16,.9,.25,1)');

    if (state.line >= PAGE.lines - 4) say('You are running off the bottom of the sheet.');
  }

  function rollPlaten(dir) {
    firstTouch();
    const next = state.line + dir;
    if (next < 0 || next > PAGE.lines - 1) return;
    state.line = next;
    Sound.platen();
    updateView(200, 'ease-out');
  }

  function moveCarriage(dir) {
    firstTouch();
    const lo = state.marginRelease ? 0 : MARGIN.left;
    const hi = state.marginRelease ? PAGE.cols - 1 : MARGIN.right;
    state.col = Math.min(hi, Math.max(lo, state.col + dir));
    Sound.backspace();
    updateView(90, 'ease-out');
  }

  function tab() {
    firstTouch();
    const next = Math.min(
      MARGIN.right,
      MARGIN.left + (Math.floor((state.col - MARGIN.left) / TAB_STOP) + 1) * TAB_STOP
    );
    if (next === state.col) return;
    state.col = next;
    Sound.platen();
    updateView(220, 'cubic-bezier(.2,.9,.3,1)');
  }

  /* -------------------------------------------------------- settings */

  const RIBBONS = ['black', 'red', 'correction'];

  function cycleRibbon() {
    firstTouch();
    state.ribbon = RIBBONS[(RIBBONS.indexOf(state.ribbon) + 1) % RIBBONS.length];
    applyRibbon();
    Sound.platen();
    say('Ribbon: ' + state.ribbon.toUpperCase());
  }

  function toggleCorrection() {
    firstTouch();
    state.ribbon = state.ribbon === 'correction' ? 'black' : 'correction';
    applyRibbon();
    Sound.platen();
    say(state.ribbon === 'correction'
      ? 'Correction tape in. Retype a character to lift it off.'
      : 'Ribbon: BLACK');
  }

  function applyRibbon() {
    ribbonEl.classList.toggle('on-red', state.ribbon === 'red');
    ribbonEl.classList.toggle('on-corr', state.ribbon === 'correction');
    const ro = $('roRibbon');
    ro.querySelector('b').textContent = state.ribbon.toUpperCase();
    ro.querySelector('.swatch').style.background =
      state.ribbon === 'red' ? INK.red :
      state.ribbon === 'correction' ? '#ffffff' : INK.black;
  }

  function toggleZoom() {
    state.zoom = state.zoom === 'type' ? 'page' : 'type';
    updateView(380, 'cubic-bezier(.3,.9,.3,1)');
  }

  function toggleMarginRelease() {
    firstTouch();
    state.marginRelease = !state.marginRelease;
    syncKeyLatches();
    say(state.marginRelease
      ? 'Margin release held — the carriage will run past the margins.'
      : 'Margin release off.');
  }

  function newSheet() {
    firstTouch();
    wrap.style.transition = 'transform .45s ease-in, opacity .45s ease-in';
    wrap.style.transform += ' translateY(-140px)';
    wrap.style.opacity = '0';
    Sound.feed();
    setTimeout(() => {
      sheet.clear();
      paper.appendChild(caret);
      state.col = MARGIN.left;
      state.line = MARGIN.top;
      state.bellRung = false;
      wrap.style.transition = 'none';
      wrap.style.opacity = '1';
      updateView(0);
      requestAnimationFrame(() => updateView(320, 'cubic-bezier(.2,.9,.3,1)'));
    }, 450);
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function savePNG() {
    if (sheet.isEmpty()) return say('Nothing typed on this sheet yet.');
    sheet.toCanvas(2).toBlob((blob) => {
      download(blob, `typed-page-${stamp()}.png`);
    }, 'image/png');
    say('Saved as a PNG.');
  }

  function savePDF() {
    if (sheet.isEmpty()) return say('Nothing typed on this sheet yet.');
    download(sheet.toPDF(), `typed-page-${stamp()}.pdf`);
    say('Saved as a PDF — US Letter, ready to print.');
  }

  function toggleHelp() {
    helpEl.hidden = !helpEl.hidden;
    if (!helpEl.hidden) textModal.hidden = true;
  }

  function toggleText() {
    textModal.hidden = !textModal.hidden;
    if (textModal.hidden) return;
    helpEl.hidden = true;
    const text = sheet.toText();
    const out = $('textOut');
    out.textContent = text || 'Nothing typed on this sheet yet.';
    out.classList.toggle('empty', !text);
  }

  function flashButton(btn, label) {
    const was = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = was; }, 1400);
  }

  async function copyText() {
    const text = sheet.toText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Some browsers refuse the async clipboard API outside a tight
      // gesture; the old selection trick still works everywhere.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    flashButton($('copyText'), 'COPIED');
  }

  function downloadTextFile() {
    const text = sheet.toText();
    if (!text) return;
    download(new Blob([text], { type: 'text/plain;charset=utf-8' }),
             `typed-page-${stamp()}.txt`);
    flashButton($('downloadText'), 'SAVED');
  }

  /* -------------------------------------------------------- keyboard */

  const keyEls = [];

  function buildKeyboard() {
    KEY_ROWS.forEach((row, ri) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'krow';
      if (ri === 2) rowEl.style.paddingLeft = '18px';

      for (const def of row) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'key';
        if (def.w) el.classList.add(def.w);
        if (def.fn) el.classList.add('fn');
        if (def.dead) el.classList.add('dead');

        if (def.fn) {
          el.innerHTML = def.label
            ? `${def.label}<span class="sub">${def.sub || ''}</span>`
            : '';
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            runAction(def.fn);
            bump(el);
          });
        } else {
          const showShifted = def.s && def.s !== def.b && !def.letter;
          el.classList.toggle('two', !!showShifted);
          el.innerHTML =
            (showShifted ? `<span class="shifted">${esc(def.s)}</span>` : '') +
            `<span class="base">${esc(def.letter ? def.s : def.b)}</span>`;
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            type(shifted() ? def.s : def.b);
            releaseShiftLock();
            bump(el);
          });
        }

        el.dataset.b = def.b || '';
        el.dataset.s = def.s || '';
        el.dataset.fn = def.fn || '';
        rowEl.appendChild(el);
        keyEls.push(el);
      }
      keyboardEl.appendChild(rowEl);
    });
  }

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function bump(el) {
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 90);
  }

  function highlightChar(ch) {
    for (const el of keyEls) {
      if (el.dataset.b === ch || el.dataset.s === ch) { bump(el); return; }
    }
  }

  function highlightFn(fn) {
    for (const el of keyEls) if (el.dataset.fn === fn) bump(el);
  }

  function syncKeyLatches() {
    for (const el of keyEls) {
      if (el.dataset.fn === 'shift') el.classList.toggle('latched', state.shiftLock);
      if (el.dataset.fn === 'marginrelease') el.classList.toggle('latched', state.marginRelease);
    }
  }

  function shifted() { return state.shiftHeld || state.shiftLock; }
  function releaseShiftLock() {
    if (state.shiftLock) { state.shiftLock = false; syncKeyLatches(); }
  }

  function runAction(fn) {
    switch (fn) {
      case 'space':         type(' '); break;
      case 'backspace':     backspace(); break;
      case 'return':        carriageReturn(); break;
      case 'halfspace':     halfSpace(); break;
      case 'marginrelease': toggleMarginRelease(); break;
      case 'shift':
        state.shiftLock = !state.shiftLock;
        syncKeyLatches();
        break;
    }
  }

  /* ----------------------------------------------------- key handling */

  const overlayOpen = () => !helpEl.hidden || !textModal.hidden;

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key;

    // With a panel up, the keyboard belongs to the panel -- otherwise
    // reading the text export types it onto the sheet behind it.
    if (overlayOpen()) {
      if (k === 'Escape') {
        e.preventDefault();
        helpEl.hidden = true;
        textModal.hidden = true;
      }
      return;
    }

    switch (k) {
      case 'Shift':     state.shiftHeld = true; return;
      case 'Enter':     e.preventDefault(); carriageReturn(); highlightFn('return'); return;
      case 'Backspace': e.preventDefault(); backspace(); highlightFn('backspace'); return;
      case 'Tab':       e.preventDefault(); tab(); return;
      case 'Escape':    e.preventDefault(); toggleZoom(); return;
      case 'F1':        e.preventDefault(); cycleRibbon(); return;
      case 'F2':        e.preventDefault(); toggleCorrection(); return;
      case 'F3':        e.preventDefault(); halfSpace(); highlightFn('halfspace'); return;
      case 'F4':        e.preventDefault(); toggleMarginRelease(); highlightFn('marginrelease'); return;
      case 'ArrowLeft':  e.preventDefault(); moveCarriage(-1); return;
      case 'ArrowRight': e.preventDefault(); moveCarriage(1); return;
      case 'ArrowUp':    e.preventDefault(); rollPlaten(-1); return;
      case 'ArrowDown':  e.preventDefault(); rollPlaten(1); return;
    }

    if (k.length !== 1) return;
    e.preventDefault();

    /* The US keyboard has no acute or diaeresis, so borrow the two keys
       that are spare here for the dead accents. */
    let ch = k;
    if (ch === '~') ch = '¨';

    if (ch === ' ') { type(' '); highlightFn('space'); releaseShiftLock(); return; }

    if (!state.strict || PRINTABLE.has(ch)) {
      type(ch);
      highlightChar(ch);
      releaseShiftLock();
    } else {
      firstTouch();
      Sound.jam();
      showKeyAlert(ch);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') state.shiftHeld = false;
  });

  window.addEventListener('blur', () => { state.shiftHeld = false; });

  /* --------------------------------------------- click to move around */

  stage.addEventListener('mousedown', (e) => {
    if (e.target.closest('.help')) return;
    const rect = paper.getBoundingClientRect();
    const s = rect.width / PAGE.w;
    const px = (e.clientX - rect.left) / s;
    const py = (e.clientY - rect.top) / s;
    if (px < 0 || py < 0 || px > PAGE.w || py > PAGE.h) return;

    firstTouch();
    state.col = Math.max(0, Math.min(PAGE.cols - 1, Math.round(px / PAGE.chW)));
    state.line = Math.max(0, Math.min(PAGE.lines - 1, Math.floor(py / PAGE.lineH)));
    state.bellRung = state.col >= MARGIN.right - MARGIN.bell;
    if (state.zoom === 'page') state.zoom = 'type';
    Sound.platen();
    updateView(340, 'cubic-bezier(.2,.9,.3,1)');
  });

  /* -------------------------------------------------------- toolbar */

  document.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switch (btn.dataset.act) {
        case 'zoom':   toggleZoom(); break;
        case 'ribbon': cycleRibbon(); break;
        case 'png':    savePNG(); break;
        case 'pdf':    savePDF(); break;
        case 'new':    newSheet(); break;
        case 'help':   toggleHelp(); break;
        case 'text':   toggleText(); break;
        case 'sound':
          state.sound = !state.sound;
          Sound.enabled = state.sound;
          btn.setAttribute('aria-pressed', String(state.sound));
          break;
      }
    });
  });

  $('copyText').addEventListener('click', copyText);
  $('downloadText').addEventListener('click', downloadTextFile);

  textModal.addEventListener('mousedown', (e) => {
    if (e.target === textModal) textModal.hidden = true;
  });

  $('strictToggle').addEventListener('change', (e) => {
    state.strict = e.target.checked;
    say(state.strict
      ? 'Period-correct keyboard: no 1, no 0, no exclamation mark.'
      : 'Cheating enabled — every key on your keyboard prints.');
  });

  window.addEventListener('resize', () => updateView(0));

  /* ----------------------------------------------------------- start */

  buildKeyboard();
  applyRibbon();
  syncKeyLatches();
  updateView(0);
})();
