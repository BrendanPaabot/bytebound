// Sound effects and genre-adaptive gameplay music synthesized via the Web Audio API.
// Browsers only start audio after a user gesture; global gesture hooks resume pending BGM automatically.
const SOUND_STORAGE_KEY = 'kings-pigs-sound';
const LEGACY_MASTER_VOLUME_STORAGE_KEY = 'kings-pigs-master-volume';
const MUSIC_VOLUME_STORAGE_KEY = 'kings-pigs-music-volume';
const SOUND_EFFECT_VOLUME_STORAGE_KEY = 'kings-pigs-sfx-volume';
const DEFAULT_MUSIC_VOLUME = 0.20;
const DEFAULT_SOUND_EFFECT_VOLUME = 0.50;
const MASTER_GAIN = 0.48;
const GAMEPLAY_MUSIC_BASE_GAIN = 0.24;

const Sound = (() => {
  let enabled = (() => {
    try {
      return localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
    } catch (error) {
      return true;
    }
  })();

  function loadVolume(storageKey, defaultVolume, legacyScale) {
    try {
      const savedVolume = localStorage.getItem(storageKey);
      if (savedVolume !== null) {
        const parsedVolume = Number(savedVolume);
        if (
          savedVolume.trim() &&
          Number.isFinite(parsedVolume) &&
          parsedVolume >= 0 &&
          parsedVolume <= 1
        ) return parsedVolume;
        console.error(`Stored volume for "${storageKey}" is invalid; using its default.`);
        return defaultVolume;
      }
      const storedVolume = localStorage.getItem(LEGACY_MASTER_VOLUME_STORAGE_KEY);
      if (storedVolume === null) return defaultVolume;
      const parsedVolume = Number(storedVolume);
      if (
        storedVolume.trim() &&
        Number.isFinite(parsedVolume) &&
        parsedVolume >= 0 &&
        parsedVolume <= 1
      ) {
        const migratedVolume = parsedVolume * legacyScale;
        localStorage.setItem(storageKey, String(migratedVolume));
        return migratedVolume;
      }
      console.error('Stored master volume is invalid; using separate default volumes.');
      return defaultVolume;
    } catch (error) {
      console.error(`Unable to read volume setting "${storageKey}".`, error);
      return defaultVolume;
    }
  }

  let musicVolume = loadVolume(MUSIC_VOLUME_STORAGE_KEY, DEFAULT_MUSIC_VOLUME, DEFAULT_MUSIC_VOLUME);
  let soundEffectVolume = loadVolume(
    SOUND_EFFECT_VOLUME_STORAGE_KEY,
    DEFAULT_SOUND_EFFECT_VOLUME,
    DEFAULT_SOUND_EFFECT_VOLUME
  );

  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;
  let musicComp = null;
  let delaySend = null;
  let sharedNoiseBuffer = null;
  let rockDriveCurve = null;
  let complextroDriveCurve = null;

  let activeTrackBus = null;
  let activeTrackFilter = null;
  let musicName = null;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;
  let gestureHooksBound = false;

  function gameplayMusicGain(volume) {
    return GAMEPLAY_MUSIC_BASE_GAIN * (volume / DEFAULT_MUSIC_VOLUME);
  }

  function makeDriveCurve(amount, mode = 'soft') {
    const samples = 512;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      if (mode === 'complextro') {
        const folded = Math.sin(x * amount) * 0.65 + Math.tanh(x * amount * 0.9) * 0.45;
        curve[i] = Math.max(-1, Math.min(1, folded));
      } else {
        curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
      }
    }
    return curve;
  }

  function createMusicBuses() {
    musicGain = ctx.createGain();
    musicGain.gain.value = gameplayMusicGain(musicVolume);
    musicGain.connect(masterGain);

    musicComp = ctx.createDynamicsCompressor();
    musicComp.threshold.value = -14;
    musicComp.knee.value = 18;
    musicComp.ratio.value = 4;
    musicComp.attack.value = 0.005;
    musicComp.release.value = 0.12;
    musicComp.connect(musicGain);

    // Shared warm delay send for ambient shimmer and baroque space.
    delaySend = ctx.createGain();
    delaySend.gain.value = 1;
    const delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.value = 0.36;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 1750;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.30;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0.28;

    delaySend.connect(delayNode);
    delayNode.connect(delayTone);
    delayTone.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayTone.connect(delayWet);
    delayWet.connect(musicComp);

    const len = Math.ceil(ctx.sampleRate * 2);
    sharedNoiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = sharedNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    rockDriveCurve = makeDriveCurve(4.2, 'soft');
    complextroDriveCurve = makeDriveCurve(5.6, 'complextro');
  }

  function bindGestureUnlock() {
    if (gestureHooksBound || typeof window === 'undefined') return;
    gestureHooksBound = true;
    const unlock = () => {
      if (!enabled) return;
      if (!ctx) {
        if (!musicName) return;
        ensure();
      }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          if (enabled && musicName && ctx) {
            nextNoteTime = ctx.currentTime + 0.05;
            if (!musicTimer && TRACKS[musicName]) {
              musicTimer = setInterval(scheduleMusic, 35);
            }
            scheduleMusic();
          }
        }).catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  function ensure() {
    if (!enabled) return null;
    try {
      bindGestureUnlock();
      if (!ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        ctx = new AudioContextClass();
        masterGain = ctx.createGain();
        masterGain.gain.value = MASTER_GAIN;
        masterGain.connect(ctx.destination);
        sfxGain = ctx.createGain();
        sfxGain.gain.value = soundEffectVolume;
        sfxGain.connect(masterGain);
        createMusicBuses();
      }
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          if (enabled && musicName && ctx && nextNoteTime < ctx.currentTime) {
            nextNoteTime = ctx.currentTime + 0.05;
          }
        }).catch(() => {});
      }
      return ctx;
    } catch (error) {
      console.error('Sound is unavailable in this browser.', error);
      return null;
    }
  }

  function tone(freq, dur, { type = 'square', vol = 0.25, slide = 0, when = 0, dest = null } = {}) {
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(dest || sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(dur, vol = 0.3, when = 0) {
    const t = ctx.currentTime + when;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(sfxGain);
    source.start(t);
  }

  const effects = {
    encounter: () => tone(330, 0.18, { type: 'triangle', slide: 120, vol: 0.2 }),
    bossIntro: () => {
      tone(60, 1.0, { type: 'sawtooth', slide: 25, vol: 0.28 });
      noise(0.7, 0.18);
      tone(440, 0.25, { type: 'square', vol: 0.12, when: 0.5 });
    },
    hit: () => {
      noise(0.12, 0.35);
      tone(220, 0.12, { type: 'square', slide: -140, vol: 0.18 });
    },
    correct: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.2, when: i * 0.07 })),
    wrong: () => tone(196, 0.3, { type: 'sawtooth', slide: -70, vol: 0.14 }),
    enemy: () => tone(150, 0.22, { type: 'sawtooth', slide: -60, vol: 0.16 }),
    heavy: () => {
      tone(90, 0.45, { type: 'sawtooth', slide: -40, vol: 0.22 });
      noise(0.3, 0.25);
    },
    block: () => tone(880, 0.12, { type: 'triangle', slide: 200, vol: 0.16 }),
    heal: () => [440, 554, 659].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.16, when: i * 0.06 })),
    charge: () => tone(330, 0.25, { type: 'triangle', slide: 330, vol: 0.16 }),
    pick: () => tone(660, 0.1, { type: 'square', vol: 0.12 }),
    skill: () => [523, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.2, when: i * 0.08 })),
    ultimate: () => {
      [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.26, { type: 'triangle', vol: 0.22, when: i * 0.05 }));
      tone(1318, 0.35, { type: 'sawtooth', slide: 260, vol: 0.12, when: 0.22 });
      noise(0.28, 0.22, 0.22);
    },
    unlock: () => [659, 784, 988, 1318].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.12, when: i * 0.09 })),
    door: () => tone(120, 0.5, { type: 'triangle', slide: 60, vol: 0.2 }),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.2, when: i * 0.1 })),
    bossWin: () => {
      [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.16, when: i * 0.12 }));
      noise(0.4, 0.2, 0.5);
    },
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.2, when: i * 0.22 })),
    hover: () => tone(880, 0.055, { type: 'sine', slide: 130, vol: 0.055 }),
    click: () => {
      noise(0.028, 0.05);
      tone(720, 0.075, { type: 'triangle', slide: -260, vol: 0.14 });
      tone(1250, 0.025, { type: 'sine', slide: -250, vol: 0.045, when: 0.003 });
    },
  };

  // --- Track bus lifecycle (smooth crossfade out on track switch / stop) ---
  function releaseActiveTrackBus() {
    if (!activeTrackBus || !ctx) {
      activeTrackBus = null;
      activeTrackFilter = null;
      return;
    }
    const oldBus = activeTrackBus;
    const oldFilter = activeTrackFilter;
    activeTrackBus = null;
    activeTrackFilter = null;
    const now = ctx.currentTime;
    try {
      oldBus.gain.cancelScheduledValues(now);
      oldBus.gain.setValueAtTime(Math.max(0.0001, oldBus.gain.value), now);
      oldBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      setTimeout(() => {
        try { oldBus.disconnect(); } catch {}
        try { oldFilter?.disconnect(); } catch {}
      }, 240);
    } catch {}
  }

  function createTrackBus(cutoffHz, gainLevel = 1) {
    releaseActiveTrackBus();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;
    filter.Q.value = 0.65;
    filter.connect(musicComp);

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(gainLevel, ctx.currentTime + 0.18);
    bus.connect(filter);

    activeTrackBus = bus;
    activeTrackFilter = filter;
    return bus;
  }

  // --- Synthesis building blocks for BGM voices ---
  function midiFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function playSynthVoice(bus, time, freq, dur, {
    type = 'sine',
    vol = 0.15,
    attack = 0.015,
    detune = 0,
    cutoff = 0,
    q = 0.9,
    slideToFreq = 0,
    sendDelay = 0,
  } = {}) {
    if (!freq || !bus) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (detune) osc.detune.setValueAtTime(detune, time);
    if (slideToFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(24, slideToFreq), time + dur);

    const env = ctx.createGain();
    const safeAtk = Math.min(attack, dur * 0.45);
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, vol), time + safeAtk);
    env.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(safeAtk + 0.02, dur));

    let tail = osc;
    if (cutoff > 0) {
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(cutoff, time);
      lpf.Q.setValueAtTime(q, time);
      osc.connect(lpf);
      tail = lpf;
    }
    tail.connect(env);
    env.connect(bus);

    if (sendDelay > 0 && delaySend) {
      const tap = ctx.createGain();
      tap.gain.value = sendDelay;
      env.connect(tap);
      tap.connect(delaySend);
    }

    osc.start(time);
    osc.stop(time + dur + 0.06);
  }

  function playWarmPad(bus, time, midiNotes, dur, { vol = 0.085, cutoff = 1050, attack = 0.55, sendDelay = 0.25 } = {}) {
    if (!midiNotes?.length || !bus) return;
    const voiceVol = vol / Math.sqrt(midiNotes.length);
    for (const note of midiNotes) {
      const f = midiFreq(note);
      playSynthVoice(bus, time, f, dur, { type: 'sine', vol: voiceVol * 0.9, attack, cutoff, sendDelay });
      playSynthVoice(bus, time, f, dur, { type: 'triangle', vol: voiceVol * 0.55, attack, detune: 6, cutoff: cutoff * 0.9 });
    }
  }

  function playFeltBell(bus, time, midi, dur, { vol = 0.13, sendDelay = 0.45 } = {}) {
    if (!midi || !bus) return;
    const f = midiFreq(midi);
    playSynthVoice(bus, time, f, dur, { type: 'sine', vol, attack: 0.012, cutoff: 1950, sendDelay });
    playSynthVoice(bus, time, f * 2, dur * 0.45, { type: 'sine', vol: vol * 0.22, attack: 0.008, cutoff: 1850 });
  }

  function playRockGuitarChord(bus, time, rootMidi, dur, { muted = false, vol = 0.14 } = {}) {
    if (!rootMidi || !bus) return;
    const fifthMidi = rootMidi + 7;
    const octMidi = rootMidi + 12;
    const notes = muted ? [rootMidi, fifthMidi] : [rootMidi, fifthMidi, octMidi];

    const drive = ctx.createWaveShaper();
    drive.curve = rockDriveCurve;
    drive.oversample = '2x';

    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.setValueAtTime(muted ? 1150 : 2550, time);
    cab.Q.value = 1.1;

    const env = ctx.createGain();
    const actualDur = muted ? Math.min(dur, 0.11) : dur;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(vol, time + 0.007);
    env.gain.exponentialRampToValueAtTime(0.0001, time + actualDur);

    drive.connect(cab);
    cab.connect(env);
    env.connect(bus);

    notes.forEach((m, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(midiFreq(m), time);
      if (idx === 1) osc.detune.setValueAtTime(-7, time);
      if (idx === 2) osc.detune.setValueAtTime(7, time);
      osc.connect(drive);
      osc.start(time);
      osc.stop(time + actualDur + 0.04);
    });
  }

  function playDrum(bus, time, kind, vol = 0.3) {
    if (!bus) return;
    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, time);
      osc.frequency.exponentialRampToValueAtTime(44, time + 0.09);
      env.gain.setValueAtTime(0.0001, time);
      env.gain.linearRampToValueAtTime(vol, time + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      osc.connect(env);
      env.connect(bus);
      osc.start(time);
      osc.stop(time + 0.2);
      return;
    }

    if (kind === 'softKick') {
      playSynthVoice(bus, time, 95, 0.18, { type: 'sine', vol: vol * 0.55, attack: 0.008, slideToFreq: 42, cutoff: 260 });
      return;
    }

    if (kind === 'snare' || kind === 'ghostSnare' || kind === 'glitchSnare') {
      const bodyPitch = kind === 'glitchSnare' ? 235 : 185;
      playSynthVoice(bus, time, bodyPitch, kind === 'ghostSnare' ? 0.06 : 0.1, {
        type: 'triangle',
        vol: vol * (kind === 'ghostSnare' ? 0.25 : 0.42),
        attack: 0.003,
        slideToFreq: bodyPitch * 0.55,
      });
      if (sharedNoiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = sharedNoiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(kind === 'glitchSnare' ? 2800 : 1950, time);
        bp.Q.value = kind === 'glitchSnare' ? 1.8 : 0.9;
        const env = ctx.createGain();
        const dur = kind === 'ghostSnare' ? 0.05 : 0.13;
        env.gain.setValueAtTime(0.0001, time);
        env.gain.linearRampToValueAtTime(vol * (kind === 'ghostSnare' ? 0.35 : 0.72), time + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        src.connect(bp);
        bp.connect(env);
        env.connect(bus);
        src.start(time, (time * 0.37) % 1, dur + 0.02);
      }
      return;
    }

    if ((kind === 'hat' || kind === 'openHat' || kind === 'ride') && sharedNoiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = sharedNoiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(kind === 'ride' ? 4800 : 5800, time);
      const env = ctx.createGain();
      const dur = kind === 'openHat' ? 0.16 : (kind === 'ride' ? 0.11 : 0.045);
      env.gain.setValueAtTime(0.0001, time);
      env.gain.linearRampToValueAtTime(vol, time + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(hp);
      hp.connect(env);
      env.connect(bus);
      src.start(time, (time * 0.71) % 1, dur + 0.02);
    }
  }

  function playHarpsichord(bus, time, midi, dur, vol = 0.14) {
    if (!midi || !bus) return;
    const f = midiFreq(midi);
    // Plucked Baroque timbre: bright saw + upper octave string with gentle high-mid shaping.
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, time);
    filter.Q.value = 0.6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(vol, time + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    filter.connect(env);
    env.connect(bus);
    if (delaySend) {
      const tap = ctx.createGain();
      tap.gain.value = 0.22;
      env.connect(tap);
      tap.connect(delaySend);
    }

    [f, f * 2].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      const mix = ctx.createGain();
      mix.gain.value = i === 0 ? 0.75 : 0.35;
      osc.connect(mix);
      mix.connect(filter);
      osc.start(time);
      osc.stop(time + dur + 0.04);
    });
  }

  function playComplextroBass(bus, time, midi, dur, mode = 'growl', vol = 0.20) {
    if (!midi || !bus) return;
    const f = midiFreq(midi);

    const shaper = ctx.createWaveShaper();
    shaper.curve = complextroDriveCurve;
    shaper.oversample = '2x';

    const bpf = ctx.createBiquadFilter();
    bpf.type = mode === 'reese' ? 'lowpass' : 'bandpass';
    bpf.Q.value = mode === 'reese' ? 1.8 : 2.6;
    if (mode === 'growl') {
      bpf.frequency.setValueAtTime(240, time);
      bpf.frequency.exponentialRampToValueAtTime(1650, time + dur * 0.55);
      bpf.frequency.exponentialRampToValueAtTime(320, time + dur);
    } else if (mode === 'zap') {
      bpf.frequency.setValueAtTime(2400, time);
      bpf.frequency.exponentialRampToValueAtTime(260, time + dur);
    } else {
      bpf.frequency.setValueAtTime(880, time);
      bpf.frequency.exponentialRampToValueAtTime(340, time + dur);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(vol, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    shaper.connect(bpf);
    bpf.connect(env);
    env.connect(bus);

    const car = ctx.createOscillator();
    car.type = 'sawtooth';
    car.frequency.setValueAtTime(f, time);
    if (mode === 'zap') car.frequency.exponentialRampToValueAtTime(Math.max(36, f * 0.5), time + dur);

    if (mode === 'growl') {
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      mod.type = 'sine';
      mod.frequency.setValueAtTime(f * 2, time);
      modGain.gain.setValueAtTime(f * 3.2, time);
      mod.connect(modGain);
      modGain.connect(car.frequency);
      mod.start(time);
      mod.stop(time + dur + 0.03);
    } else if (mode === 'reese') {
      const det = ctx.createOscillator();
      det.type = 'sawtooth';
      det.frequency.setValueAtTime(f, time);
      det.detune.setValueAtTime(14, time);
      det.connect(shaper);
      det.start(time);
      det.stop(time + dur + 0.03);
    }

    car.connect(shaper);
    car.start(time);
    car.stop(time + dur + 0.03);

    // Clean sub weight underneath complextro mids
    playSynthVoice(bus, time, f, dur, { type: 'sine', vol: vol * 0.55, attack: 0.005, cutoff: 180 });
  }

  // --- Track compositions (each loops seamlessly every 64 steps) ---
  const DASHBOARD_CHORDS = {
    0: [59, 62, 66, 69, 73],   // Bm9
    16: [55, 59, 62, 66, 69],  // Gmaj9
    32: [50, 57, 61, 66, 69],  // Dmaj9
    48: [57, 61, 64, 66, 71],  // A6add9
  };
  const DASHBOARD_SUB = { 0: 35, 16: 31, 32: 38, 48: 33 };
  const DASHBOARD_BELL = [
    74, 0, 78, 0, 0, 81, 0, 74, 73, 0, 0, 69, 0, 71, 0, 0,
    74, 0, 78, 0, 0, 83, 0, 78, 76, 0, 0, 73, 0, 69, 0, 0,
    74, 0, 81, 0, 0, 85, 0, 81, 78, 0, 0, 74, 0, 73, 0, 0,
    71, 0, 76, 0, 0, 78, 0, 76, 73, 0, 0, 69, 0, 0, 0, 0,
  ];

  const EXPLORE_CHORDS = {
    0: [57, 60, 64, 67, 71],   // Am9
    16: [53, 57, 60, 64, 69],  // Fmaj7
    32: [50, 53, 57, 60, 64],  // Dm9
    48: [52, 55, 59, 62, 67],  // Em7
  };
  const EXPLORE_SUB = { 0: 33, 16: 41, 32: 38, 48: 40 };
  const EXPLORE_ARP = [
    64, 0, 67, 0, 71, 0, 72, 0, 71, 0, 67, 0, 64, 0, 0, 0,
    60, 0, 64, 0, 69, 0, 72, 0, 69, 0, 64, 0, 60, 0, 0, 0,
    62, 0, 65, 0, 69, 0, 72, 0, 69, 0, 65, 0, 62, 0, 0, 0,
    64, 0, 67, 0, 71, 0, 74, 0, 71, 0, 67, 0, 64, 0, 0, 0,
  ];

  // Battle (Chiptune + Rock): 142 BPM, 16th-note grid, 4 bars in E minor (Em -> C -> D -> B7)
  const BATTLE_ROOTS = [40, 36, 38, 35]; // E2, C2, D2, B1
  const BATTLE_CHIP_LEAD = [
    // Bar 1 (Em)
    76, 0, 79, 0, 83, 0, 83, 81, 79, 0, 76, 0, 74, 0, 76, 0,
    // Bar 2 (C)
    79, 0, 76, 0, 72, 0, 76, 79, 81, 0, 79, 0, 76, 0, 72, 0,
    // Bar 3 (D)
    74, 0, 78, 0, 81, 0, 86, 0, 83, 0, 81, 0, 78, 0, 74, 0,
    // Bar 4 (B7 turnaround)
    75, 0, 78, 0, 83, 0, 81, 79, 78, 0, 75, 0, 71, 0, 75, 78,
  ];
  const BATTLE_CHIP_ARP = [
    64, 67, 71, 67, 64, 67, 71, 76, 64, 67, 71, 67, 71, 67, 64, 67,
    60, 64, 67, 64, 60, 64, 67, 72, 60, 64, 67, 64, 67, 64, 60, 64,
    62, 66, 69, 66, 62, 66, 69, 74, 62, 66, 69, 66, 69, 66, 62, 66,
    59, 63, 66, 63, 59, 63, 66, 71, 59, 63, 66, 71, 75, 71, 66, 63,
  ];

  // Boss (Complextro / Breakcore + Classical): 172 BPM, 16th-note grid, D harmonic minor
  const BOSS_CHORDS = {
    0: [50, 53, 57, 62],       // Dm
    16: [46, 50, 53, 58],      // Bb
    32: [43, 50, 55, 58],      // Gm
    48: [45, 49, 55, 57],      // A7
  };
  const BOSS_HARPSICHORD = [
    // Baroque D harmonic minor arpeggio cascade
    74, 69, 65, 69, 74, 77, 76, 74, 73, 69, 64, 69, 73, 76, 74, 73,
    70, 65, 62, 65, 70, 74, 72, 70, 69, 65, 62, 65, 69, 74, 72, 70,
    67, 62, 58, 62, 67, 70, 69, 67, 65, 62, 58, 62, 67, 70, 69, 67,
    69, 64, 61, 64, 69, 73, 76, 79, 81, 79, 76, 73, 69, 64, 61, 57,
  ];
  const BOSS_COMPLEXTRO_SLOTS = {
    0: { midi: 38, mode: 'growl', len: 3 },
    4: { midi: 38, mode: 'reese', len: 2 },
    7: { midi: 50, mode: 'zap', len: 1.5 },
    10: { midi: 38, mode: 'growl', len: 2 },
    14: { midi: 41, mode: 'zap', len: 1.5 },
    16: { midi: 34, mode: 'reese', len: 3 },
    20: { midi: 46, mode: 'growl', len: 2 },
    23: { midi: 34, mode: 'zap', len: 1.5 },
    26: { midi: 34, mode: 'growl', len: 2.5 },
    32: { midi: 43, mode: 'growl', len: 3 },
    36: { midi: 31, mode: 'reese', len: 2 },
    39: { midi: 43, mode: 'zap', len: 1.5 },
    42: { midi: 31, mode: 'growl', len: 2 },
    46: { midi: 46, mode: 'zap', len: 1.5 },
    48: { midi: 33, mode: 'reese', len: 3 },
    52: { midi: 45, mode: 'growl', len: 2 },
    55: { midi: 37, mode: 'zap', len: 1.5 },
    58: { midi: 33, mode: 'growl', len: 2 },
    61: { midi: 45, mode: 'zap', len: 1.2 },
  };

  const TRACKS = {
    dashboard: {
      tempo: 72,
      subdivision: 2, // eighth notes
      steps: 64,
      cutoffHz: 2100,
      busGain: 1.05,
      step(bus, step, dur, time) {
        if (DASHBOARD_CHORDS[step]) {
          playWarmPad(bus, time, DASHBOARD_CHORDS[step], dur * 16.5, {
            vol: 0.14,
            cutoff: 980,
            attack: 0.65,
            sendDelay: 0.35,
          });
        }
        if (DASHBOARD_SUB[step]) {
          playSynthVoice(bus, time, midiFreq(DASHBOARD_SUB[step]), dur * 15.5, {
            type: 'sine',
            vol: 0.24,
            attack: 0.14,
            cutoff: 220,
          });
        }
        const bell = DASHBOARD_BELL[step];
        if (bell) {
          playFeltBell(bus, time, bell, dur * 3.8, { vol: 0.125, sendDelay: 0.5 });
        }
        if (step % 8 === 0) {
          playDrum(bus, time, 'softKick', 0.08);
        }
      },
    },

    explore: {
      tempo: 94,
      subdivision: 2,
      steps: 64,
      cutoffHz: 2700,
      busGain: 1.0,
      step(bus, step, dur, time) {
        if (EXPLORE_CHORDS[step]) {
          playWarmPad(bus, time, EXPLORE_CHORDS[step], dur * 16.2, {
            vol: 0.12,
            cutoff: 1200,
            attack: 0.45,
            sendDelay: 0.28,
          });
        }
        if (EXPLORE_SUB[step]) {
          playSynthVoice(bus, time, midiFreq(EXPLORE_SUB[step]), dur * 7.8, {
            type: 'triangle',
            vol: 0.20,
            attack: 0.06,
            cutoff: 260,
          });
        } else if (step % 16 === 8) {
          const barSub = EXPLORE_SUB[step - 8];
          if (barSub) {
            playSynthVoice(bus, time, midiFreq(barSub + 7), dur * 7.2, {
              type: 'sine',
              vol: 0.15,
              attack: 0.06,
              cutoff: 260,
            });
          }
        }
        const arp = EXPLORE_ARP[step];
        if (arp) {
          playFeltBell(bus, time, arp, dur * 2.1, { vol: 0.11, sendDelay: 0.42 });
        }
        if (step % 8 === 0) playDrum(bus, time, 'softKick', 0.11);
        if (step % 8 === 4) playDrum(bus, time, 'hat', 0.025);
      },
    },

    battle: {
      tempo: 142,
      subdivision: 4, // 16th-note grid
      steps: 64,
      cutoffHz: 5800,
      busGain: 0.96,
      step(bus, step, dur, time) {
        const bar = Math.floor(step / 16);
        const s = step % 16;
        const root = BATTLE_ROOTS[bar];

        // Rock drums: driving kick/snare groove + bar-4 fill
        if (s === 0 || s === 6 || s === 8 || (bar === 3 && s === 11)) {
          playDrum(bus, time, 'kick', 0.34);
        }
        if (s === 4 || s === 12 || (bar === 3 && (s === 14 || s === 15))) {
          playDrum(bus, time, 'snare', s >= 14 ? 0.24 : 0.28);
        }
        if (step % 2 === 0) {
          playDrum(bus, time, s === 10 ? 'openHat' : 'hat', 0.065);
        }

        // Rock rhythm power guitars (sustained accent on downbeat + palm-muted chugs)
        if (s === 0 || s === 6 || s === 10) {
          playRockGuitarChord(bus, time, root, s === 0 ? dur * 3.6 : dur * 1.9, { muted: false, vol: 0.125 });
        } else if (s % 2 === 0) {
          playRockGuitarChord(bus, time, root, dur * 0.9, { muted: true, vol: 0.095 });
        }

        // Driving rock bass (warm low-passed sawtooth + triangle sub)
        if (s % 2 === 0 || s === 7) {
          const bassNote = (bar === 3 && s >= 12) ? root + 3 : root - 12;
          playSynthVoice(bus, time, midiFreq(bassNote), dur * 1.5, {
            type: 'sawtooth',
            vol: 0.17,
            attack: 0.006,
            cutoff: 480,
          });
        }

        // Crisp 8-bit chiptune arpeggio sparkles + heroic square lead
        const arp = BATTLE_CHIP_ARP[step];
        if (arp) {
          playSynthVoice(bus, time, midiFreq(arp), dur * 0.78, {
            type: 'square',
            vol: 0.055,
            attack: 0.004,
            cutoff: 3200,
          });
        }
        const lead = BATTLE_CHIP_LEAD[step];
        if (lead) {
          playSynthVoice(bus, time, midiFreq(lead), dur * 1.85, {
            type: 'square',
            vol: 0.115,
            attack: 0.008,
            cutoff: 3600,
            sendDelay: 0.18,
          });
        }
      },
    },

    boss: {
      tempo: 172,
      subdivision: 4, // 16th-note grid
      steps: 64,
      cutoffHz: 6800,
      busGain: 0.95,
      step(bus, step, dur, time) {
        const bar = Math.floor(step / 16);
        const s = step % 16;

        // Classical dramatic strings pad + marcato stabs per bar
        if (BOSS_CHORDS[step]) {
          playWarmPad(bus, time, BOSS_CHORDS[step], dur * 16, {
            vol: 0.145,
            cutoff: 2400,
            attack: 0.09,
            sendDelay: 0.25,
          });
        }

        // Virtuoso Baroque Harpsichord 16th-note run
        const harp = BOSS_HARPSICHORD[step];
        if (harp) {
          playHarpsichord(bus, time, harp, dur * 1.35, 0.13);
        }

        // Complextro glitch bass call-and-response
        const bassEvt = BOSS_COMPLEXTRO_SLOTS[step];
        if (bassEvt) {
          playComplextroBass(bus, time, bassEvt.midi, dur * bassEvt.len, bassEvt.mode, 0.21);
        }

        // Breakcore chopped Amen-style breakbeat + 32nd-note stutter rolls
        if (s === 0 || s === 3 || s === 10 || (bar % 2 === 1 && s === 14)) {
          playDrum(bus, time, 'kick', 0.36);
        }
        if (s === 4 || s === 12) {
          playDrum(bus, time, 'snare', 0.30);
        } else if (s === 7 || s === 9 || s === 15) {
          playDrum(bus, time, 'ghostSnare', 0.20);
        }
        // Signature breakcore 32nd-note snare/glitch stutter fills at end of bars 2 & 4
        if ((bar === 1 && s >= 12) || (bar === 3 && s >= 10)) {
          playDrum(bus, time, 'glitchSnare', 0.24);
          playDrum(bus, time + dur * 0.5, s % 2 === 0 ? 'glitchSnare' : 'ghostSnare', 0.18);
        }
        if (s % 2 === 0) {
          playDrum(bus, time, s === 6 || s === 14 ? 'openHat' : 'ride', 0.065);
        }
      },
    },
  };

  function scheduleMusic() {
    if (!ctx || !musicName || !enabled || ctx.state !== 'running') return;
    const track = TRACKS[musicName];
    if (!track || !activeTrackBus) return;
    const stepDur = 60 / track.tempo / (track.subdivision || 2);
    if (nextNoteTime < ctx.currentTime - 0.12) {
      nextNoteTime = ctx.currentTime + 0.02;
    }
    while (nextNoteTime < ctx.currentTime + 0.18) {
      const idx = musicStep % track.steps;
      track.step(activeTrackBus, idx, stepDur, nextNoteTime);
      nextNoteTime += stepDur;
      musicStep++;
    }
  }

  function stopTimer() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  }

  return {
    get enabled() {
      return enabled;
    },
    get ready() {
      return Boolean(ctx && ctx.state === 'running');
    },
    get musicVolume() {
      return musicVolume;
    },
    get soundEffectVolume() {
      return soundEffectVolume;
    },
    get currentMusic() {
      return musicName;
    },
    ensure,
    play(name) {
      if (!ensure()) return;
      try {
        if (effects[name]) effects[name]();
      } catch (error) {
        console.error(`Sound effect "${name}" failed.`, error);
      }
    },
    // name: 'dashboard' | 'explore' | 'battle' | 'boss' | null (stop)
    music(name) {
      if (!enabled || !name) {
        musicName = null;
        stopTimer();
        releaseActiveTrackBus();
        return;
      }
      if (!TRACKS[name]) return;
      if (name === musicName && musicTimer && activeTrackBus) return;
      if (!ensure()) {
        musicName = name;
        return;
      }
      const track = TRACKS[name];
      musicName = name;
      musicStep = 0;
      nextNoteTime = ctx.currentTime + 0.05;
      createTrackBus(track.cutoffHz, track.busGain);
      stopTimer();
      musicTimer = setInterval(scheduleMusic, 35);
      scheduleMusic();
    },
    setEnabled(value) {
      enabled = Boolean(value);
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'on' : 'off');
      } catch (error) {
        console.error('Unable to save the sound setting.', error);
      }
      if (!enabled) {
        musicName = null;
        stopTimer();
        releaseActiveTrackBus();
      }
    },
    setMusicVolume(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError('Music volume must be between 0 and 1.');
      }
      musicVolume = value;
      if (ctx && musicGain) {
        musicGain.gain.setTargetAtTime(gameplayMusicGain(musicVolume), ctx.currentTime, 0.015);
      }
      try {
        localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(musicVolume));
      } catch (error) {
        console.error('Unable to save the music volume setting.', error);
      }
    },
    setSoundEffectVolume(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError('Sound-effect volume must be between 0 and 1.');
      }
      soundEffectVolume = value;
      if (ctx && sfxGain) {
        sfxGain.gain.setTargetAtTime(soundEffectVolume, ctx.currentTime, 0.015);
      }
      try {
        localStorage.setItem(SOUND_EFFECT_VOLUME_STORAGE_KEY, String(soundEffectVolume));
      } catch (error) {
        console.error('Unable to save the sound-effect volume setting.', error);
      }
    },
  };
})();
