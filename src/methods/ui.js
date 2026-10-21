import { monaco, THEMES } from '../monaco.js';
import { escapeHtml, icon } from '../ui.js';
import { byId, clamp, debounce, pathBase } from '../util.js';
import { DEFAULT_SETTINGS } from '../constants.js';

export const uiMethods = {
  bindEvents() {
    this.el.winMin.addEventListener('click', () => window.kali.win.minimize());
    this.el.winMax.addEventListener('click', () => window.kali.win.toggleMaximize());
    this.el.winClose.addEventListener('click', () => window.kali.win.close());

    this.el.titlebar.addEventListener('dblclick', (event) => {
      if (event.target.closest('.window-controls, .menubar, .command-center, .titlebar-brand')) return;
      window.kali.win.toggleMaximize();
    });

    for (const button of this.el.menuButtons) {
      button.addEventListener('click', () => this.showAppMenu(button.dataset.menu, button));
    }

    for (const button of this.el.activityButtons) {
      button.addEventListener('click', () => {
        this.setSidebarView(button.dataset.view, { toggle: true });
      });
    }
    byId('activity-settings').addEventListener('click', () => this.openSettings());
    byId('activity-theme').addEventListener('click', () => this.chooseTheme());

    this.el.commandCenter.addEventListener('click', () => this.quickOpen());
    this.el.brand.addEventListener('click', () => {
      if (!this.tabs.length) this.showWelcomePage();
    });

    this.el.workspaceOpen.addEventListener('click', () => this.chooseFolder());
    this.el.workspaceClose.addEventListener('click', () => this.closeFolder());
    this.el.workspaceToggle.addEventListener('click', () => {
      this.workspaceCollapsed = !this.workspaceCollapsed;
      this.el.tree.hidden = this.workspaceCollapsed;
      this.el.workspaceToggle.innerHTML = icon(
        this.workspaceCollapsed ? 'chevron-right' : 'chevron-down',
      );
    });
    this.el.explorerOpenFolder.addEventListener('click', () => this.chooseFolder());
    this.el.welcomeOpenFolder.addEventListener('click', () => this.chooseFolder());
    this.el.welcomeNewFile.addEventListener('click', () => this.newUntitled());
    this.el.explorerNewFile.addEventListener('click', () => this.newFileHere());
    this.el.explorerNewFolder.addEventListener('click', () => this.newFolderHere());
    this.el.explorerRefresh.addEventListener('click', () => this.refreshTree());
    this.el.explorerCollapse.addEventListener('click', () => {
      this.expanded.clear();
      this.renderTree();
    });

    this.el.recentFolders.addEventListener('click', (event) => {
      const item = event.target.closest('[data-recent-folder]');
      if (item) this.openPathFromUI(item.dataset.recentFolder);
    });
    this.el.recentFiles.addEventListener('click', (event) => {
      const item = event.target.closest('[data-recent-file]');
      if (item) this.openPathFromUI(item.dataset.recentFile);
    });

    this.el.statusBranch.addEventListener('click', () => this.setSidebarView('git'));
    this.el.statusProblems.addEventListener('click', () => this.showPanel('problems'));
    this.el.statusWorkspace.addEventListener('click', () => this.setSidebarView('explorer'));
    this.el.statusPosition.addEventListener('click', () => this.runCommand('go.line'));
    this.el.statusIndent.addEventListener('click', () => this.chooseIndentation());
    this.el.statusEncoding.addEventListener('click', () =>
      this.ui.toast('All files are read and written as UTF-8.', 'info'),
    );
    this.el.statusEol.addEventListener('click', () => this.toggleEol());
    this.el.statusLanguage.addEventListener('click', () => this.changeLanguage());
    this.el.statusTheme.addEventListener('click', () => this.chooseTheme());
    this.el.statusSync.addEventListener('click', () => this.refreshGit());
    this.el.statusFolderClosest = null;

    this.el.panelTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.showPanel(button.dataset.panelView);
      });
    });
    this.el.panelClose.addEventListener('click', () => this.hidePanel());
    this.el.panelMaximize.addEventListener('click', () => this.togglePanelMaximize());

    byId('sidebar-resizer').addEventListener('pointerdown', (event) => this.beginSidebarResize(event));
    byId('panel-resizer').addEventListener('pointerdown', (event) => this.beginPanelResize(event));

    this.bindWelcomeStatic();
    this.bindWorkspaceEvents?.();
    this.bindTabEvents?.();
    this.bindSearchEvents?.();
    this.bindGitEvents?.();
    this.bindRunEvents?.();
    this.bindSettingsEvents?.();
    this.bindCommandEvents?.();
    this.bindDropEvents();
  },

  bindWelcomeStatic() {
    this.el.dropOverlay.addEventListener('dragenter', (event) => event.preventDefault());
  },

  bindWindowEvents() {
    window.kali.win.onMaximized((maximized) => {
      if (this.el.winMaxIcon) {
        this.el.winMaxIcon.className = `codicon codicon-${maximized ? 'chrome-restore' : 'chrome-maximize'}`;
      }
      this.el.winMax.title = maximized ? 'Restore' : 'Maximize';
    });
    window.kali.win.onCloseRequest(() => this.handleWindowClose());
    window.kali.app.onOpenPaths((paths) => {
      if (Array.isArray(paths) && paths.length) {
        this.handleIncomingPaths(paths).catch((error) => {
          this.ui.toast(error.message, 'error');
        });
      }
    });

    this.workspaceChangeHandler = debounce(async () => {
      if (!this.folder) return;
      await this.refreshTree();
      this.refreshGit(true);
      this.refreshFileIndex();
    }, 500);
    window.kali.fs.onChanged(() => this.workspaceChangeHandler());

    window.addEventListener('resize', () => {
      this.terminalManager?.scheduleFit();
      this.editor?.layout();
    });

    window.addEventListener('keydown', (event) => this.handleGlobalKeyDown(event), true);

    window.addEventListener('error', (event) => {
      const message = event.error?.stack || event.message || 'Unknown renderer error';
      console.error(message);
      this.logOutput(message, 'error');
    });
    window.addEventListener('unhandledrejection', (event) => {
      const message = event.reason?.stack || event.reason?.message || String(event.reason);
      console.error(message);
      this.logOutput(message, 'error');
    });
  },

  setSidebarView(view, { toggle = false } = {}) {
    if (toggle && this.sidebarVisible && this.activeView === view) {
      this.toggleSidebar(true);
      return;
    }
    this.activeView = view;
    this.setSidebarVisible(true);
    this.el.activityButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.view === view);
    });
    document.querySelectorAll('.sidebar-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === view);
    });
    if (view === 'search') {
      requestAnimationFrame(() => this.el.searchInput.focus());
    } else if (view === 'git') {
      this.refreshGit(true);
    } else if (view === 'run') {
      this.updateRunPanel();
    } else if (view === 'extensions') {
      this.renderExtensions();
    } else if (view === 'explorer') {
      this.renderTree();
    }
  },

  setSidebarVisible(visible) {
    this.sidebarVisible = visible;
    this.el.sidebar.hidden = !visible;
    this.el.sidebarResizer.hidden = !visible;
    requestAnimationFrame(() => this.editor?.layout());
  },

  toggleSidebar(forceHide = false) {
    if (forceHide) this.setSidebarVisible(false);
    else this.setSidebarVisible(!this.sidebarVisible);
  },

  showPanel(view = this.panelView) {
    this.panelVisible = true;
    this.el.bottomPanel.hidden = false;
    this.el.panelResizer.hidden = false;
    this.setPanelView(view);
    requestAnimationFrame(() => {
      this.editor?.layout();
      this.terminalManager?.scheduleFit();
    });
  },

  hidePanel() {
    this.panelVisible = false;
    this.el.bottomPanel.hidden = true;
    this.el.panelResizer.hidden = true;
    requestAnimationFrame(() => {
      this.editor?.layout();
      this.terminalManager?.scheduleFit();
    });
  },

  togglePanel() {
    if (this.panelVisible) this.hidePanel();
    else this.showPanel(this.panelView);
  },

  setPanelView(view) {
    this.panelView = view;
    this.el.panelTabButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.panelView === view);
    });
    this.el.panelViews.forEach((panel) => {
      panel.hidden = panel.dataset.view !== view;
    });
    this.el.terminalTools.hidden = view !== 'terminal';
    if (view === 'terminal') {
      this.ensureTerminal().catch((error) => this.logOutput(error.message, 'error'));
      requestAnimationFrame(() => this.terminalManager?.scheduleFit());
    } else if (view === 'problems') {
      this.renderProblems();
    } else if (view === 'output') {
      this.el.output.scrollTop = this.el.output.scrollHeight;
    }
  },

  togglePanelMaximize() {
    if (!this.panelVisible) this.showPanel(this.panelView);
    if (this.panelMaximized) {
      this.el.bottomPanel.style.height = '';
      this.panelMaximized = false;
      this.el.panelMaximize.innerHTML = icon('chevron-up');
      this.el.panelMaximize.title = 'Maximize Panel';
    } else {
      this.panelPreviousHeight = this.settings.panelHeight;
      this.el.bottomPanel.style.height = `${Math.round(window.innerHeight * 0.62)}px`;
      this.panelMaximized = true;
      this.el.panelMaximize.innerHTML = icon('chevron-down');
      this.el.panelMaximize.title = 'Restore Panel Size';
    }
    requestAnimationFrame(() => {
      this.editor?.layout();
      this.terminalManager?.scheduleFit();
    });
  },

  chooseTheme() {
    const items = Object.values(THEMES).map((theme) => ({
      label: theme.label,
      description: theme.description,
      icon: 'color-mode',
      iconClass: theme.kind === 'light' ? 'theme-light-icon' : '',
      badge: theme.kind === 'dark' ? 'Dark' : 'Light',
      run: () => {
        this.applyTheme(theme.id);
        this.ui.toast(`Theme: ${theme.label}`, 'success', 1800);
      },
    }));
    this.ui.quickPick({ placeholder: 'Select Color Theme', items }).then((item) => item?.run?.());
  },

  chooseIndentation() {
    const items = [
      { label: 'Spaces: 2', description: 'Indent with two spaces', run: () => this.setIndentation(2, true) },
      { label: 'Spaces: 4', description: 'Indent with four spaces', run: () => this.setIndentation(4, true) },
      { label: 'Spaces: 8', description: 'Indent with eight spaces', run: () => this.setIndentation(8, true) },
      { label: 'Tabs', description: 'Indent with tab characters', run: () => this.setIndentation(4, false) },
    ];
    this.ui.quickPick({ placeholder: 'Select Indentation', items }).then((item) => item?.run?.());
  },

  setIndentation(tabSize, insertSpaces) {
    this.settings.tabSize = tabSize;
    this.settings.insertSpaces = insertSpaces;
    this.applySettings();
    for (const tab of this.tabs) {
      tab.model.updateOptions({ tabSize, insertSpaces });
    }
    this.persistSettings();
    this.updateStatus();
  },

  toggleEol() {
    const tab = this.currentTab();
    if (!tab) {
      this.ui.toast('Open a file to change its line endings.', 'warning');
      return;
    }
    const model = tab.model;
    const current = model.getEOL();
    model.setEOL(
      current === '\r\n'
        ? monaco.editor.EndOfLineSequence.LF
        : monaco.editor.EndOfLineSequence.CRLF,
    );
    this.updateStatus();
    this.ui.toast(`Line endings: ${model.getEOL() === '\r\n' ? 'CRLF' : 'LF'}`, 'info', 1600);
  },

  updateStatus() {
    const tab = this.currentTab();
    const errors = this.markerProblems.filter((problem) => problem.severity === 8).length;
    const warnings = this.markerProblems.filter((problem) => problem.severity === 4).length;
    if (this.el.statusErrors) this.el.statusErrors.textContent = String(errors);
    if (this.el.statusWarnings) this.el.statusWarnings.textContent = String(warnings);
    if (this.el.problemsCount) this.el.problemsCount.textContent = String(errors + warnings);
    if (this.el.statusBranchName) {
      this.el.statusBranchName.textContent = this.gitStatus?.isRepo
        ? this.gitStatus.branch || 'HEAD'
        : 'no repository';
    }
    if (this.el.statusSync && this.el.statusSyncLabel) {
      const ahead = this.gitStatus?.ahead || 0;
      const behind = this.gitStatus?.behind || 0;
      const visible = Boolean(this.gitStatus?.isRepo && (ahead || behind));
      this.el.statusSync.hidden = !visible;
      this.el.statusSyncLabel.textContent = visible ? `↑${ahead} ↓${behind}` : '';
    }
    this.el.statusFolder.textContent = this.folder ? pathBase(this.folder) : 'no folder';
    const position = tab ? this.editor.getPosition() : null;
    this.el.statusPosition.textContent = position
      ? `Ln ${position.lineNumber}, Col ${position.column}`
      : 'Ln 1, Col 1';
    this.el.statusIndent.textContent = `${this.settings.insertSpaces ? 'Spaces' : 'Tab'}: ${this.settings.tabSize}`;
    this.el.statusEol.textContent = tab ? (tab.model.getEOL() === '\r\n' ? 'CRLF' : 'LF') : 'LF';
    this.el.statusEncoding.textContent = 'UTF-8';
    this.el.statusLanguage.textContent = tab ? this.languageText(tab.language) : 'Plain Text';
    this.el.statusThemeName.textContent = THEMES[this.themeId]?.label || 'Kali';
    if (this.el.statusProblems) {
      this.el.statusProblems.title = `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
    }
  },

  languageText(language) {
    if (!language) return 'Plain Text';
    const labels = {
      plaintext: 'Plain Text',
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      json: 'JSON',
      html: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      less: 'Less',
      markdown: 'Markdown',
      shell: 'Shell Script',
      yaml: 'YAML',
      ini: 'INI / TOML',
      c: 'C',
      cpp: 'C++',
      csharp: 'C#',
      java: 'Java',
      go: 'Go',
      rust: 'Rust',
      ruby: 'Ruby',
      php: 'PHP',
      sql: 'SQL',
      xml: 'XML',
      python: 'Python',
      lua: 'Lua',
      r: 'R',
      perl: 'Perl',
      swift: 'Swift',
      kotlin: 'Kotlin',
      scala: 'Scala',
      graphql: 'GraphQL',
      powershell: 'PowerShell',
      bat: 'Batch',
      'objective-c': 'Objective-C',
      dart: 'Dart',
      elixir: 'Elixir',
      erlang: 'Erlang',
      clojure: 'Clojure',
      haskell: 'Haskell',
      latex: 'LaTeX',
      proto: 'Protocol Buffers',
      hcl: 'HCL / Terraform',
      nix: 'Nix',
      dockerfile: 'Dockerfile',
      makefile: 'Makefile',
      cmake: 'CMake',
    };
    return labels[language] || language.charAt(0).toUpperCase() + language.slice(1);
  },

  beginSidebarResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.el.sidebar.getBoundingClientRect().width;
    document.body.classList.add('is-resizing', 'resize-col');
    const move = (moveEvent) => {
      const width = clamp(startWidth + moveEvent.clientX - startX, 200, 600);
      document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    };
    const up = () => {
      document.body.classList.remove('is-resizing', 'resize-col');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.settings.sidebarWidth = this.el.sidebar.getBoundingClientRect().width;
      this.persistSettings();
      this.editor?.layout();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },

  beginPanelResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    if (this.panelMaximized) this.togglePanelMaximize();
    const startY = event.clientY;
    const startHeight = this.el.bottomPanel.getBoundingClientRect().height;
    document.body.classList.add('is-resizing', 'resize-row');
    const move = (moveEvent) => {
      const height = clamp(startHeight - (moveEvent.clientY - startY), 110, window.innerHeight * 0.72);
      this.el.bottomPanel.style.height = `${Math.round(height)}px`;
    };
    const up = () => {
      document.body.classList.remove('is-resizing', 'resize-row');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.settings.panelHeight = Math.round(this.el.bottomPanel.getBoundingClientRect().height);
      this.el.bottomPanel.style.height = '';
      document.documentElement.style.setProperty('--panel-height', `${this.settings.panelHeight}px`);
      this.persistSettings();
      this.editor?.layout();
      this.terminalManager?.scheduleFit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },

  bindDropEvents() {
    const hasFiles = (event) =>
      Array.from(event.dataTransfer?.types || []).includes('Files');
    window.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.dropDepth += 1;
      this.el.dropOverlay.classList.add('visible');
    });
    window.addEventListener('dragover', (event) => {
      if (hasFiles(event)) event.preventDefault();
    });
    window.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return;
      this.dropDepth = Math.max(0, this.dropDepth - 1);
      if (this.dropDepth === 0) this.el.dropOverlay.classList.remove('visible');
    });
    window.addEventListener('drop', async (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.dropDepth = 0;
      this.el.dropOverlay.classList.remove('visible');
      const paths = [...event.dataTransfer.files]
        .map((file) => window.kali.app.getPathForFile(file))
        .filter(Boolean);
      if (!paths.length) return;
      const stat = await window.kali.fs.stat(paths[0]).catch(() => null);
      if (stat?.isDirectory) await this.openFolder(paths[0]);
      else {
        for (const target of paths) await this.openPathFromUI(target);
      }
    });
  },

  async handleWindowClose() {
    if (this.closeFlowActive) return;
    const dirty = this.dirtyTabs();
    if (!dirty.length) {
      await this.persistSettings(true);
      window.kali.win.confirmClose();
      return;
    }
    this.closeFlowActive = true;
    const list = dirty
      .slice(0, 10)
      .map((tab) => `<li>${escapeHtml(tab.name)}</li>`)
      .join('');
    try {
      const choice = await this.ui.modal({
        title: 'Unsaved Changes',
        body: `<p class="modal-message">The following files have unsaved changes:</p>
          <ul class="unsaved-list">${list}${dirty.length > 10 ? `<li>…and ${dirty.length - 10} more</li>` : ''}</ul>
          <p class="modal-message muted">Save your changes before closing KaliCode?</p>`,
        actions: [
          { label: 'Cancel', value: 'cancel' },
          { label: "Don't Save", value: 'discard', danger: true },
          { label: 'Save All', value: 'save', primary: true },
        ],
        width: '540px',
      });
      if (choice === 'discard') {
        await this.persistSettings(true);
        window.kali.win.confirmClose();
      } else if (choice === 'save') {
        const saved = await this.saveAllTabs({ notify: false });
        if (saved) {
          await this.persistSettings(true);
          window.kali.win.confirmClose();
        }
      }
    } finally {
      this.closeFlowActive = false;
    }
  },

  updateWindowChrome() {
    const tab = this.activeTab;
    const folderName = this.folder ? pathBase(this.folder) : '';
    let label = 'Search files and commands';
    if (tab) label = `${folderName ? `${folderName} / ` : ''}${tab.name}`;
    else if (folderName) label = folderName;
    if (this.el.commandCenterLabel) this.el.commandCenterLabel.textContent = label;
    document.title = tab
      ? `${tab.dirty ? '● ' : ''}${tab.name} — KaliCode`
      : folderName
        ? `${folderName} — KaliCode`
        : 'KaliCode';
  },

  showWelcomePage() {
    if (this.tabs.length) {
      this.ui.toast('Close open editors to see the welcome page.', 'info');
      return;
    }
    this.renderWelcome();
    this.updateEmptyState();
  },

  toggleZen() {
    this.zenMode = !this.zenMode;
    this.el.app.classList.toggle('zen-mode', this.zenMode);
    requestAnimationFrame(() => {
      this.editor?.layout();
      this.terminalManager?.scheduleFit();
    });
    this.ui.toast(this.zenMode ? 'Zen mode on — press Esc to exit' : 'Zen mode off', 'info', 1800);
  },

  resetLayout() {
    this.settings.sidebarWidth = DEFAULT_SETTINGS.sidebarWidth;
    this.settings.panelHeight = DEFAULT_SETTINGS.panelHeight;
    this.applySettings();
    this.persistSettings();
  },
};
