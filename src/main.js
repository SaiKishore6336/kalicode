import '@vscode/codicons/dist/codicon.css';
import './styles.css';
import { KaliCodeApp } from './app.js';

function showFatalError(error) {
  console.error('[KaliCode] Failed to start', error);
  const detail = error?.stack || error?.message || String(error);
  const root = document.getElementById('app') || document.body;
  root.innerHTML = `
    <div class="fatal-screen">
      <div class="fatal-card">
        <div class="fatal-mark">!</div>
        <div>
          <h1>KaliCode could not start</h1>
          <p>The renderer hit an error while loading the workspace.</p>
          <pre class="fatal-detail"></pre>
          <button class="btn btn-primary" id="fatal-reload">Reload Window</button>
        </div>
      </div>
    </div>`;
  const pre = root.querySelector('.fatal-detail');
  if (pre) pre.textContent = detail;
  root.querySelector('#fatal-reload')?.addEventListener('click', () => window.location.reload());
}

async function bootstrap() {
  if (!window.kali) {
    showFatalError(
      new Error(
        'The Electron preload bridge is unavailable. Launch the desktop app with "corepack npm start" instead of opening the Vite page directly.',
      ),
    );
    return;
  }
  const app = new KaliCodeApp();
  window.kaliCode = app;
  try {
    await app.init();
  } catch (error) {
    showFatalError(error);
  }
}

bootstrap();
