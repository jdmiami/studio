// Stickerwild — tiny synthesised sound effects (no audio files).
'use strict';
(function () {
  let ctx = null, master = null, noiseBuf = null;
  const A = (SW.audio = { muted: SW.store.get('muted', false) });

  A.unlock = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = A.muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  };
  A.setMuted = function (m) {
    A.muted = m; SW.store.set('muted', m);
    if (master) master.gain.value = m ? 0 : 0.5;
  };

  function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
    if (!ctx || A.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, freq, q = 1, vol = 0.3, type = 'bandpass') {
    if (!ctx || A.muted) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  }

  const FX = {
    chop: () => { noise(0.12, 700, 2, 0.5); tone(140, 0.08, 'triangle', 0.25, 0.6); },
    mine: () => { noise(0.08, 2600, 6, 0.35); tone(820, 0.07, 'square', 0.06, 0.8); },
    rustle: () => noise(0.18, 3200, 0.8, 0.22, 'highpass'),
    swing: () => noise(0.12, 1400, 0.7, 0.12),
    pickup: () => { tone(660, 0.07, 'sine', 0.18, 1.5); },
    peel: () => { noise(0.25, 1800, 1.2, 0.18); tone(300, 0.2, 'sine', 0.08, 2.2); },
    hurt: () => { tone(220, 0.22, 'square', 0.12, 0.5); noise(0.1, 500, 1, 0.3); },
    hit: () => { tone(180, 0.1, 'sawtooth', 0.12, 0.5); noise(0.08, 900, 1.5, 0.3); },
    poof: () => { noise(0.35, 600, 0.6, 0.3, 'lowpass'); tone(420, 0.25, 'sine', 0.08, 0.4); },
    eat: () => { noise(0.06, 1500, 2, 0.3); setTimeout(() => noise(0.06, 1300, 2, 0.3), 90); },
    craft: () => { tone(523, 0.1, 'triangle', 0.2); tone(659, 0.1, 'triangle', 0.2, 0, 0.08); tone(784, 0.18, 'triangle', 0.2, 0, 0.16); },
    place: () => { tone(200, 0.12, 'triangle', 0.25, 0.7); noise(0.1, 400, 1, 0.3); },
    night: () => { tone(110, 1.6, 'sine', 0.18, 0.7); tone(165, 1.6, 'sine', 0.1, 0.7, 0.1); },
    dawn: () => { tone(523, 0.3, 'sine', 0.15); tone(784, 0.5, 'sine', 0.12, 0, 0.18); },
    deny: () => tone(160, 0.12, 'square', 0.08),
    death: () => { tone(330, 0.5, 'triangle', 0.2, 0.5); tone(220, 0.8, 'triangle', 0.2, 0.5, 0.3); },
  };
  A.play = function (name) { try { FX[name] && FX[name](); } catch (e) { /* ignore */ } };
})();
