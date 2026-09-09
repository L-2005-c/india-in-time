/**
 * splash3d.js — High-Performance 3D Intro & Telemetry Engine for India In-Time
 * 
 * Provides an interactive 3D astrolabe experience with:
 * - 3D geodesic constellation node field on Canvas
 * - Real-time mouse and gyroscope parallax tilt
 * - Synchronized travel telemetry progress ticker
 * - Cinematic hyperspace warp exit
 * - Web Audio API spatial synthesizer (cosmic drone, telemetry blips, ready chime, warp whoosh)
 * - Full memory, audio, and RAF cleanup upon exit
 */

let animId = null;
let cleanupFns = [];
let isDismissed = false;

// ── Web Audio Synthesizer Engine ─────────────────────────────────────────────
let audioCtx = null;
let masterGain = null;
let droneGain = null;
let droneOscs = [];
let isAudioMuted = false;
let audioStarted = false;

function initAudioEngine() {
  if (audioCtx) return audioCtx;
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return null;
    audioCtx = new AudioCtxClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(isAudioMuted ? 0 : 0.85, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
    return audioCtx;
  } catch (_e) {
    return null;
  }
}

function ensureAudioStarted() {
  const ctx = initAudioEngine();
  if (!ctx || audioStarted || isAudioMuted || isDismissed) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  if (ctx.state === 'running') {
    audioStarted = true;
    startCosmicDrone();
  }
}

function startCosmicDrone() {
  if (!audioCtx || isAudioMuted || droneOscs.length > 0 || isDismissed) return;
  try {
    const now = audioCtx.currentTime;

    // Gentle low-pass filter for warm cosmic depth
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(340, now);
    filter.Q.setValueAtTime(1.8, now);

    droneGain = audioCtx.createGain();
    droneGain.gain.setValueAtTime(0.0001, now);
    droneGain.gain.exponentialRampToValueAtTime(0.08, now + 1.2);

    droneGain.connect(filter);
    filter.connect(masterGain);

    // Root note: A2 (110Hz)
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(110, now);

    // Harmonic fifth: E3 (164.81Hz) with slight chorus detune
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(164.81, now);
    osc2.detune.setValueAtTime(3.5, now);

    // Sub-bass anchor: A1 (55Hz)
    const osc3 = audioCtx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(55, now);

    osc1.connect(droneGain);
    osc2.connect(droneGain);
    osc3.connect(droneGain);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    droneOscs = [osc1, osc2, osc3];
  } catch (_e) {}
}

function stopCosmicDrone(fadeDuration = 0.4) {
  if (!audioCtx || droneOscs.length === 0) return;
  try {
    const now = audioCtx.currentTime;
    if (droneGain) {
      droneGain.gain.setValueAtTime(Math.max(droneGain.gain.value, 0.0001), now);
      droneGain.gain.exponentialRampToValueAtTime(0.00001, now + fadeDuration);
    }
    const oscsToStop = [...droneOscs];
    droneOscs = [];
    setTimeout(() => {
      for (const osc of oscsToStop) {
        try { osc.stop(); osc.disconnect(); } catch (_e) {}
      }
    }, (fadeDuration + 0.1) * 1000);
  } catch (_e) {}
}

function playTelemetryBlip(stageIdx) {
  if (!audioCtx || isAudioMuted || isDismissed) return;
  ensureAudioStarted();
  try {
    const now = audioCtx.currentTime;
    const freqs = [
      [659.25, 880.00],    // E5, A5
      [783.99, 1046.50],   // G5, C6
      [880.00, 1318.51],   // A5, E6
      [1046.50, 1567.98]   // C6, G6
    ];
    const pair = freqs[Math.min(stageIdx, freqs.length - 1)] || [880, 1320];

    const blipGain = audioCtx.createGain();
    blipGain.gain.setValueAtTime(0.0001, now);
    blipGain.gain.linearRampToValueAtTime(0.07, now + 0.012);
    blipGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    blipGain.connect(masterGain);

    pair.forEach((f, idx) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.02);
      osc.connect(blipGain);
      osc.start(now + idx * 0.02);
      osc.stop(now + 0.13);
    });
  } catch (_e) {}
}

function playReadyChime() {
  if (!audioCtx || isAudioMuted || isDismissed) return;
  ensureAudioStarted();
  try {
    const now = audioCtx.currentTime;
    // Radiant harmonic arpeggio: C5, E5, G5, B5, C6
    const chord = [523.25, 659.25, 783.99, 987.77, 1046.50];
    chord.forEach((freq, i) => {
      const t = now + i * 0.055;
      const osc = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();

      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      noteGain.gain.setValueAtTime(0.0001, t);
      noteGain.gain.linearRampToValueAtTime(0.075, t + 0.015);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 1.0);
    });
  } catch (_e) {}
}

function playWarpWhoosh() {
  if (!audioCtx || isAudioMuted) return;
  try {
    const now = audioCtx.currentTime;
    stopCosmicDrone(0.35);

    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const whooshGain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.26);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.68);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.exponentialRampToValueAtTime(1500, now + 0.24);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.68);
    filter.Q.setValueAtTime(2.6, now);

    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.linearRampToValueAtTime(0.12, now + 0.16);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

    osc.connect(filter);
    filter.connect(whooshGain);
    whooshGain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.72);
  } catch (_e) {}
}

export function toggleSplashSound() {
  isAudioMuted = !isAudioMuted;
  const btn = document.getElementById('splash-sound-btn');
  if (btn) {
    btn.textContent = isAudioMuted ? '🔇' : '🔊';
    btn.classList.toggle('sound-muted', isAudioMuted);
    btn.setAttribute('aria-label', isAudioMuted ? 'Unmute audio effects' : 'Mute audio effects');
    btn.title = isAudioMuted ? 'Sound Muted' : 'Sound Active';
  }

  if (masterGain && audioCtx) {
    const now = audioCtx.currentTime;
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(isAudioMuted ? 0 : 0.85, now + 0.08);
  }

  if (!isAudioMuted) {
    ensureAudioStarted();
    playTelemetryBlip(0);
  }
}

// ── Core 3D Stage & Particle Cloud ───────────────────────────────────────────
export function initSplash3D(onComplete) {
  isDismissed = false;
  audioStarted = false;
  const splash = document.getElementById('splash');
  if (!splash) return;

  // Initialize Web Audio context and gesture listener for autoplay policy
  initAudioEngine();
  const unlockAudio = () => {
    ensureAudioStarted();
    ['pointerdown', 'touchstart', 'click', 'keydown', 'mousemove'].forEach(ev => {
      window.removeEventListener(ev, unlockAudio);
    });
  };
  ['pointerdown', 'touchstart', 'click', 'keydown', 'mousemove'].forEach(ev => {
    window.addEventListener(ev, unlockAudio, { once: true, passive: true });
    cleanupFns.push(() => window.removeEventListener(ev, unlockAudio));
  });

  // Direct sound toggle button binding
  const soundBtn = splash.querySelector('.btn-sound-splash');
  if (soundBtn) {
    const handleSoundClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSplashSound();
    };
    soundBtn.addEventListener('click', handleSoundClick);
    cleanupFns.push(() => soundBtn.removeEventListener('click', handleSoundClick));
  }

  // Direct skip button binding for instant response
  const skipBtn = splash.querySelector('.btn-skip-splash');
  if (skipBtn) {
    const handleSkip = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissSplash();
    };
    skipBtn.addEventListener('click', handleSkip);
    cleanupFns.push(() => skipBtn.removeEventListener('click', handleSkip));
  }

  const canvas = document.getElementById('splash-star-canvas');
  const stage = document.getElementById('splash-stage-3d');
  const pBar = document.getElementById('splash-progress-bar');
  const pNum = document.getElementById('splash-status-num');
  const pLbl = document.getElementById('splash-status-lbl');

  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const onResize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', onResize);
  cleanupFns.push(() => window.removeEventListener('resize', onResize));

  // Generate 3D point cloud of cosmic waypoints
  const points = [];
  const NUM_POINTS = 85;

  for (let i = 0; i < NUM_POINTS; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;
    const radius = 250 + Math.random() * 190;
    points.push({
      x: radius * Math.cos(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * 0.72,
      z: radius * Math.cos(phi) * Math.sin(theta),
      size: Math.random() * 2.2 + 0.8,
      color: i % 3 === 0 ? '#10b981' : (i % 3 === 1 ? '#f97316' : '#38bdf8'),
      pulse: Math.random() * Math.PI * 2,
    });
  }

  let rotX = 0.15;
  let rotY = 0;
  let targetRotX = 0.15;
  let targetRotY = 0;

  // 3D Parallax on Desktop
  const onMouseMove = (e) => {
    if (isDismissed) return;
    ensureAudioStarted();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const mx = (e.clientX - cx) / cx;
    const my = (e.clientY - cy) / cy;
    targetRotY = mx * 0.45;
    targetRotX = 0.15 - my * 0.3;

    if (stage) {
      stage.style.transform = `rotateY(${mx * 14}deg) rotateX(${-my * 12}deg)`;
    }
  };
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  cleanupFns.push(() => window.removeEventListener('mousemove', onMouseMove));

  // 3D Parallax on Mobile Gyroscope
  const onDeviceOrientation = (e) => {
    if (isDismissed || e.gamma === null || e.beta === null) return;
    ensureAudioStarted();
    const tiltX = Math.min(Math.max(e.gamma / 28, -1), 1);
    const tiltY = Math.min(Math.max((e.beta - 45) / 28, -1), 1);
    if (stage) {
      stage.style.transform = `rotateY(${tiltX * 16}deg) rotateX(${-tiltY * 14}deg)`;
    }
  };
  window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
  cleanupFns.push(() => window.removeEventListener('deviceorientation', onDeviceOrientation));

  // Render Loop
  function render() {
    if (isDismissed) return;

    ctx.clearRect(0, 0, width, height);

    rotX += (targetRotX - rotX) * 0.05;
    rotY += 0.003 + (targetRotY - rotY) * 0.05;

    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);

    const fov = 420;
    const cx = width / 2;
    const cy = height / 2 - 35;

    const projected = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      p.pulse += 0.035;

      // Rotate Y
      const x1 = p.x * cosY - p.z * sinY;
      const z1 = p.z * cosY + p.x * sinY;

      // Rotate X
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + p.y * sinX + 480;

      if (z2 > 10) {
        const scale = fov / z2;
        const px = cx + x1 * scale;
        const py = cy + y2 * scale;
        const alpha = Math.min(Math.max((z2 - 100) / 450, 0.12), 0.95);

        projected.push({
          px,
          py,
          scale,
          alpha,
          size: p.size,
          color: p.color,
          pulse: p.pulse,
          z: z2,
        });
      }
    }

    // Sort back-to-front
    projected.sort((a, b) => b.z - a.z);

    // Draw connecting constellation lines between proximate stars
    ctx.lineWidth = 0.7;
    for (let i = 0; i < projected.length; i++) {
      for (let j = i + 1; j < projected.length; j++) {
        const p1 = projected[i];
        const p2 = projected[j];
        const dx = p1.px - p2.px;
        const dy = p1.py - p2.py;
        const dist = dx * dx + dy * dy;

        if (dist < 3200) {
          const lineAlpha = (1 - dist / 3200) * 0.18 * Math.min(p1.alpha, p2.alpha);
          ctx.strokeStyle = `rgba(56, 189, 248, ${lineAlpha})`;
          ctx.beginPath();
          ctx.moveTo(p1.px, p1.py);
          ctx.lineTo(p2.px, p2.py);
          ctx.stroke();
        }
      }
    }

    // Draw Stars
    for (let i = 0; i < projected.length; i++) {
      const pt = projected[i];
      const currentSize = pt.size * pt.scale * (1 + Math.sin(pt.pulse) * 0.22);
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = pt.alpha;
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, Math.max(0.6, currentSize), 0, Math.PI * 2);
      ctx.fill();

      // Atmospheric glow for near stars
      if (pt.scale > 0.85) {
        ctx.globalAlpha = pt.alpha * 0.25;
        ctx.beginPath();
        ctx.arc(pt.px, pt.py, currentSize * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;

    animId = requestAnimationFrame(render);
  }

  animId = requestAnimationFrame(render);

  // Telemetry Progress Sequence
  const stages = [
    { pct: 24, label: 'INITIALIZING GEO-AI CORES...' },
    { pct: 48, label: 'CALIBRATING TIME INTELLIGENCE...' },
    { pct: 72, label: 'SYNCING TRANSIT & WEATHER GRIDS...' },
    { pct: 92, label: 'OPTIMIZING SCENIC ITINERARIES...' },
    { pct: 100, label: 'JOURNEY READY ✦' }
  ];

  let currentStage = 0;
  let progress = 0;

  const progressInterval = setInterval(() => {
    if (isDismissed) {
      clearInterval(progressInterval);
      return;
    }
    if (currentStage < stages.length) {
      const target = stages[currentStage];
      progress += Math.floor(Math.random() * 8) + 5;
      if (progress >= target.pct) {
        progress = target.pct;
        if (pLbl) pLbl.textContent = target.label;
        if (currentStage < stages.length - 1) {
          playTelemetryBlip(currentStage);
        } else {
          playReadyChime();
        }
        currentStage++;
      }
      if (pBar) pBar.style.width = `${progress}%`;
      if (pNum) pNum.textContent = `${progress}%`;
    } else {
      clearInterval(progressInterval);
      if (typeof onComplete === 'function') {
        onComplete();
      }
    }
  }, 130);

  cleanupFns.push(() => clearInterval(progressInterval));
}

export function dismissSplash() {
  if (isDismissed) return;
  isDismissed = true;

  playWarpWhoosh();

  const splash = document.getElementById('splash');
  if (!splash) return;

  splash.classList.add('splash-warp-exit');

  setTimeout(() => {
    splash.style.display = 'none';

    // Stop animation loop and clear listeners
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    stopCosmicDrone(0.1);
    for (const fn of cleanupFns) {
      try { fn(); } catch (_e) {}
    }
    cleanupFns = [];

    // Dispose audio context if active
    if (audioCtx) {
      try {
        if (audioCtx.state !== 'closed') {
          audioCtx.close().catch(() => {});
        }
      } catch (_e) {}
      audioCtx = null;
    }
  }, 750);
}
