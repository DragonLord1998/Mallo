import { App } from './app.js';

document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('gpu-canvas');
  const turnIndicator = document.getElementById('turn-indicator');
  const statusIndicator = document.getElementById('check-indicator');
  const moveHistory = document.getElementById('move-history');
  const resetBtn = document.getElementById('reset-btn');
  const pathToggle = document.getElementById('path-toggle');
  const engineIndicator = document.getElementById('engine-indicator');
  const loadingOverlay = document.getElementById('loading-overlay');

  let fallbackMessage = '';
  let activeMessage = '';
  let pathEnabled = false;

  const updateStatusMessage = () => {
    const message = activeMessage || fallbackMessage;
    statusIndicator.textContent = message;
    statusIndicator.classList.toggle('visible', Boolean(message));
  };

  if (!navigator.gpu) {
    loadingOverlay.classList.add('hidden');
    turnIndicator.textContent = 'WebGPU is not supported in this browser.';
    statusIndicator.textContent = 'Use a WebGPU-enabled browser to explore the 3D board.';
    statusIndicator.classList.add('visible');
    pathToggle.disabled = true;
    resetBtn.disabled = true;
    return;
  }

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

  resetBtn.addEventListener('click', () => {
    app.reset();
  });

  pathToggle.addEventListener('click', () => {
    app.setPathTracingEnabled(!pathEnabled);
  });

  try {
    await app.initialize();
  } catch (error) {
    console.error('Failed to initialize application', error);
    activeMessage = 'Initialization failed. Please reload the page.';
    updateStatusMessage();
    loadingOverlay.classList.add('hidden');
    return;
  }

  loadingOverlay.classList.add('hidden');
  app.start();
});
