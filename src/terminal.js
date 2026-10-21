import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

function makeId() {
  if (window.crypto?.randomUUID) return `term-${window.crypto.randomUUID()}`;
  return `term-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class TerminalManager {
  constructor({ container, getShell, getTheme, onExit, onContextMenu, onStatus, onData }) {
    this.container = container;
    this.getShell = getShell;
    this.getTheme = getTheme;
    this.onExit = onExit;
    this.onContextMenu = onContextMenu;
    this.onStatus = onStatus;
    this.onData = onData;
    this.id = null;
    this.started = false;
    this.disposed = false;
    this.resizeFrame = null;

    this.term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: "'Fira Code', 'JetBrains Mono', 'DejaVu Sans Mono', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 8000,
      allowTransparency: true,
      convertEol: false,
      macOptionIsMeta: true,
      rightClickSelectsWord: false,
      theme: getTheme(),
    });
    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(
      new WebLinksAddon((event, uri) => {
        event.preventDefault();
        window.kali.app.openExternal(uri);
      }),
    );
    this.term.open(container);

    this.term.onData((data) => {
      if (this.id) window.kali.terminal.write(this.id, data);
    });
    this.term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        this.copySelection();
        return false;
      }
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyV') {
        this.paste();
        return false;
      }
      if (event.ctrlKey && event.code === 'Backquote') return false;
      return true;
    });

    container.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.onContextMenu?.(event, this);
    });

    this.dataDisposable = window.kali.terminal.onData(({ id, data }) => {
      if (id !== this.id) return;
      this.term.write(data);
      this.onData?.(data);
    });
    this.exitDisposable = window.kali.terminal.onExit(({ id, code }) => {
      if (id !== this.id) return;
      this.id = null;
      this.started = false;
      this.term.write(`\r\n\x1b[38;5;244m[Process exited with code ${code}]\x1b[0m\r\n`);
      this.onStatus?.('exited');
      this.onExit?.(code);
    });

    this.resizeObserver = new ResizeObserver(() => this.scheduleFit());
    this.resizeObserver.observe(container);
  }

  async start(cwd) {
    if (this.id) return this.id;
    this.term.reset();
    this.term.write('\x1b[38;5;141mKaliCode terminal\x1b[0m\r\n');
    this.id = makeId();
    this.started = true;
    this.onStatus?.('starting');
    try {
      await window.kali.terminal.start(this.id, cwd, this.getShell());
      this.onStatus?.('running');
      setTimeout(() => {
        this.fit();
        this.focus();
      }, 50);
      return this.id;
    } catch (error) {
      this.id = null;
      this.started = false;
      this.term.write(`\r\n\x1b[31mUnable to start shell: ${error.message}\x1b[0m\r\n`);
      this.onStatus?.('error');
      this.onExit?.(-1);
      return null;
    }
  }

  async reset(cwd) {
    if (this.id) {
      window.kali.terminal.kill(this.id);
      this.id = null;
    }
    this.started = false;
    this.term.reset();
    return this.start(cwd);
  }

  write(data) {
    if (this.id) window.kali.terminal.write(this.id, data);
  }

  run(command) {
    this.write(`${command}\r\n`);
    this.focus();
  }

  async copySelection() {
    const selection = this.term.getSelection();
    if (selection) window.kali.app.writeClipboard(selection);
  }

  async paste() {
    try {
      const text = await window.kali.app.readClipboard();
      if (text) this.term.paste(text);
    } catch {
      // Clipboard may be unavailable.
    }
  }

  clear() {
    this.term.clear();
    this.focus();
  }

  kill() {
    if (!this.id) {
      this.term.write('\r\n\x1b[38;5;244m[No running shell]\x1b[0m\r\n');
      return;
    }
    window.kali.terminal.kill(this.id);
    this.id = null;
    this.started = false;
    this.term.write('\r\n\x1b[38;5;244m[Terminal closed]\x1b[0m\r\n');
    this.onStatus?.('exited');
  }

  focus() {
    this.term.focus();
  }

  fit() {
    if (!this.container.offsetParent) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width < 20 || height < 20) return;
    try {
      this.fitAddon.fit();
      if (this.id) window.kali.terminal.resize(this.id, this.term.cols, this.term.rows);
    } catch {
      // Fit can fail while the panel is animating.
    }
  }

  scheduleFit() {
    if (this.resizeFrame) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.fit();
    });
  }

  setTheme(theme) {
    this.term.options.theme = theme;
  }

  setFont(fontSize) {
    this.term.options.fontSize = fontSize;
    this.scheduleFit();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.id) window.kali.terminal.kill(this.id);
    this.id = null;
    this.resizeObserver?.disconnect();
    this.dataDisposable?.();
    this.exitDisposable?.();
    this.term.dispose();
  }
}
