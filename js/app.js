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
  const confirmEl = $('confirmModal');
  const exportMenu= $('exportMenu');

  /* The document is a pile of sheets. `sheet` always points at the one in
     the machine, so everything that types onto paper is untouched by
     there being more than one. */
  const doc = { sheets: [], index: 0 };
  let sheet = null;

  function setCurrent(i) {
    doc.index = i;
    sheet = doc.sheets[i];
  }

  /** Put the current sheet's ink layer into the platen. */
  function mount() {
    const previous = paper.querySelector('.ink');
    if (previous) previous.remove();
    paper.appendChild(sheet.el);
  }

  /* The carriage belongs to the page, not the machine: come back to a
     page and you come back to where you stopped writing on it. */
  function saveCarriage() {
    if (!sheet) return;
    sheet.col = state.col;
    sheet.line = state.line;
    sheet.bellRung = state.bellRung;
  }

  function loadCarriage() {
    state.col = sheet.col;
    state.line = sheet.line;
    state.bellRung = sheet.bellRung;
  }

  const documentEmpty = () => doc.sheets.every((s) => s.isEmpty());

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
    keyboard: true,
    bellRung: false,
    touched: false,
    feeding: false        // a sheet is being rolled in; the keys are dead
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
    zIndex: '3',
    transition: 'left .07s linear, top .12s ease'
  });
  paper.appendChild(caret);

  /* --------------------------------------------------- view geometry */

  /* The strike point. Biased left of centre: at the start of a line the
     sheet lies to the right of it, and that is where the writing goes. */
  function focusPoint() {
    return {
      x: Math.max(260, stage.clientWidth * 0.44),
      // Room below the printing line for the mechanism. A ribbon is half
      // an inch -- 84px at this zoom -- and the type guide and typebar
      // sit under it, so 62px was never going to hold them to scale.
      y: Math.max(140, stage.clientHeight - 150)
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

    scheduleSave();
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

  /* The typebar rises on key-down and stays up until the key is released,
     lifting the ribbon with it -- the ribbon normally sits below the
     printing line so it does not hide what has just been typed. A safety
     timer drops it if a keyup never arrives (focus loss, a synthetic
     event with no matching release). */
  let releaseTimer = null;

  function holdTypebar() {
    if (state.zoom !== 'type') return;
    guide.classList.add('striking');
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(releaseTypebar, 260);
  }

  function releaseTypebar() {
    clearTimeout(releaseTimer);
    guide.classList.remove('striking');
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
      holdTypebar();
      updateView(70);
      if (!lifted) say('Nothing to lift off there.');
      return;
    }

    const dead = DEAD_KEYS.includes(ch);
    sheet.stamp(ch, state.col, state.line, inkColor());
    holdTypebar();
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

  /* Warn once, as the platen crosses into the last few lines. Testing the
     crossing rather than the position means it does not nag on every
     return once you are already down there. */
  const bottomWarnAt = MARGIN.bottom - MARGIN.bottomBell;

  function checkBottomBell(before, delay) {
    if (before >= bottomWarnAt || state.line < bottomWarnAt) return;
    Sound.pageBell(delay);
    say('Near the foot of the page — NEW PAGE winds in a fresh one.');
  }

  function carriageReturn() {
    firstTouch();
    const wasOnLine = state.line;
    state.col = MARGIN.left;
    state.line = Math.min(state.line + 1, PAGE.lines - 1);
    state.bellRung = false;
    state.marginRelease = false;
    syncKeyLatches();
    Sound.carriageReturn();
    updateView(360, 'cubic-bezier(.4,.05,.25,1)');

    // Held back until the carriage has landed, or it rings underneath
    // the slam and is heard as part of it.
    checkBottomBell(wasOnLine, 0.42);
  }

  function rollPlaten(dir) {
    firstTouch();
    const next = state.line + dir;
    if (next < 0 || next > PAGE.lines - 1) return;
    const wasOnLine = state.line;
    state.line = next;
    Sound.platen();
    updateView(200, 'ease-out');
    checkBottomBell(wasOnLine, 0.06);
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
    scheduleSave();
    ro.querySelector('.swatch').style.background =
      state.ribbon === 'red' ? INK.red :
      state.ribbon === 'correction' ? '#ffffff' : INK.black;
  }

  /* Both toolbar toggles carry their state in the icon, so the label and
     the pressed attribute have to move with them. */
  function applySound() {
    Sound.enabled = state.sound;
    const btn = document.querySelector('[data-act="sound"]');
    btn.setAttribute('aria-pressed', String(state.sound));
    btn.title = state.sound ? 'Mute' : 'Unmute';
    btn.setAttribute('aria-label', state.sound ? 'Sound on' : 'Sound off');
  }

  function applyKeyboard() {
    document.body.classList.toggle('no-keyboard', !state.keyboard);
    const btn = document.querySelector('[data-act="keyboard"]');
    btn.setAttribute('aria-pressed', String(state.keyboard));
    btn.title = state.keyboard ? 'Hide the keyboard' : 'Show the keyboard';
    btn.setAttribute('aria-label', state.keyboard ? 'Keyboard shown' : 'Keyboard hidden');

    // The stage grows as the drawer slides, so the printing point moves
    // for the whole of the transition. Following it frame by frame keeps
    // the sheet glued to the machine instead of jumping at the end.
    const started = performance.now();
    const follow = () => {
      updateView(0);
      if (performance.now() - started < 380) requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
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

  /* --------------------------------------------------- confirmations */

  /* One dialog, reused. There is no undo on a typewriter and none here
     either, so anything that destroys a sheet asks first -- and offers to
     save it on the way out, since wanting the page kept is the whole
     reason someone hesitates. */
  let pendingAction = null;

  function askConfirm({ title, body, proceedLabel, onProceed }) {
    closeExportMenu();
    pendingAction = onProceed;
    $('confirmTitle').textContent = title;
    $('confirmBody').innerHTML = body;
    $('confirmProceed').textContent = proceedLabel;
    helpEl.hidden = true;
    textModal.hidden = true;
    confirmEl.hidden = false;
  }

  function closeConfirm() {
    confirmEl.hidden = true;
    pendingAction = null;
  }

  function requestStartOver() {
    if (documentEmpty()) return;              // nothing to throw away
    const n = doc.sheets.length;
    askConfirm({
      title: n > 1 ? `Throw away all ${n} pages?` : 'Throw this page away?',
      body: (n > 1
              ? `Every one of the ${n} pages goes, not just this one. `
              : 'Everything typed on it goes with it. ') +
            '<b>There is no undo</b>, here or on the real machine. Save the ' +
            'document first if you want to keep it.',
      proceedLabel: 'START OVER',
      onProceed: () => rollSheet(() => {
        doc.sheets = [new Sheet()];
        setCurrent(0);
        mount();
        loadCarriage();
        renderStack();
      })
    });
  }

  /** Keep this page and wind a fresh one in behind it. */
  function addPage() {
    rollSheet(() => {
      saveCarriage();
      doc.sheets.push(new Sheet());
      setCurrent(doc.sheets.length - 1);
      mount();
      loadCarriage();
      renderStack();
    });
  }

  function switchTo(i) {
    if (i === doc.index || state.feeding) return;
    saveCarriage();
    setCurrent(i);
    mount();
    loadCarriage();
    renderStack();
    Sound.platen();
    updateView(260, 'cubic-bezier(.2,.9,.3,1)');
  }

  /** Roll the sheet out of the machine, change the document, wind it in. */
  function rollSheet(mutate) {
    if (state.feeding) return;
    firstTouch();

    // The document is not changed until the roll-out finishes, so the
    // keys have to be dead until then or anything typed in the meantime
    // lands on a page that is on its way out.
    state.feeding = true;
    wrap.style.transition = 'transform .45s ease-in, opacity .45s ease-in';
    wrap.style.transform += ' translateY(-140px)';
    wrap.style.opacity = '0';
    Sound.feed();

    setTimeout(() => {
      mutate();
      wrap.style.transition = 'none';
      wrap.style.opacity = '1';
      updateView(0);
      requestAnimationFrame(() => updateView(320, 'cubic-bezier(.2,.9,.3,1)'));
      state.feeding = false;
    }, 450);
  }

  /** The pile of pages beside the machine. */
  function renderStack() {
    const stack = $('pageStack');
    stack.hidden = doc.sheets.length < 2;
    stack.textContent = '';

    doc.sheets.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = 'page-thumb' + (i === doc.index ? ' current' : '');
      btn.title = 'Page ' + (i + 1);
      btn.appendChild(s.toCanvas(0.3));

      const no = document.createElement('span');
      no.className = 'page-no';
      no.textContent = i + 1;
      btn.appendChild(no);

      btn.addEventListener('click', () => switchTo(i));
      stack.appendChild(btn);
    });

    const ro = $('roPage');
    ro.hidden = doc.sheets.length < 2;
    const nums = ro.querySelectorAll('b');
    nums[0].textContent = doc.index + 1;
    nums[1].textContent = doc.sheets.length;
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

  /* A PNG is a picture of one sheet, so it saves the page you are looking
     at. A PDF and the text are the document, so they take everything. */
  function savePNG() {
    if (sheet.isEmpty()) return say('Nothing typed on this page yet.');
    sheet.toCanvas(2).toBlob((blob) => {
      download(blob, `typed-page-${stamp()}.png`);
    }, 'image/png');
    say(doc.sheets.length > 1
      ? `Saved page ${doc.index + 1} as a PNG.`
      : 'Saved as a PNG.');
  }

  function savePDF() {
    if (documentEmpty()) return say('Nothing typed yet.');
    const n = doc.sheets.length;
    download(PDFExport.build(doc.sheets.map((s) => s.strikes)),
             `typed-${n > 1 ? 'document' : 'page'}-${stamp()}.pdf`);
    say(n > 1
      ? `Saved all ${n} pages as a PDF — US Letter, ready to print.`
      : 'Saved as a PDF — US Letter, ready to print.');
  }

  /* Pages are divided by a horizontal rule, which is also what Notion and
     most markdown editors turn "---" into on paste. */
  function documentText() {
    return doc.sheets.map((s) => s.toText()).filter(Boolean).join('\n\n---\n\n');
  }

  /* ----------------------------------------------------- persistence */

  const STORE_KEY = 'typewriter.document.v1';
  let saveTimer = null;

  /* Saving hangs off updateView, which runs on every keystroke, so it is
     debounced -- serialising a long document once per character would be
     felt in the typing. */
  function scheduleSave() {
    if (!sheet) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDocument, 400);
  }

  function saveDocument() {
    if (!sheet) return;
    saveCarriage();
    try {
      if (documentEmpty() && doc.sheets.length === 1) {
        localStorage.removeItem(STORE_KEY);
        return;
      }
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1,
        index: doc.index,
        ribbon: state.ribbon,
        strict: state.strict,
        sound: state.sound,
        keyboard: state.keyboard,
        pages: doc.sheets.map((s) => s.toJSON())
      }));
    } catch (err) {
      // Storage can be full, or refused outright in a private window.
      // A missing backup is not worth interrupting someone's typing.
    }
  }

  /** @returns true if a document was found and put back in the machine. */
  function loadDocument() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch (err) {
      return false;
    }
    if (!data || data.v !== 1 || !Array.isArray(data.pages) || !data.pages.length) {
      return false;
    }

    try {
      doc.sheets = data.pages.map((p) => {
        const s = new Sheet();
        if (typeof p.col === 'number') s.col = p.col;
        if (typeof p.line === 'number') s.line = p.line;
        s.bellRung = !!p.bell;
        s.restore(Array.isArray(p.s) ? p.s : []);
        return s;
      });
      setCurrent(Math.max(0, Math.min(data.index | 0, doc.sheets.length - 1)));
      if (RIBBONS.includes(data.ribbon)) state.ribbon = data.ribbon;
      if (typeof data.strict === 'boolean') state.strict = data.strict;
      if (typeof data.sound === 'boolean') state.sound = data.sound;
      if (typeof data.keyboard === 'boolean') state.keyboard = data.keyboard;
      return true;
    } catch (err) {
      // Anything unreadable is treated as no document at all rather than
      // half-restored onto the page.
      doc.sheets = [];
      return false;
    }
  }

  /* ---------------------------------------------------- export menu */

  function toggleExportMenu() {
    exportMenu.hidden ? openExportMenu() : closeExportMenu();
  }

  function openExportMenu() {
    exportMenu.hidden = false;
    $('exportBtn').setAttribute('aria-expanded', 'true');
  }

  function closeExportMenu() {
    if (exportMenu.hidden) return;
    exportMenu.hidden = true;
    $('exportBtn').setAttribute('aria-expanded', 'false');
  }

  function toggleHelp() {
    helpEl.hidden = !helpEl.hidden;
    if (!helpEl.hidden) textModal.hidden = true;
  }

  function toggleText() {
    closeExportMenu();
    textModal.hidden = !textModal.hidden;
    if (textModal.hidden) return;
    helpEl.hidden = true;
    const text = documentText();
    const out = $('textOut');
    out.textContent = text || 'Nothing typed yet.';
    out.classList.toggle('empty', !text);
  }

  function flashButton(btn, label) {
    const was = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = was; }, 1400);
  }

  async function copyText() {
    const text = documentText();
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
    const text = documentText();
    if (!text) return;
    download(new Blob([text], { type: 'text/plain;charset=utf-8' }),
             `typed-${doc.sheets.length > 1 ? 'document' : 'page'}-${stamp()}.txt`);
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

  const overlayOpen = () => !helpEl.hidden || !textModal.hidden || !confirmEl.hidden;

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key;

    // With a panel up, the keyboard belongs to the panel -- otherwise
    // reading the text export types it onto the sheet behind it.
    if (k === 'Escape' && !exportMenu.hidden) {
      e.preventDefault();
      closeExportMenu();
      return;
    }

    if (state.feeding) { e.preventDefault(); return; }

    if (overlayOpen()) {
      if (k === 'Escape') {
        e.preventDefault();
        helpEl.hidden = true;
        textModal.hidden = true;
        closeConfirm();
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
    releaseTypebar();
    if (e.key === 'Shift') { state.shiftHeld = false; return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!state.touched || state.feeding || overlayOpen()) return;
    if (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace') Sound.keyUp();
  });

  window.addEventListener('blur', () => {
    state.shiftHeld = false;
    releaseTypebar();
  });

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
        case 'export': toggleExportMenu(); break;
        case 'zoom':   toggleZoom(); break;
        case 'ribbon': cycleRibbon(); break;
        case 'png':    savePNG(); break;
        case 'pdf':    savePDF(); break;
        case 'new':    addPage(); break;
        case 'over':   requestStartOver(); break;
        case 'help':   toggleHelp(); break;
        case 'text':   toggleText(); break;
        case 'sound':
          state.sound = !state.sound;
          applySound();
          scheduleSave();
          break;
        case 'keyboard':
          state.keyboard = !state.keyboard;
          applyKeyboard();
          scheduleSave();
          break;
      }
      if (btn.closest('.menu')) closeExportMenu();
    });
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.menu-wrap')) closeExportMenu();
  });

  keyboardEl.addEventListener('mouseup', () => {
    releaseTypebar();
    if (state.touched) Sound.keyUp();
  });
  keyboardEl.addEventListener('mouseleave', releaseTypebar);

  $('confirmCancel').addEventListener('click', closeConfirm);
  $('confirmProceed').addEventListener('click', () => {
    const go = pendingAction;
    closeConfirm();
    if (go) go();
  });
  $('confirmPng').addEventListener('click', (e) => { savePNG(); flashButton(e.target, 'SAVED'); });
  $('confirmPdf').addEventListener('click', (e) => { savePDF(); flashButton(e.target, 'SAVED'); });
  confirmEl.addEventListener('mousedown', (e) => { if (e.target === confirmEl) closeConfirm(); });

  $('copyText').addEventListener('click', copyText);
  $('downloadText').addEventListener('click', downloadTextFile);

  textModal.addEventListener('mousedown', (e) => {
    if (e.target === textModal) textModal.hidden = true;
  });

  $('strictToggle').addEventListener('change', (e) => {
    state.strict = e.target.checked;
    scheduleSave();
    say(state.strict
      ? 'Period-correct keyboard: no 1, no 0, no exclamation mark.'
      : 'Cheating enabled — every key on your keyboard prints.');
  });

  window.addEventListener('resize', () => updateView(0));

  /* ----------------------------------------------------------- start */

  buildKeyboard();

  const restored = loadDocument();
  if (!doc.sheets.length) {
    doc.sheets = [new Sheet()];
    setCurrent(0);
  }

  mount();
  loadCarriage();
  renderStack();
  applyRibbon();
  applySound();
  applyKeyboard();
  syncKeyLatches();
  $('strictToggle').checked = state.strict;
  updateView(0);

  if (restored) {
    const n = doc.sheets.length;
    say(n > 1
      ? `Picked up where you left off — ${n} pages.`
      : 'Picked up where you left off.');
  }

  // A refresh mid-keystroke should not lose the last few characters.
  window.addEventListener('beforeunload', saveDocument);
})();
