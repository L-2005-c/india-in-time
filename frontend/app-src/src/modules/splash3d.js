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

    // Cinematic deep resonant low-pass filter
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, now);
    filter.Q.setValueAtTime(2.2, now);

    droneGain = audioCtx.createGain();
    droneGain.gain.setValueAtTime(0.0001, now);
    droneGain.gain.exponentialRampToValueAtTime(0.09, now + 1.6);

    droneGain.connect(filter);
    filter.connect(masterGain);

    // Deep cinematic sub-bass braam anchor: D1 (36.7Hz) with subtle slow glide
    const sub = audioCtx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(42, now);
    sub.frequency.exponentialRampToValueAtTime(36.7, now + 2.5);

    // Root fundamental: D2 (73.42Hz) warm analog triangle
    const root = audioCtx.createOscillator();
    root.type = 'triangle';
    root.frequency.setValueAtTime(73.42, now);

    // Warm fifth: A2 (110Hz) with gentle shimmer detune
    const fifth = audioCtx.createOscillator();
    fifth.type = 'sine';
    fifth.frequency.setValueAtTime(110, now);
    fifth.detune.setValueAtTime(4, now);

    // Suspended cinematic octave: D3 (146.83Hz)
    const oct = audioCtx.createOscillator();
    oct.type = 'sine';
    oct.frequency.setValueAtTime(146.83, now);

    sub.connect(droneGain);
    root.connect(droneGain);
    fifth.connect(droneGain);
    oct.connect(droneGain);

    sub.start(now);
    root.start(now);
    fifth.start(now);
    oct.start(now);

    droneOscs = [sub, root, fifth, oct];
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
    // Resonant singing-bowl & golden temple bell harmonics (D4, F#4, A4, D5)
    const tones = [
      [293.66, 587.33, 880.00],  // D4, D5, A5
      [369.99, 739.99, 1108.73], // F#4, F#5, C#6
      [440.00, 880.00, 1318.51], // A4, A5, E6
      [587.33, 1174.66, 1760.00] // D5, D6, A6
    ];
    const freqs = tones[Math.min(stageIdx, tones.length - 1)] || [440, 880, 1320];

    const bellGain = audioCtx.createGain();
    bellGain.gain.setValueAtTime(0.0001, now);
    bellGain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    bellGain.connect(masterGain);

    freqs.forEach((f, idx) => {
      const osc = audioCtx.createOscillator();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now);
      osc.connect(bellGain);
      osc.start(now);
      osc.stop(now + 1.0);
    });
  } catch (_e) {}
}

function playReadyChime() {
  if (!audioCtx || isAudioMuted || isDismissed) return;
  ensureAudioStarted();
  try {
    const now = audioCtx.currentTime;
    // Majestic golden chord flourish: D4, A4, D5, F#5, A5, D6
    const chord = [293.66, 440.00, 587.33, 739.99, 880.00, 1174.66];
    chord.forEach((freq, i) => {
      const t = now + i * 0.065;
      const osc = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();

      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      noteGain.gain.setValueAtTime(0.0001, t);
      noteGain.gain.linearRampToValueAtTime(0.09, t + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 1.5);
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

  // The intro is decorative, so it must yield on devices that are likely to
  // have a constrained GPU/CPU or when the user asks for less motion.
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const isMobile = window.innerWidth <= 640;
  const isConstrainedDevice = Boolean(
    prefersReducedMotion ||
    connection?.saveData ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  );
  splash.classList.toggle('performance-lite', isConstrainedDevice);

  // Creating an AudioContext during boot can compete with rendering and is
  // usually suspended by browser autoplay rules anyway. Create it only after
  // a real user gesture.
  const unlockAudio = () => {
    ensureAudioStarted();
    ['pointerdown', 'keydown'].forEach(ev => {
      window.removeEventListener(ev, unlockAudio);
    });
  };
  ['pointerdown', 'keydown'].forEach(ev => {
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

  // Hero explore button binding
  const heroBtn = splash.querySelector('.btn-hero-explore');
  if (heroBtn) {
    const handleHeroClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissSplash();
    };
    heroBtn.addEventListener('click', handleHeroClick);
    cleanupFns.push(() => heroBtn.removeEventListener('click', handleHeroClick));
  }

  const canvas = document.getElementById('splash-star-canvas');
  const stage = document.getElementById('splash-stage-3d');
  const pBar = document.getElementById('splash-progress-bar');
  const pNum = document.getElementById('splash-status-num');
  const pLbl = document.getElementById('splash-status-lbl');

  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = window.innerWidth;
  let height = window.innerHeight;

  const onResize = () => {
    const maxDpr = isMobile ? 1.0 : (isConstrainedDevice ? 1.25 : 2);
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  onResize();
  window.addEventListener('resize', onResize);
  cleanupFns.push(() => window.removeEventListener('resize', onResize));

  // The line renderer compares every visible point to every other point, so
  // point count has a quadratic rendering cost. Keep the full effect on
  // capable desktops while using a lighter profile on mobile/low-power devices.
  // Golden stardust and floating ember field
  const points = [];
  const NUM_POINTS = isConstrainedDevice ? (isMobile ? 18 : 42) : (isMobile ? 26 : 54);
  const GOLDEN_PALETTE = ['#fde047', '#f59e0b', '#ffffff', '#fbbf24', '#fed7aa', '#38bdf8'];

  for (let i = 0; i < NUM_POINTS; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;
    const radius = (isMobile ? 170 : 260) + Math.random() * (isMobile ? 120 : 220);
    const isBokeh = Math.random() < 0.18;
    points.push({
      x: radius * Math.cos(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * 0.72,
      z: radius * Math.cos(phi) * Math.sin(theta),
      size: isBokeh ? Math.random() * 3.2 + 2.2 : Math.random() * 1.8 + 0.8,
      color: GOLDEN_PALETTE[i % GOLDEN_PALETTE.length],
      pulse: Math.random() * Math.PI * 2,
      isBokeh,
    });
  }

  let rotX = 0.15;
  let rotY = 0;
  let targetRotX = 0.15;
  let targetRotY = 0;
  let targetStageRotX = 0;
  let targetStageRotY = 0;
  let currentStageRotX = 0;
  let currentStageRotY = 0;
  let lastAppliedRotX = 0;
  let lastAppliedRotY = 0;

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
    targetStageRotY = mx * 10;
    targetStageRotX = -my * 8;
  };
  if (!prefersReducedMotion) {
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    cleanupFns.push(() => window.removeEventListener('mousemove', onMouseMove));
  }

  // 3D Parallax on Mobile Gyroscope - subtle, non-dizzy micro-tilt
  const onDeviceOrientation = (e) => {
    if (isDismissed || e.gamma === null || e.beta === null) return;
    ensureAudioStarted();
    const tiltX = Math.min(Math.max(e.gamma / 35, -1), 1);
    const tiltY = Math.min(Math.max((e.beta - 45) / 35, -1), 1);
    targetRotY = tiltX * 0.12;
    targetRotX = 0.12 - tiltY * 0.08;
    targetStageRotY = tiltX * 4;
    targetStageRotX = -tiltY * 3;
  };
  if (!prefersReducedMotion && !isConstrainedDevice) {
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    cleanupFns.push(() => window.removeEventListener('deviceorientation', onDeviceOrientation));
  }

  // Render Loop
  let lastRenderAt = 0;
  function render(timestamp) {
    if (isDismissed) return;

    // Keep the decorative background smooth without rendering more often than
    // needed. The browser/display may still impose a lower refresh rate.
    if (lastRenderAt && timestamp - lastRenderAt < 11.1) {
      animId = requestAnimationFrame(render);
      return;
    }
    lastRenderAt = timestamp;

    ctx.clearRect(0, 0, width, height);

    rotX += (targetRotX - rotX) * 0.05;
    rotY += 0.003 + (targetRotY - rotY) * 0.05;

    // Smooth lerp for stage tilt (60 FPS) with threshold to prevent forced style recalculations
    currentStageRotX += (targetStageRotX - currentStageRotX) * 0.08;
    currentStageRotY += (targetStageRotY - currentStageRotY) * 0.08;
    const nextRotX = Number(currentStageRotX.toFixed(2));
    const nextRotY = Number(currentStageRotY.toFixed(2));
    if (stage && (Math.abs(nextRotX - lastAppliedRotX) >= 0.05 || Math.abs(nextRotY - lastAppliedRotY) >= 0.05)) {
      lastAppliedRotX = nextRotX;
      lastAppliedRotY = nextRotY;
      stage.style.transform = `rotateY(${nextRotY}deg) rotateX(${nextRotX}deg)`;
    }

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

    // Draw connecting constellation lines between proximate stars (single-pass batched path)
    if (!isConstrainedDevice) {
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.beginPath();
      let hasLines = false;
      const maxOuter = isMobile ? Math.min(projected.length, 12) : projected.length;
      for (let i = 0; i < maxOuter; i++) {
        const p1 = projected[i];
        for (let j = i + 1; j < projected.length; j++) {
          const p2 = projected[j];
          const dx = p1.px - p2.px;
          const dy = p1.py - p2.py;
          const dist = dx * dx + dy * dy;

          if (dist < 3000) {
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
            hasLines = true;
          }
        }
      }
      if (hasLines) {
        ctx.stroke();
      }
    }

    // Draw Stars & Bokeh Embers
    for (let i = 0; i < projected.length; i++) {
      const pt = projected[i];
      const currentSize = pt.size * pt.scale * (1 + Math.sin(pt.pulse) * 0.25);
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = pt.alpha;
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, Math.max(0.6, currentSize), 0, Math.PI * 2);
      ctx.fill();

      // Atmospheric golden aura for near motes and bokeh orbs
      if (pt.isBokeh || pt.scale > 0.8) {
        ctx.globalAlpha = pt.alpha * (pt.isBokeh ? 0.35 : 0.22);
        ctx.beginPath();
        ctx.arc(pt.px, pt.py, currentSize * (pt.isBokeh ? 2.8 : 2.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;

    if (isDismissed || (typeof document !== 'undefined' && document.hidden)) {
      animId = null;
      return;
    }
    animId = requestAnimationFrame(render);
  }

  if (!prefersReducedMotion) {
    animId = requestAnimationFrame(render);
  }

  const onVisibilityChange = () => {
    if (isDismissed) return;
    if (document.hidden) {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    } else if (!animId && !prefersReducedMotion) {
      animId = requestAnimationFrame(render);
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  cleanupFns.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

  // Cinematic Narrative Chapters Sequence
  const stages = [
    { pct: 24, label: 'BEYOND THE HORIZON...' },
    { pct: 52, label: '5,000 YEARS OF TIMELESS WONDER...' },
    { pct: 76, label: 'CHARTING SACRED PEAKS & SCENIC TRAILS...' },
    { pct: 92, label: 'WHERE TIME MEETS DESTINY...' },
    { pct: 100, label: 'WELCOME TO INDIA IN-TIME ✦' }
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
      setTimeout(() => {
        if (!isDismissed) {
          if (typeof onComplete === 'function') {
            onComplete();
          } else {
            dismissSplash();
          }
        }
      }, 550);
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

  // Seamless transition: ensure login-screen is ready behind the splash
  // before the warp fade starts, preventing a sudden flash of unrendered map
  const login = document.getElementById('login-screen');
  if (login && !window.currentUser) {
    login.style.display = 'flex';
    login.style.opacity = '1';
  }

  splash.classList.add('splash-warp-exit');
  // Warm up map rendering behind the fading splash
  window.safeInvalidateMapSize?.(false);

  setTimeout(() => {
    splash.style.display = 'none';
    // Re-verify map geometry once splash overlay is fully removed
    window.safeInvalidateMapSize?.(false);

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
