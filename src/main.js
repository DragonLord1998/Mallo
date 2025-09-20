import { App } from './apps/chess/app.js';

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const num = parseInt(value, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
};

const palettes = {
  all: ['#5ec8ff', '#9656ff', '#1f6dff'],
  realtime: ['#41f5ff', '#4bffd8', '#1aa4ff'],
  games: ['#ff5fb5', '#6d4bff', '#ff9f4d'],
  tools: ['#ffd86b', '#5ad1ff', '#ff8d66'],
};

class NebulaBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.active = Boolean(this.ctx);

    if (!this.active) {
      console.warn('Nebula background disabled: 2D context unavailable.');
      return;
    }
    this.stepColors = [];
    this.targetColors = [];
    this.particles = [];
    this.lastTime = performance.now();
    this.velocity = 0;
    this.velocityTarget = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.targetOffsetX = 0;
    this.targetOffsetY = 0;
    this.center = { x: 0, y: 0 };
    this.baseFade = 0.12;

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.render = this.render.bind(this);

    this.configureCanvas();
    this.spawnParticles();

    window.addEventListener('resize', () => {
      if (!this.active) return;
      this.configureCanvas();
      this.spawnParticles();
    });

    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerdown', this.handlePointerMove);
    window.addEventListener('pointerleave', this.handlePointerLeave);
    window.addEventListener('blur', this.handlePointerLeave);

    requestAnimationFrame(this.render);
  }

  configureCanvas() {
    if (!this.active) return;
    const { innerWidth, innerHeight, devicePixelRatio } = window;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = `${innerWidth}px`;
    this.canvas.style.height = `${innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawWidth = innerWidth;
    this.drawHeight = innerHeight;
    this.center.x = innerWidth / 2;
    this.center.y = innerHeight / 2;
  }

  spawnParticles() {
    if (!this.active) return;
    const { drawWidth = window.innerWidth, drawHeight = window.innerHeight } = this;
    const maxRadius = Math.hypot(drawWidth, drawHeight) * 0.55;
    const count = 110;
    const paletteSize = Math.max(this.stepColors.length, this.targetColors.length, 1);
    this.particles = Array.from({ length: count }, (_, index) => {
      const baseRadius = Math.random() * 0.65 * maxRadius + 80;
      return {
        angle: Math.random() * Math.PI * 2,
        baseRadius,
        wobble: Math.random() * 0.25 + 0.1,
        wobbleSpeed: Math.random() * 0.6 + 0.2,
        orbitSpeed: Math.random() * 0.45 + 0.12,
        size: Math.random() * 220 + 120,
        depth: Math.random() * 0.6 + 0.4,
        noiseOffset: Math.random() * Math.PI * 2,
        colorSlot: Math.floor(Math.random() * paletteSize),
      };
    });
  }

  setPalette(key) {
    const definition = palettes[key] ?? palettes.all;
    this.targetColors = definition.map((hex) => ({ ...hexToRgb(hex) }));

    if (this.stepColors.length !== this.targetColors.length) {
      this.stepColors = this.targetColors.map((color) => ({ ...color }));
      this.spawnParticles();
    }
  }

  handlePointerMove(event) {
    if (!this.active) return;
    const now = performance.now();
    if (this.lastPointerTime) {
      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const dt = Math.max(now - this.lastPointerTime, 8);
      const rawVelocity = distance / dt;
      this.velocityTarget = Math.min(rawVelocity * 0.5, 3.5);
    }

    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.lastPointerTime = now;

    if (this.canvas.clientWidth && this.canvas.clientHeight) {
      const nx = event.clientX / this.canvas.clientWidth - 0.5;
      const ny = event.clientY / this.canvas.clientHeight - 0.5;
      this.targetOffsetX = nx * 180;
      this.targetOffsetY = ny * 140;
    }
  }

  handlePointerLeave() {
    if (!this.active) return;
    this.velocityTarget = 0;
    this.targetOffsetX = 0;
    this.targetOffsetY = 0;
    this.lastPointerTime = undefined;
  }

  lerpColor(current, target, factor) {
    current.r += (target.r - current.r) * factor;
    current.g += (target.g - current.g) * factor;
    current.b += (target.b - current.b) * factor;
  }

  render(now) {
    if (!this.active) {
      return;
    }
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.velocityTarget *= 0.96;
    if (this.velocityTarget < 0.001) {
      this.velocityTarget = 0;
    }

    this.velocity += (this.velocityTarget - this.velocity) * 0.06;
    this.offsetX += (this.targetOffsetX - this.offsetX) * 0.04;
    this.offsetY += (this.targetOffsetY - this.offsetY) * 0.04;

    const fade = Math.min(this.baseFade + this.velocity * 0.05, 0.22);
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = `rgba(6, 9, 18, ${fade})`;
    this.ctx.fillRect(0, 0, this.drawWidth, this.drawHeight);

    const easing = 1 - Math.pow(1 - dt * 6, 3);
    for (let i = 0; i < this.stepColors.length; i += 1) {
      const target = this.targetColors[i];
      if (target) {
        this.lerpColor(this.stepColors[i], target, easing);
      }
    }

    const speedScale = 0.2 + this.velocity * 1.2;
    const swirl = now * 0.00004;

    this.ctx.globalCompositeOperation = 'lighter';
    this.particles.forEach((particle) => {
      particle.angle += particle.orbitSpeed * speedScale * dt;
      particle.noiseOffset += particle.wobbleSpeed * dt;

      const wobble = 1 + Math.sin(particle.noiseOffset + swirl) * particle.wobble;
      const radius = particle.baseRadius * wobble;
      const x = this.center.x + this.offsetX + Math.cos(particle.angle + swirl) * radius * particle.depth;
      const y = this.center.y + this.offsetY + Math.sin(particle.angle + swirl) * radius;

      const colorIndex = particle.colorSlot % Math.max(this.stepColors.length, 1);
      const color = this.stepColors[colorIndex] ?? this.targetColors[colorIndex] ?? { r: 100, g: 140, b: 255 };
      const alpha = 0.18 + particle.depth * 0.35;

      const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, particle.size);
      gradient.addColorStop(0, `rgba(${color.r.toFixed(0)}, ${color.g.toFixed(0)}, ${color.b.toFixed(0)}, ${alpha})`);
      gradient.addColorStop(1, 'rgba(10, 12, 24, 0)');

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(x, y, particle.size, 0, Math.PI * 2);
      this.ctx.fill();
    });

    requestAnimationFrame(this.render);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const nebulaCanvas = document.getElementById('nebula-canvas');
  const canvas = document.getElementById('gpu-canvas');
  const uiOverlay = document.querySelector('.ui-overlay');
  const launcher = document.getElementById('app-launcher');
  const loadingOverlay = document.getElementById('loading-overlay');
  const turnIndicator = document.getElementById('turn-indicator');
  const statusIndicator = document.getElementById('check-indicator');
  const moveHistory = document.getElementById('move-history');
  const moveLog = document.querySelector('.move-log');
  const moveLogToggle = document.getElementById('move-log-toggle');
  const resetBtn = document.getElementById('reset-btn');
  const pathToggle = document.getElementById('path-toggle');
  const engineIndicator = document.getElementById('engine-indicator');
  const filterButtons = Array.from(document.querySelectorAll('.filter-button'));
  const filterables = Array.from(document.querySelectorAll('.launcher-grid [data-categories]'));
  const appCards = Array.from(document.querySelectorAll('.launcher-card[data-app]'));
  const nebula = nebulaCanvas ? new NebulaBackground(nebulaCanvas) : null;

  let appInstance = null;
  let initializing = false;
  let fallbackMessage = '';
  let activeMessage = '';
  let pathEnabled = false;
  let activeLauncherCard = null;
  const moveLogMedia = window.matchMedia('(max-width: 768px)');
  let moveLogCollapsed = moveLogMedia.matches;
  let lastHistoryCount = 0;

  const updateStatusMessage = () => {
    const message = activeMessage || fallbackMessage;
    statusIndicator.textContent = message;
    statusIndicator.classList.toggle('visible', Boolean(message));
  };

  const applyMoveLogState = () => {
    if (moveLog) {
      const hidden = moveLogCollapsed && moveLogMedia.matches;
      moveLog.classList.toggle('is-hidden', hidden);
      moveLog.setAttribute('aria-hidden', hidden ? 'true' : 'false');
      if (!moveLogMedia.matches) {
        moveLog.classList.remove('is-hidden');
        moveLog.setAttribute('aria-hidden', 'false');
      }
    }
    if (moveLogToggle) {
      moveLogToggle.setAttribute('aria-expanded', (!moveLogCollapsed || !moveLogMedia.matches).toString());
      moveLogToggle.classList.toggle('is-active', !moveLogCollapsed || !moveLogMedia.matches);
      moveLogToggle.classList.toggle('is-hidden', !moveLogMedia.matches);
      if (!moveLogCollapsed || !moveLogMedia.matches) {
        moveLogToggle.classList.remove('has-updates');
      }
    }
  };

  const setFilter = (value) => {
    filterButtons.forEach((button) => {
      const isActive = button.dataset.filter === value;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    filterables.forEach((item) => {
      const categories = (item.dataset.categories || '').split(/\s+/).filter(Boolean);
      const matches = value === 'all' || categories.includes(value);
      item.classList.toggle('is-filtered', !matches);
      item.setAttribute('aria-hidden', matches ? 'false' : 'true');
      if (item instanceof HTMLButtonElement) {
        item.tabIndex = matches ? 0 : -1;
      }
    });

    nebula?.setPalette(value);
  };

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      setFilter(button.dataset.filter ?? 'all');
    });
  });

  const handleMoveLogMediaChange = (event) => {
    if (!event.matches) {
      moveLogCollapsed = false;
      moveLogToggle?.classList.remove('has-updates');
    }
    applyMoveLogState();
  };

  if (typeof moveLogMedia.addEventListener === 'function') {
    moveLogMedia.addEventListener('change', handleMoveLogMediaChange);
  } else if (typeof moveLogMedia.addListener === 'function') {
    moveLogMedia.addListener(handleMoveLogMediaChange);
  }

  moveLogToggle?.addEventListener('click', () => {
    moveLogCollapsed = !moveLogCollapsed;
    if (!moveLogCollapsed) {
      moveLogToggle.classList.remove('has-updates');
    }
    applyMoveLogState();
  });

  if (nebula) {
    nebula.setPalette('all');
  }

  setFilter('all');
  applyMoveLogState();

  const revealChessShell = () => {
    launcher?.classList.add('is-hidden');
    launcher?.setAttribute('aria-hidden', 'true');
    canvas.classList.remove('is-hidden');
    uiOverlay.classList.remove('is-hidden');
    loadingOverlay.classList.remove('is-hidden');
    loadingOverlay.classList.remove('hidden');
  };

  const initializeChess = async (card) => {
    if (appInstance || initializing) {
      return;
    }

    initializing = true;
    activeLauncherCard?.classList.remove('is-active');
    activeLauncherCard = card;
    card.disabled = true;
    revealChessShell();

    fallbackMessage = '';
    activeMessage = '';
    updateStatusMessage();

    if (!navigator.gpu) {
      loadingOverlay.classList.add('hidden');
      turnIndicator.textContent = 'WebGPU is not supported in this browser.';
      statusIndicator.textContent = 'Use a WebGPU-enabled browser to explore the 3D board.';
      statusIndicator.classList.add('visible');
      pathToggle.disabled = true;
      resetBtn.disabled = true;
      canvas.classList.add('is-hidden');
      uiOverlay.classList.add('is-hidden');
      loadingOverlay.classList.add('is-hidden');
      card.disabled = false;
      launcher?.classList.remove('is-hidden');
      launcher?.setAttribute('aria-hidden', 'false');
      initializing = false;
      return;
    }

    lastHistoryCount = 0;

    const app = new App({
      canvas,
      onStateChange: (state) => {
        turnIndicator.textContent = state.turnLabel;
        fallbackMessage = state.checkLabel ?? '';
        updateStatusMessage();

        moveHistory.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const recentMoves = state.history.slice(-24);
        recentMoves.forEach((entry) => {
          const li = document.createElement('li');
          li.textContent = entry;
          fragment.appendChild(li);
        });
        moveHistory.appendChild(fragment);
        moveHistory.scrollTop = moveHistory.scrollHeight;

        const historyCount = state.history.length;
        if (moveLogToggle && moveLogMedia.matches) {
          const hasUpdates = moveLogCollapsed && historyCount > lastHistoryCount;
          moveLogToggle.classList.toggle('has-updates', hasUpdates);
        }
        lastHistoryCount = historyCount;

        pathEnabled = Boolean(state.usePathTracer);
        pathToggle.textContent = pathEnabled ? 'Disable Path Tracing' : 'Enable Path Tracing';
        pathToggle.setAttribute('aria-pressed', pathEnabled ? 'true' : 'false');
        pathToggle.classList.toggle('active', pathEnabled);

        const thinking = Boolean(state.engineThinking);
        engineIndicator.classList.toggle('visible', thinking);
        engineIndicator.setAttribute('aria-hidden', thinking ? 'false' : 'true');
      },
      onMessage: (message) => {
        activeMessage = message ?? '';
        updateStatusMessage();
      },
    });

    appInstance = app;

    try {
      await app.initialize();
    } catch (error) {
      console.error('Failed to initialize application', error);
      activeMessage = 'Initialization failed. Please reload the page.';
      updateStatusMessage();
      loadingOverlay.classList.add('hidden');
      canvas.classList.add('is-hidden');
      uiOverlay.classList.add('is-hidden');
      loadingOverlay.classList.add('is-hidden');
      appInstance = null;
      initializing = false;
      card.disabled = false;
      activeLauncherCard = null;
      launcher?.classList.remove('is-hidden');
      launcher?.setAttribute('aria-hidden', 'false');
      return;
    }

    resetBtn.disabled = false;
    pathToggle.disabled = false;

    loadingOverlay.classList.add('hidden');
    app.start();
    card.classList.add('is-active');
    initializing = false;
  };

  resetBtn.addEventListener('click', () => {
    appInstance?.reset();
  });

  pathToggle.addEventListener('click', () => {
    if (!appInstance) return;
    appInstance.setPathTracingEnabled(!pathEnabled);
  });

  const appLaunchers = {
    chess: initializeChess,
  };

  appCards.forEach((card) => {
    card.addEventListener('click', () => {
      const appId = card.dataset.app;
      const handler = appLaunchers[appId];
      if (!handler) return;
      void handler(card);
    });
  });
});
