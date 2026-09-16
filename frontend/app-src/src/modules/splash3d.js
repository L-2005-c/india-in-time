/**
 * splash3d.js — High-Performance 3D Intro & Brand Reveal Engine for India In-Time
 * 
 * Provides an interactive 3D brand intro experience:
 * - 3D rolling emblem entry with physical deceleration and ground settle
 * - Expanding ground shockwave ripple upon touchdown
 * - Sequential "India in Time" typography reveal
 * - Starlight & cyan aurora particle constellation canvas
 * - Spatial Web Audio: rolling whoosh, touchdown impact, and crystalline brand chord
 * - Full memory, audio, and RAF cleanup upon exit
 */

let animId = null;
let cleanupFns = [];
let isDismissed = false;

// ── Web Audio Synthesizer Engine ─────────────────────────────────────────────
let audioCtx = null;
let masterGain = null;
let ambientPadGain = null;
let ambientOscs = [];
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
    startAmbientPad();
  }
}

function startAmbientPad() {
  if (!audioCtx || isAudioMuted || ambientOscs.length > 0 || isDismissed) return;
  try {
    const now = audioCtx.currentTime;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now);
    filter.Q.setValueAtTime(1.8, now);

    ambientPadGain = audioCtx.createGain();
    ambientPadGain.gain.setValueAtTime(0.0001, now);
    ambientPadGain.gain.exponentialRampToValueAtTime(0.07, now + 1.2);

    ambientPadGain.connect(filter);
    filter.connect(masterGain);

    // Modern atmospheric root (C2 65.41Hz)
    const root = audioCtx.createOscillator();
    root.type = 'sine';
    root.frequency.setValueAtTime(65.41, now);

    // Warm fifth (G2 98Hz)
    const fifth = audioCtx.createOscillator();
    fifth.type = 'triangle';
    fifth.frequency.setValueAtTime(98.0, now);

    // Ambient shimmer (C3 130.81Hz)
    const oct = audioCtx.createOscillator();
    oct.type = 'sine';
    oct.frequency.setValueAtTime(130.81, now);
    oct.detune.setValueAtTime(3, now);

    root.connect(ambientPadGain);
    fifth.connect(ambientPadGain);
    oct.connect(ambientPadGain);

    root.start(now);
    fifth.start(now);
    oct.start(now);

    ambientOscs = [root, fifth, oct];
  } catch (_e) {}
}

function stopAmbientPad(fadeDuration = 0.35) {
  if (!audioCtx || ambientOscs.length === 0) return;
  try {
    const now = audioCtx.currentTime;
    if (ambientPadGain) {
      ambientPadGain.gain.setValueAtTime(Math.max(ambientPadGain.gain.value, 0.0001), now);
      ambientPadGain.gain.exponentialRampToValueAtTime(0.00001, now + fadeDuration);
    }
    const oscsToStop = [...ambientOscs];
    ambientOscs = [];
    setTimeout(() => {
      for (const osc of oscsToStop) {
        try { osc.stop(); osc.disconnect(); } catch (_e) {}
      }
    }, (fadeDuration + 0.1) * 1000);
  } catch (_e) {}
}

function playRollWhoosh() {
  if (!audioCtx || isAudioMuted || isDismissed) return;
  ensureAudioStarted();
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.45);
    osc.frequency.exponentialRampToValueAtTime(140, now + 1.05);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.45);
    filter.frequency.exponentialRampToValueAtTime(260, now + 1.05);
    filter.Q.setValueAtTime(2.5, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 1.2);
  } catch (_e) {}
}

function playLandingImpact() {
  if (!audioCtx || isAudioMuted || isDismissed) return;
  ensureAudioStarted();
  try {
    const now = audioCtx.currentTime;

    // Solid low-end touchdown punch (72Hz -> 38Hz)
    const sub = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(72, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.32);

    subGain.gain.setValueAtTime(0.18, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    sub.connect(subGain);
    subGain.connect(masterGain);

    sub.start(now);
    sub.stop(now + 0.4);

    // Clean tactile impact snap
    const snap = audioCtx.createOscillator();
    const snapGain = audioCtx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(480, now);
    snap.frequency.exponentialRampToValueAtTime(160, now + 0.08);

    snapGain.gain.setValueAtTime(0.09, now);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    snap.connect(snapGain);
    snapGain.connect(masterGain);

    snap.start(now);
    snap.stop(now + 0.1);
  } catch (_e) {}
}

function playNameRevealChime() {
  if (!audioCtx || isAudioMuted || isDismissed) return;
  ensureAudioStarted();
  try {
    const now = audioCtx.currentTime;
    // Crystalline brand chord: C5 (523.25), G5 (783.99), C6 (1046.50), E6 (1318.51)
    const chord = [523.25, 783.99, 1046.50, 1318.51];
    chord.forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(t);
      osc.stop(t + 1.15);
    });
  } catch (_e) {}
}

function playWarpWhoosh() {
  if (!audioCtx || isAudioMuted) return;
  try {
    const now = audioCtx.currentTime;
    stopAmbientPad(0.3);

    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const whooshGain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.24);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.65);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.22);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.65);
    filter.Q.setValueAtTime(2.4, now);

    whooshGain.gain.setValueAtTime(0.0001, now);
    whooshGain.gain.linearRampToValueAtTime(0.12, now + 0.15);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);

    osc.connect(filter);
    filter.connect(whooshGain);
    whooshGain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.7);
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
    playNameRevealChime();
  }
}

// ── Core 3D Stage & Particle Cloud ───────────────────────────────────────────
export function initSplash3D(onComplete) {
  isDismissed = false;
  audioStarted = false;
  const splash = document.getElementById('splash');
  if (!splash) return;

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
  const logoRoller = document.getElementById('logo-roller-3d');
  const shockwave = document.getElementById('landing-shockwave');
  const brandReveal = document.getElementById('brand-reveal-box');
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

  // Starlight & Cyan Aurora Particle Field
  const points = [];
  const NUM_POINTS = isConstrainedDevice ? (isMobile ? 18 : 38) : (isMobile ? 24 : 48);
  const MODERN_PALETTE = ['#38bdf8', '#818cf8', '#ffffff', '#67e8f9', '#a5b4fc', '#06b6d4'];

  for (let i = 0; i < NUM_POINTS; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;
    const radius = (isMobile ? 160 : 250) + Math.random() * (isMobile ? 110 : 200);
    const isBokeh = Math.random() < 0.16;
    points.push({
      x: radius * Math.cos(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * 0.72,
      z: radius * Math.cos(phi) * Math.sin(theta),
      size: isBokeh ? Math.random() * 3.0 + 2.0 : Math.random() * 1.6 + 0.8,
      color: MODERN_PALETTE[i % MODERN_PALETTE.length],
      pulse: Math.random() * Math.PI * 2,
      isBokeh,
    });
  }

  let rotX = 0.12;
  let rotY = 0;
  let targetRotX = 0.12;
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
    targetRotY = mx * 0.35;
    targetRotX = 0.12 - my * 0.25;
    targetStageRotY = mx * 8;
    targetStageRotX = -my * 6;
  };
  if (!prefersReducedMotion) {
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    cleanupFns.push(() => window.removeEventListener('mousemove', onMouseMove));
  }

  // 3D Parallax on Mobile Gyroscope
  const onDeviceOrientation = (e) => {
    if (isDismissed || e.gamma === null || e.beta === null) return;
    ensureAudioStarted();
    const tiltX = Math.min(Math.max(e.gamma / 35, -1), 1);
    const tiltY = Math.min(Math.max((e.beta - 45) / 35, -1), 1);
    targetRotY = tiltX * 0.1;
    targetRotX = 0.1 - tiltY * 0.08;
    targetStageRotY = tiltX * 3.5;
    targetStageRotX = -tiltY * 2.5;
  };
  if (!prefersReducedMotion && !isConstrainedDevice) {
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    cleanupFns.push(() => window.removeEventListener('deviceorientation', onDeviceOrientation));
  }

  // Render Loop
  let lastRenderAt = 0;
  function render(timestamp) {
    if (isDismissed) return;

    if (lastRenderAt && timestamp - lastRenderAt < 11.1) {
      animId = requestAnimationFrame(render);
      return;
    }
    lastRenderAt = timestamp;

    ctx.clearRect(0, 0, width, height);

    rotX += (targetRotX - rotX) * 0.05;
    rotY += 0.003 + (targetRotY - rotY) * 0.05;

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
    const cy = height / 2 - 30;

    const projected = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      p.pulse += 0.035;

      // Rotate Y
      const x1 = p.x * cosY - p.z * sinY;
      const z1 = p.z * cosY + p.x * sinY;

      // Rotate X
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = z1 * cosX + p.y * sinX + 460;

      if (z2 > 10) {
        const scale = fov / z2;
        const px = cx + x1 * scale;
        const py = cy + y2 * scale;
        const alpha = Math.min(Math.max((z2 - 100) / 450, 0.12), 0.9);

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

    projected.sort((a, b) => b.z - a.z);

    // Draw connecting constellation lines
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

          if (dist < 2800) {
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
      const currentSize = pt.size * pt.scale * (1 + Math.sin(pt.pulse) * 0.22);
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = pt.alpha;
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, Math.max(0.6, currentSize), 0, Math.PI * 2);
      ctx.fill();

      // Atmospheric aura for near motes and bokeh orbs
      if (pt.isBokeh || pt.scale > 0.8) {
        ctx.globalAlpha = pt.alpha * (pt.isBokeh ? 0.32 : 0.18);
        ctx.beginPath();
        ctx.arc(pt.px, pt.py, currentSize * (pt.isBokeh ? 2.6 : 2.0), 0, Math.PI * 2);
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

  // ── Sequential 3D Logo Roll & "India in Time" Reveal Sequence ──────────────
  playRollWhoosh();

  // Phase 1: Touchdown & Shockwave Ripple (at ~1100ms when logo lands)
  const settleTimeout = setTimeout(() => {
    if (isDismissed) return;
    if (logoRoller) logoRoller.classList.add('is-settled');
    if (shockwave) shockwave.classList.add('shockwave-active');
    playLandingImpact();
  }, 1100);
  cleanupFns.push(() => clearTimeout(settleTimeout));

  // Phase 2: Sequential Name Reveal (at ~1250ms right after landing)
  const revealTimeout = setTimeout(() => {
    if (isDismissed) return;
    if (brandReveal) brandReveal.classList.add('is-revealed');
    playNameRevealChime();
  }, 1250);
  cleanupFns.push(() => clearTimeout(revealTimeout));

  // Progress Bar updates
  const stages = [
    { pct: 32, label: 'Rolling into view...' },
    { pct: 68, label: 'Syncing travel intelligence...' },
    { pct: 88, label: 'Connecting routes & live weather...' },
    { pct: 100, label: 'Welcome to India in Time ✦' }
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
      progress += Math.floor(Math.random() * 8) + 6;
      if (progress >= target.pct) {
        progress = target.pct;
        if (pLbl) pLbl.textContent = target.label;
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
      }, 700);
    }
  }, 120);

  cleanupFns.push(() => clearInterval(progressInterval));
}

export function dismissSplash() {
  if (isDismissed) return;
  isDismissed = true;

  playWarpWhoosh();

  const splash = document.getElementById('splash');
  if (!splash) return;

  const login = document.getElementById('login-screen');
  if (login && !window.currentUser) {
    login.style.display = 'flex';
    login.style.opacity = '1';
  }

  splash.classList.add('splash-warp-exit');
  window.safeInvalidateMapSize?.(false);

  setTimeout(() => {
    splash.style.display = 'none';
    window.safeInvalidateMapSize?.(false);

    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    stopAmbientPad(0.1);
    for (const fn of cleanupFns) {
      try { fn(); } catch (_e) {}
    }
    cleanupFns = [];

    if (audioCtx) {
      try {
        if (audioCtx.state !== 'closed') {
          audioCtx.close().catch(() => {});
        }
      } catch (_e) {}
      audioCtx = null;
    }
  }, 650);
}
