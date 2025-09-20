import { App } from './app.js';

document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('gpu-canvas');
  const turnIndicator = document.getElementById('turn-indicator');
  const checkIndicator = document.getElementById('check-indicator');
  const moveHistory = document.getElementById('move-history');
  const resetBtn = document.getElementById('reset-btn');

  if (!navigator.gpu) {
    turnIndicator.textContent = 'WebGPU is not supported in this browser';
    turnIndicator.classList.add('error');
    return;
  }

  const app = new App({
    canvas,
    onStateChange: (state) => {
      turnIndicator.textContent = state.turnLabel;
      checkIndicator.textContent = state.checkLabel ?? '';
      checkIndicator.classList.toggle('visible', Boolean(state.checkLabel));
      moveHistory.innerHTML = '';
      state.history.forEach((entry) => {
        const li = document.createElement('li');
        li.textContent = entry;
        moveHistory.appendChild(li);
      });
    },
    onMessage: (message) => {
      checkIndicator.textContent = message ?? '';
      checkIndicator.classList.toggle('visible', Boolean(message));
    },
  });

  resetBtn.addEventListener('click', () => {
    app.reset();
  });

  await app.initialize();
  app.start();
});
