// Sound effects and gameplay music use the Web Audio API; the dashboard uses its bundled music track.
// Browsers only start audio after a click or key press; the first sound or music call sets it up.
const SOUND_STORAGE_KEY = 'kings-pigs-sound';
const LEGACY_MASTER_VOLUME_STORAGE_KEY = 'kings-pigs-master-volume';
const MUSIC_VOLUME_STORAGE_KEY = 'kings-pigs-music-volume';
const SOUND_EFFECT_VOLUME_STORAGE_KEY = 'kings-pigs-sfx-volume';
const DEFAULT_MUSIC_VOLUME = 0.20;
const DEFAULT_SOUND_EFFECT_VOLUME = 0.50;
const MASTER_GAIN = 0.45;
const GAMEPLAY_MUSIC_BASE_GAIN = 0.16;

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
  let musicName = null;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;
  const dashboardMusic = new Audio('./bgm/bgmdashboard.mp3');
  dashboardMusic.preload = 'none';
  dashboardMusic.loop = true;
  dashboardMusic.volume = musicVolume;

  function gameplayMusicGain(volume) {
    return GAMEPLAY_MUSIC_BASE_GAIN * (volume / DEFAULT_MUSIC_VOLUME);
  }

  function ensure() {
    if (!enabled) return null;
    try {
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
        musicGain = ctx.createGain();
        musicGain.gain.value = gameplayMusicGain(musicVolume);
        musicGain.connect(masterGain);
      }
      if (ctx.state === 'suspended') ctx.resume();
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

  // Music is a short looping pattern of bass and lead notes per track, scheduled a little ahead of time.
  const tracks = {
    explore: {
      tempo: 96,
      bass: [110, 0, 110, 0, 147, 0, 147, 0, 98, 0, 98, 0, 123, 0, 123, 0],
      lead: [0, 0, 330, 0, 0, 392, 0, 330, 0, 0, 294, 0, 0, 330, 0, 0],
    },
    battle: {
      tempo: 132,
      bass: [110, 110, 165, 110, 110, 110, 147, 110, 110, 110, 165, 110, 98, 98, 147, 98],
      lead: [440, 0, 523, 0, 440, 0, 392, 0, 349, 0, 392, 0, 440, 0, 330, 0],
    },
    boss: {
      tempo: 150,
      bass: [55, 55, 58, 55, 55, 55, 52, 55, 55, 55, 58, 55, 49, 49, 52, 49],
      lead: [0, 233, 0, 220, 0, 233, 0, 196, 0, 233, 0, 220, 0, 196, 0, 0],
    },
  };

  function scheduleMusic() {
    if (!ctx || !musicName) return;
    const track = tracks[musicName];
    const stepDur = 60 / track.tempo / 2;
    while (nextNoteTime < ctx.currentTime + 0.15) {
      const i = musicStep % track.lead.length;
      const when = Math.max(0, nextNoteTime - ctx.currentTime);
      if (track.bass[i]) tone(track.bass[i], stepDur * 0.9, { type: 'triangle', vol: 0.5, when, dest: musicGain });
      if (track.lead[i]) tone(track.lead[i], stepDur * 0.8, { type: 'square', vol: 0.3, when, dest: musicGain });
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
        dashboardMusic.pause();
        dashboardMusic.currentTime = 0;
        return;
      }
      if (name === 'dashboard') {
        if (musicName === name && !dashboardMusic.paused) return;
        stopTimer();
        musicName = name;
        dashboardMusic.play().catch((error) => {
          if (error.name !== 'NotAllowedError') console.error('Unable to play dashboard music.', error);
        });
        return;
      }
      if (name === musicName || !tracks[name]) return;
      dashboardMusic.pause();
      dashboardMusic.currentTime = 0;
      if (!ensure()) return;
      musicName = name;
      musicStep = 0;
      nextNoteTime = ctx.currentTime + 0.05;
      stopTimer();
      musicTimer = setInterval(scheduleMusic, 60);
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
        dashboardMusic.pause();
        dashboardMusic.currentTime = 0;
      }
    },
    setMusicVolume(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError('Music volume must be between 0 and 1.');
      }
      musicVolume = value;
      dashboardMusic.volume = musicVolume;
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
