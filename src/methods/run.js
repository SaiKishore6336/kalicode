import { monaco, THEMES } from '../monaco.js';
import { TerminalManager } from '../terminal.js';
import { escapeHtml, icon } from '../ui.js';
import { pathBase, pathDir } from '../util.js';
import { MAX_OUTPUT_LINES } from '../constants.js';

export const runMethods = {
  bindRunEvents() {
    this.el.btnRun.addEventListener('click', () => this.runActiveFile());
    this.el.btnRunTerminal.addEventListener('click', () => this.runActiveFile());
    this.el.runRefresh.addEventListener('click', () => this.loadProjectTasks());
    this.el.runTasks.addEventListener('click', (event) => {
      const card = event.target.closest('[data-task-index]');
      if (!card) return;
      this.runTask(Number(card.dataset.taskIndex));
    });
    this.el.termNew.addEventListener('click', () => this.newTerminal());
    this.el.termClear.addEventListener('click', () => this.clearTerminal());
    this.el.termKill.addEventListener('click', () => this.killTerminal());
    this.el.problemsList.addEventListener('click', (event) => {
      const row = event.target.closest('.problem-row');
      if (!row) return;
      this.openFile(row.dataset.file, {
        line: Number(row.dataset.line),
        column: Number(row.dataset.column),
      }).then((tab) => {
        if (tab) this.revealLine(Number(row.dataset.line), Number(row.dataset.column));
      });
    });
  },

  createTerminal() {
    if (this.terminalManager) return this.terminalManager;
    this.el.terminalPlaceholder.hidden = true;
    this.terminalManager = new TerminalManager({
      container: this.el.terminal,
      getShell: () => this.getShell(),
      getTheme: () => (THEMES[this.themeId] || THEMES.kali).terminal,
      onExit: (code) => {
        this.logOutput(`Terminal process exited with code ${code}.`, code === 0 ? 'info' : 'warning');
      },
      onContextMenu: (event, manager) => this.showTerminalContextMenu(event, manager),
    });
    this.terminalManager.setFont(this.settings.terminalFontSize);
    return this.terminalManager;
  },

  async ensureTerminal() {
    const manager = this.createTerminal();
    if (manager.id) return manager;
    if (!this.terminalStarting) {
      this.terminalStarting = manager
        .start(this.folder || this.appInfo.home || '.')
        .finally(() => {
          this.terminalStarting = null;
        });
    }
    await this.terminalStarting;
    return manager;
  },

  showTerminalContextMenu(event, manager) {
    this.ui.contextMenu(event.clientX, event.clientY, [
      {
        label: 'Copy',
        icon: 'copy',
        disabled: !manager.term.getSelection(),
        run: () => manager.copySelection(),
      },
      { label: 'Paste', icon: 'clippy', run: () => manager.paste() },
      { separator: true },
      { label: 'Clear', icon: 'clear-all', run: () => manager.clear() },
      { label: 'New Terminal', icon: 'add', run: () => this.newTerminal() },
      { label: 'Kill Terminal', icon: 'trash', danger: true, run: () => this.killTerminal() },
    ]);
  },

  async newTerminal() {
    this.showPanel('terminal');
    const manager = this.createTerminal();
    await manager.reset(this.folder || this.appInfo.home || '.');
    this.logOutput('Started a new terminal session.', 'info');
  },

  clearTerminal() {
    if (this.terminalManager) this.terminalManager.clear();
  },

  killTerminal() {
    if (this.terminalManager) this.terminalManager.kill();
  },

  shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
  },

  async runInTerminal(command) {
    if (!command) return;
    this.showPanel('terminal');
    const manager = await this.ensureTerminal();
    if (!manager || !manager.id) {
      this.ui.toast('The terminal is not available.', 'error');
      return;
    }
    this.lastRunCommand = command;
    manager.run(command);
    this.logOutput(`$ ${command}`, 'command');
  },

  buildRunCommand(tab) {
    if (!tab?.path) return null;
    const file = tab.path;
    const quoted = this.shellQuote(file);
    const language = tab.language || 'plaintext';
    const extension = pathBase(file).split('.').pop().toLowerCase();
    const base = pathBase(file).replace(/\.[^.]+$/, '');
    const tempRoot = this.appInfo.tempDir || '.';
    const buildDir = `${tempRoot}/kalicode-${base.replace(/[^a-zA-Z0-9_-]/g, '_') || 'build'}`;
    if (language === 'python') return `python3 ${quoted}`;
    if (language === 'javascript') return `node ${quoted}`;
    if (language === 'typescript') return `node --experimental-strip-types ${quoted}`;
    if (language === 'shell') return `bash ${quoted}`;
    if (language === 'ruby') return `ruby ${quoted}`;
    if (language === 'php') return `php ${quoted}`;
    if (language === 'go') return `go run ${quoted}`;
    if (language === 'lua') return `lua ${quoted}`;
    if (language === 'r') return `Rscript ${quoted}`;
    if (language === 'perl') return `perl ${quoted}`;
    if (language === 'c') {
      return `gcc ${quoted} -O2 -Wall -o ${this.shellQuote(buildDir)} && ${this.shellQuote(buildDir)}`;
    }
    if (language === 'cpp') {
      return `g++ -std=c++17 ${quoted} -O2 -Wall -o ${this.shellQuote(buildDir)} && ${this.shellQuote(buildDir)}`;
    }
    if (language === 'rust') {
      return `rustc ${quoted} -O -o ${this.shellQuote(buildDir)} && ${this.shellQuote(buildDir)}`;
    }
    if (language === 'java') {
      return `cd ${this.shellQuote(pathDir(file))} && javac ${this.shellQuote(
        pathBase(file),
      )} && java ${this.shellQuote(base)}`;
    }
    if (language === 'kotlin') return `kotlinc -script ${quoted}`;
    if (language === 'swift') return `swift ${quoted}`;
    if (language === 'csharp') return `dotnet run --project ${this.shellQuote(pathDir(file))}`;
    if (language === 'json') return `python3 -m json.tool ${quoted}`;
    if (['html', 'xml', 'markdown', 'svg'].includes(language) || ['html', 'htm', 'md', 'svg'].includes(extension)) {
      return `xdg-open ${quoted}`;
    }
    return `xdg-open ${quoted}`;
  },

  async runActiveFile() {
    const tab = this.currentTab();
    if (!tab) {
      this.ui.toast('Open a file to run.', 'warning');
      return;
    }
    if (tab.dirty || !tab.path) {
      const saved = await this.saveTab(tab);
      if (!saved) return;
    }
    const command = this.buildRunCommand(tab);
    if (!command) {
      this.ui.toast('No run command is available for this file.', 'warning');
      return;
    }
    const directory = this.folder || pathDir(tab.path);
    const full = `cd ${this.shellQuote(directory)} && ${command}`;
    await this.runInTerminal(full);
  },

  async runLastCommand() {
    if (!this.lastRunCommand) {
      this.ui.toast('No command has been run yet.', 'info');
      return;
    }
    await this.runInTerminal(this.lastRunCommand);
  },

  async runTask(index) {
    const task = this.tasks[index];
    if (!task) return;
    const directory = this.folder || this.appInfo.home;
    const command = `cd ${this.shellQuote(directory)} && ${task.command}`;
    this.logOutput(`Running task: ${task.label}`, 'info');
    await this.runInTerminal(command);
  },

  async loadProjectTasks() {
    this.tasks = [];
    if (!this.folder) {
      this.updateRunPanel();
      return;
    }
    const read = async (name) => {
      try {
        const target = `${this.folder}/${name}`;
        if (!(await window.kali.fs.exists(target))) return null;
        const data = await window.kali.fs.readFile(target);
        return data.content;
      } catch {
        return null;
      }
    };
    const exists = async (name) => window.kali.fs.exists(`${this.folder}/${name}`);
    const [packageText, makefileText, pyproject, pytestIni, setupCfg, managePy, compose] =
      await Promise.all([
        read('package.json'),
        read('Makefile'),
        exists('pyproject.toml'),
        exists('pytest.ini'),
        exists('setup.cfg'),
        exists('manage.py'),
        Promise.any([exists('docker-compose.yml'), exists('compose.yaml'), exists('compose.yml')]).catch(
          () => false,
        ),
      ]);
    if (packageText) {
      try {
        const pkg = JSON.parse(packageText);
        for (const [name, value] of Object.entries(pkg.scripts || {}).slice(0, 10)) {
          this.tasks.push({
            label: `npm run ${name}`,
            detail: String(value),
            command: `npm run ${name}`,
            kind: 'npm',
          });
        }
      } catch (error) {
        this.logOutput(`package.json: ${error.message}`, 'warning');
      }
    }
    if (makefileText) {
      const seen = new Set();
      for (const match of makefileText.matchAll(/^([A-Za-z0-9_][A-Za-z0-9_.-]*):(?!=)/gm)) {
        const target = match[1];
        if (seen.has(target) || target.length > 40) continue;
        seen.add(target);
        this.tasks.push({
          label: `make ${target}`,
          detail: 'Makefile target',
          command: `make ${target}`,
          kind: 'make',
        });
        if (seen.size >= 8) break;
      }
    }
    if (pyproject || pytestIni || setupCfg) {
      this.tasks.push({
        label: 'Run pytest',
        detail: 'python3 -m pytest',
        command: 'python3 -m pytest',
        kind: 'test',
      });
    }
    if (managePy) {
      this.tasks.push({
        label: 'Run Django server',
        detail: 'python3 manage.py runserver',
        command: 'python3 manage.py runserver',
        kind: 'django',
      });
    }
    if (compose) {
      this.tasks.push({
        label: 'Docker Compose Up',
        detail: 'docker compose up',
        command: 'docker compose up',
        kind: 'docker',
      });
    }
    this.renderRunTasks();
    this.updateRunPanel();
  },

  renderRunTasks() {
    if (!this.tasks.length) {
      this.el.runTasks.innerHTML = `<div class="muted small">${
        this.folder ? 'No workspace tasks detected.' : 'Open a workspace to detect tasks.'
      }</div>`;
      return;
    }
    this.el.runTasks.innerHTML = this.tasks
      .map(
        (task, index) => `<button class="run-task" data-task-index="${index}" title="${escapeHtml(task.command)}">
          <span class="run-task-icon">${icon('play')}</span>
          <span class="run-task-main">
            <span class="run-task-label">${escapeHtml(task.label)}</span>
            <span class="run-task-detail">${escapeHtml(task.detail)}</span>
          </span>
        </button>`,
      )
      .join('');
  },

  updateRunPanel() {
    const tab = this.currentTab();
    const hasContent = Boolean(this.folder || tab);
    this.el.runContent.hidden = !hasContent;
    this.el.runEmpty.hidden = hasContent;
    this.el.runActiveFile.textContent = tab ? tab.path || tab.name : 'No file open';
    const command = tab ? this.buildRunCommand(tab) : null;
    this.el.runCommandPreview.textContent = command || 'Open a source file to create a run command.';
    this.el.runCommandPreview.title = command || '';
    this.el.btnRun.disabled = !command;
    this.el.btnRunTerminal.disabled = !command;
    this.renderRunTasks();
  },

  logOutput(message, level = 'info') {
    const text = String(message ?? '');
    const stamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const prefix =
      level === 'error' ? 'ERROR' : level === 'warning' ? 'WARN' : level === 'command' ? '$' : 'INFO';
    this.outputLines.push(`[${stamp}] ${prefix.padEnd(5)} ${text}`);
    if (this.outputLines.length > MAX_OUTPUT_LINES) {
      this.outputLines.splice(0, this.outputLines.length - MAX_OUTPUT_LINES);
    }
    if (this.el.output) {
      this.el.output.textContent = this.outputLines.join('\n');
      this.el.output.scrollTop = this.el.output.scrollHeight;
    }
  },

  clearOutput() {
    this.outputLines = [];
    if (this.el.output) this.el.output.textContent = '';
  },

  async runLint(tab) {
    if (!tab?.path) return;
    if (!['python', 'shell'].includes(tab.language)) return;
    try {
      const result = await window.kali.lint.run(tab.path, tab.language);
      const markers = (result.problems || []).map((problem) => ({
        severity: monaco.MarkerSeverity.Error,
        message: problem.message,
        source: problem.source || 'kalicode',
        startLineNumber: Math.max(1, Number(problem.line) || 1),
        startColumn: Math.max(1, Number(problem.column) || 1),
        endLineNumber: Math.max(1, Number(problem.line) || 1),
        endColumn: Math.max(2, (Number(problem.column) || 1) + 1),
      }));
      monaco.editor.setModelMarkers(tab.model, 'kalicode', markers);
      this.refreshProblemsFromMarkers();
    } catch (error) {
      this.logOutput(`Lint failed for ${tab.name}: ${error.message}`, 'warning');
    }
  },

  refreshProblemsFromMarkers() {
    const problems = [];
    const markers = monaco.editor.getModelMarkers({});
    for (const marker of markers) {
      if (marker.severity !== monaco.MarkerSeverity.Error && marker.severity !== monaco.MarkerSeverity.Warning) {
        continue;
      }
      const tab = this.tabs.find((item) => item.model.uri.toString() === marker.resource.toString());
      if (!tab?.path) continue;
      problems.push({
        path: tab.path,
        file: tab.name,
        line: marker.startLineNumber || 1,
        column: marker.startColumn || 1,
        message: marker.message,
        severity: marker.severity,
        source: marker.source || 'editor',
      });
    }
    problems.sort(
      (a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column,
    );
    this.markerProblems = problems;
    this.renderProblems();
    this.updateStatus();
  },

  renderProblems() {
    const problems = this.markerProblems || [];
    if (!problems.length) {
      this.el.problemsList.innerHTML = `<div class="empty-state compact">
        <i class="codicon codicon-pass empty-icon"></i>
        <p>No problems have been detected in the workspace.</p>
        <span class="muted small">Syntax checks run on save. TypeScript, JavaScript, JSON, CSS, and HTML diagnostics update as you type.</span>
      </div>`;
      return;
    }
    const groups = new Map();
    for (const problem of problems) {
      if (!groups.has(problem.path)) groups.set(problem.path, []);
      groups.get(problem.path).push(problem);
    }
    this.el.problemsList.innerHTML = [...groups.entries()]
      .map(
        ([path, items]) => `<div class="problem-group">
          <div class="problem-file-header">${icon('file')}<span>${escapeHtml(pathBase(path))}</span><span class="problem-file-dir">${escapeHtml(
            pathDir(path),
          )}</span><span class="problem-file-count">${items.length}</span></div>
          ${items
            .map(
              (problem) => `<button class="problem-row" data-file="${escapeHtml(
                problem.path,
              )}" data-line="${problem.line}" data-column="${problem.column}">
                ${icon(problem.severity === 8 ? 'error' : 'warning', problem.severity === 8 ? 'problem-error' : 'problem-warning')}
                <span class="problem-message">${escapeHtml(problem.message)}</span>
                <span class="problem-source">${escapeHtml(problem.source)}</span>
                <span class="problem-position">Ln ${problem.line}, Col ${problem.column}</span>
              </button>`,
            )
            .join('')}
        </div>`,
      )
      .join('');
  },
};
