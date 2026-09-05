/* ------------------------------------------------------------------ *
 * Sound. Everything is synthesised with the Web Audio API so the app
 * stays a handful of text files with no binary assets.
 *
 * A key strike is three layers: a bright click (the typebar hitting the
 * platen), a filtered noise thwack (paper and ribbon) and a low thud
 * (the machine's mass). Detuning those slightly per keypress is what
 * keeps a fast run of characters from sounding like a machine gun of
 * identical samples.
 * ------------------------------------------------------------------ */

const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function ready() {
    if (!enabled) return false;
    if (!ctx) init();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  /** A burst of band-passed noise. */
  function noise(t, { dur, freq, q, gain, type = 'bandpass' }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = rand(0.85, 1.15);

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** A pitched blip. */
  function tone(t, { freq, dur, gain, type = 'sine', to }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; },

    unlock() { ready(); },

    /** Typebar strikes the paper. */
    strike() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { dur: 0.035, freq: rand(2600, 3600), q: 1.1, gain: 0.30 });
      noise(t + 0.004, { dur: 0.05, freq: rand(900, 1300), q: 0.8, gain: 0.16 });
      tone(t, { freq: rand(150, 190), to: 70, dur: 0.05, gain: 0.16, type: 'triangle' });
    },

    /** Space bar: same mechanism, no typebar, so it is duller. */
    space() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { dur: 0.05, freq: rand(500, 700), q: 0.7, gain: 0.20 });
      tone(t, { freq: rand(110, 140), to: 60, dur: 0.06, gain: 0.13, type: 'triangle' });
    },

    /** Escapement clicking backwards. */
    backspace() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { dur: 0.03, freq: 2200, q: 2.5, gain: 0.20 });
      tone(t, { freq: 340, to: 220, dur: 0.035, gain: 0.09, type: 'square' });
    },

    /**
     * The margin bell: a small steel dome struck by a hammer.
     *
     * The frequencies below are the real thing, measured off a recording
     * of a typewriter bell rather than guessed. Three findings shaped
     * this, all of them counter-intuitive:
     *
     * It rings high -- around 3.2kHz, not the ~1kHz a "bell" suggests.
     * It is top-heavy: the 2.64 partial is louder than the fundamental,
     * which is what makes the sound bright and small rather than round.
     * And every mode is really a close PAIR. A cast dome is never quite
     * symmetrical, so each mode splits in two a few hertz apart. The
     * fundamental's pair sits 79Hz apart, close enough to fall inside one
     * critical band, and the roughness that produces is the tang your ear
     * reads as "bell" instead of "sine wave". It is the single most
     * important detail here and the easiest one to leave out.
     *
     * Decay is two-stage: half the energy is gone in 50ms, but the tail
     * runs on for a second and a half.
     */
    bell() {
      if (!ready()) return;
      const t = ctx.currentTime;

      // Where the hammer lands changes how strongly it excites each mode,
      // so the balance shifts a little from strike to strike.
      const tune = rand(0.998, 1.002);

      const modes = [
        { pair: [3237, 3316], gain: 0.042, dur: 1.45 },
        { pair: [8552, 8563], gain: 0.038, dur: 0.85 },
        { pair: [15111, 15138], gain: 0.014, dur: 0.42 }
      ];

      for (const m of modes) {
        const spread = rand(0.85, 1.15);
        for (const hz of m.pair) {
          const freq = hz * tune;
          const osc = ctx.createOscillator();
          osc.type = 'sine';

          // Struck metal starts fractionally sharp and settles as the
          // dome stops flexing.
          osc.frequency.setValueAtTime(freq * 1.006, t);
          osc.frequency.exponentialRampToValueAtTime(freq, t + 0.04);

          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(m.gain * spread, t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, t + m.dur);

          osc.connect(g).connect(master);
          osc.start(t);
          osc.stop(t + m.dur + 0.05);
        }
      }

      // The hammer itself: a bright tick, gone almost before it lands.
      noise(t, { dur: 0.010, freq: 7000, q: 0.9, gain: 0.060, type: 'highpass' });
      noise(t, { dur: 0.028, freq: 3400, q: 1.4, gain: 0.035 });
    },

    /** Carriage thrown back to the left margin, then the platen ratchets. */
    carriageReturn() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { dur: 0.20, freq: 1500, q: 0.45, gain: 0.22 });
      for (let i = 0; i < 9; i++) {
        noise(t + 0.012 * i, { dur: 0.018, freq: 3000 - i * 90, q: 3, gain: 0.07 });
      }
      noise(t + 0.19, { dur: 0.09, freq: 320, q: 0.8, gain: 0.26 });
      tone(t + 0.19, { freq: 210, to: 90, dur: 0.10, gain: 0.14, type: 'triangle' });
    },

    /** Platen knob turning one line. */
    platen() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { dur: 0.025, freq: 1700, q: 2.2, gain: 0.14 });
    },

    /** Keys locked against the right margin. */
    jam() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { dur: 0.06, freq: 380, q: 1.4, gain: 0.22 });
      tone(t, { freq: 95, dur: 0.07, gain: 0.10, type: 'square' });
    },

    /** New sheet rolled around the platen. */
    feed() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { dur: 0.45, freq: 1100, q: 0.35, gain: 0.14, type: 'bandpass' });
      for (let i = 0; i < 14; i++) {
        noise(t + 0.03 * i, { dur: 0.02, freq: 2400, q: 3, gain: 0.05 });
      }
    }
  };
})();
