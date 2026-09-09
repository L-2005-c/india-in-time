/**
 * splash3d.js — High-Performance 3D Intro & Telemetry Engine for India In-Time
 * 
 * Provides an interactive 3D astrolabe experience with:
 * - 3D geodesic constellation node field on Canvas
 * - Real-time mouse and gyroscope parallax tilt
 * - Synchronized travel telemetry progress ticker
 * - Cinematic hyperspace warp exit
 * - Full memory/RAF cleanup upon exit
 */

let animId = null;
let cleanupFns = [];
let isDismissed = false;

export function initSplash3D(onComplete) {
  isDismissed = false;
  const splash = document.getElementById('splash');
  if (!splash) return;

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

    const cx = width / 2;
    const cy = height / 2 - 25;
    const fov = 460;

    const projected = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      p.pulse += 0.035;

      // Rotate around Y axis
      const x1 = p.x * Math.cos(rotY) - p.z * Math.sin(rotY);
      const z1 = p.x * Math.sin(rotY) + p.z * Math.cos(rotY);

      // Rotate around X axis
      const y2 = p.y * Math.cos(rotX) - z1 * Math.sin(rotX);
      const z2 = p.y * Math.sin(rotX) + z1 * Math.cos(rotX);

      const scale = fov / (fov + z2 + 340);
      const px = cx + x1 * scale;
      const py = cy + y2 * scale;
      const alpha = Math.max(0.08, Math.min(0.9, (scale - 0.4) * 1.5));

      projected.push({ px, py, scale, alpha, color: p.color, size: p.size, pulse: p.pulse });
    }

    // Geodesic route constellation lines
    ctx.lineWidth = 0.6;
    for (let i = 0; i < projected.length; i++) {
      for (let j = i + 1; j < projected.length; j++) {
        const dx = projected[i].px - projected[j].px;
        const dy = projected[i].py - projected[j].py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 80) {
          const lineAlpha = (1 - dist / 80) * 0.16 * Math.min(projected[i].alpha, projected[j].alpha);
          ctx.strokeStyle = `rgba(16, 185, 129, ${lineAlpha})`;
          ctx.beginPath();
          ctx.moveTo(projected[i].px, projected[i].py);
          ctx.lineTo(projected[j].px, projected[j].py);
          ctx.stroke();
        }
      }
    }

    // Node particles
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
    for (const fn of cleanupFns) {
      try { fn(); } catch (_e) {}
    }
    cleanupFns = [];
  }, 750);
}
