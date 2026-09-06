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

  /**
   * A burst of band-passed noise.
   *
   * The lowpass at the end is not decoration. White noise carries equal
   * energy per hertz, so the octave from 12kHz up holds as much of it as
   * everything below combined, and a gentle bandpass barely touches it.
   * Left alone, every burst here sprayed a third of its energy above
   * 12kHz -- against a tenth in a recording of the real machine -- and
   * that reads as hiss rather than as a struck object. Real acoustics
   * roll the top octave off; so does this.
   */
  function noise(t, { dur, freq, q, gain, type = 'bandpass', lp = 9000 }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = rand(0.85, 1.15);

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;

    const ceiling = ctx.createBiquadFilter();
    ceiling.type = 'lowpass';
    ceiling.frequency.value = lp;
    ceiling.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter).connect(ceiling).connect(g).connect(master);
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

    /**
     * Typebar strikes the paper.
     *
     * Measuring a real one was a corrective: better than half its energy
     * sits above 3.5kHz and under a tenth below 200Hz. The earlier
     * version had it backwards, leading on a low thump, which is why it
     * sounded like a door closing rather than a key being hit. The body
     * resonance is real but quiet -- around 105 to 190Hz -- and the
     * clack itself is bright broadband noise. Gone to a tenth in 55ms
     * and effectively silent by 160ms.
     */
    strike() {
      if (!ready()) return;
      const t = ctx.currentTime;

      // Broad body of the clack. Centred lower than a literal reading of
      // the spectrum suggests: the measured energy up at 8kHz is spread
      // broadband across a real recording, and reproducing that level
      // with resonant filters concentrates it into a hiss. Matching the
      // numbers is not the same as matching the sound.
      noise(t, { dur: 0.05, freq: rand(1900, 2500), q: 0.5, gain: 0.26 });
      noise(t + 0.003, { dur: 0.045, freq: rand(750, 1100), q: 0.8, gain: 0.12 });

      // Enough top to keep the edge on it, well short of a tick.
      noise(t, { dur: 0.028, freq: rand(4200, 5200), q: 0.7, gain: 0.095 });

      // The machine's mass.
      tone(t, { freq: rand(115, 165), to: 62, dur: 0.06, gain: 0.13, type: 'triangle' });

      // The tail that carries it out past 100ms.
      noise(t + 0.01, { dur: 0.14, freq: 2600, q: 0.5, gain: 0.035 });
    },

    /**
     * The key coming back up. A real keyboard is two sounds per stroke,
     * not one: the strike, then the key returning to its rest a moment
     * later. Quieter, lower and looser than the strike, and in three
     * small parts rather than one clean hit.
     */
    keyUp() {
      if (!ready()) return;
      const t = ctx.currentTime;
      noise(t, { dur: 0.02, freq: rand(3000, 4200), q: 1.2, gain: 0.075 });
      noise(t + 0.012, { dur: 0.032, freq: rand(400, 700), q: 0.9, gain: 0.060 });
      noise(t + 0.085, { dur: 0.045, freq: rand(1200, 1800), q: 1.0, gain: 0.040 });
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
     * The frequencies are the real thing, measured off a recording of a
     * typewriter bell rather than guessed. Three findings shaped this,
     * all counter-intuitive:
     *
     * It rings high -- around 3.2kHz, not the ~1kHz "bell" suggests. It
     * is top-heavy: the 2.64 partial is louder than the fundamental,
     * which is what makes the sound bright and small rather than round.
     * And every mode is really a close PAIR, because a cast dome is
     * never quite symmetrical. The fundamental's pair sits 79Hz apart,
     * inside one critical band, and the roughness that produces is the
     * tang the ear reads as "bell" instead of "sine wave". It is the
     * single most important detail here and the easiest to leave out.
     *
     * Held as ratios of the fundamental so the same bell can be struck
     * at another pitch without losing what makes it a bell.
     */
    _strike(t, root, level) {
      const modes = [
        { pair: [1.0000, 1.0244], gain: 0.042, dur: 1.45 },
        { pair: [2.6420, 2.6454], gain: 0.038, dur: 0.85 },
        { pair: [4.6683, 4.6767], gain: 0.014, dur: 0.42 }
      ];

      for (const m of modes) {
        // Where the hammer lands changes how strongly it excites each
        // mode, so the balance shifts from strike to strike.
        const spread = rand(0.85, 1.15);
        for (const ratio of m.pair) {
          const freq = root * ratio;
          const osc = ctx.createOscillator();
          osc.type = 'sine';

          // Struck metal starts fractionally sharp and settles as the
          // dome stops flexing.
          osc.frequency.setValueAtTime(freq * 1.006, t);
          osc.frequency.exponentialRampToValueAtTime(freq, t + 0.04);

          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(m.gain * spread * level, t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, t + m.dur);

          osc.connect(g).connect(master);
          osc.start(t);
          osc.stop(t + m.dur + 0.05);
        }
      }

      // The hammer itself: a bright tick, gone almost before it lands.
      noise(t, { dur: 0.010, freq: 7000, q: 0.9, gain: 0.060 * level, type: 'highpass', lp: 16000 });
      noise(t, { dur: 0.028, freq: 3400, q: 1.4, gain: 0.035 * level });
    },

    /** Approaching the right margin. */
    bell() {
      if (!ready()) return;
      this._strike(ctx.currentTime, 3237 * rand(0.998, 1.002), 1);
    },

    /**
     * Approaching the foot of the page.
     *
     * Struck twice, a fifth lower. Running out of paper is a different
     * problem from running out of line, so it has to be tellable apart
     * without listening for it -- but it is the same machine, so it is
     * the same bell rather than an unrelated sound. Two strikes read as
     * deliberate where one reads as the margin bell heard wrong.
     */
    pageBell(delay = 0) {
      if (!ready()) return;
      const t = ctx.currentTime + delay;
      const root = 3237 * 0.667 * rand(0.998, 1.002);
      this._strike(t, root, 0.92);
      this._strike(t + 0.19, root, 0.62);
    },

    /**
     * Carriage thrown back to the left margin.
     *
     * This is three events, not one, which is what the old version got
     * wrong by firing everything at once. The carriage crosses first --
     * a rush that swells as it picks up speed, the escapement ratcheting
     * as it goes. It slams into the margin stop, brightly and briefly.
     * Then, after a clear beat of near silence, the platen ratchets the
     * paper on a line. That gap is most of the character: without it the
     * return is a noise, and with it it is a mechanism.
     *
     * Timed to land the slam as the paper arrives on screen.
     */
    carriageReturn() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const travel = 0.30;              // carriage crossing time
      const feed = travel + 0.17;       // platen ratchets the line on

      // The crossing: looped noise opening up as the carriage gathers pace.
      const rush = ctx.createBufferSource();
      rush.buffer = noiseBuffer;
      rush.loop = true;
      rush.playbackRate.value = 0.85;

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(900, t);
      band.frequency.exponentialRampToValueAtTime(2800, t + travel);
      band.Q.value = 0.4;

      const swell = ctx.createGain();
      swell.gain.setValueAtTime(0.0001, t);
      swell.gain.exponentialRampToValueAtTime(0.085, t + travel * 0.6);
      swell.gain.exponentialRampToValueAtTime(0.065, t + travel);
      swell.gain.exponentialRampToValueAtTime(0.0001, t + travel + 0.05);

      rush.connect(band).connect(swell).connect(master);
      rush.start(t);
      rush.stop(t + travel + 0.09);

      // The escapement counting off as it crosses.
      for (let i = 0; i < 7; i++) {
        noise(t + travel * (0.10 + 0.125 * i),
              { dur: 0.013, freq: 2500 + i * 190, q: 3, gain: 0.030 + i * 0.004 });
      }

      // Arrival at the margin stop.
      noise(t + travel, { dur: 0.06, freq: 5000, q: 0.6, gain: 0.30, type: 'highpass' });
      noise(t + travel, { dur: 0.10, freq: rand(1500, 2200), q: 0.8, gain: 0.13 });
      tone(t + travel, { freq: 190, to: 70, dur: 0.10, gain: 0.12, type: 'triangle' });
      noise(t + travel + 0.02, { dur: 0.14, freq: 3800, q: 0.5, gain: 0.045, type: 'highpass' });

      // A beat of quiet, then the paper goes up a line.
      for (let i = 0; i < 4; i++) {
        noise(feed + i * 0.016, { dur: 0.02, freq: 2400 - i * 120, q: 2.6, gain: 0.050 });
      }
      noise(feed, { dur: 0.07, freq: 700, q: 0.9, gain: 0.045 });
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
