import { monaco, setupMonaco, THEMES } from './monaco.js';
import { UI } from './ui.js';
import { TerminalManager } from './terminal.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { byId, clamp, pathBase } from './util.js';
import { workspaceMethods } from './methods/workspace.js';
import { tabMethods } from './methods/tabs.js';
import { searchMethods } from './methods/search.js';
import { gitMethods } from './methods/git.js';
import { runMethods } from './methods/run.js';
import { settingsMethods } from './methods/settings-ui.js';
import { commandMethods } from './methods/commands.js';
import { uiMethods } from './methods/ui.js';

export class KaliCodeApp {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.appInfo = {};
    this.folder = null;
    this.tabs = [];
    this.activeTab = null;
    this.untitledCounter = 0;
    this.treeCache = new Map();
    this.expanded = new Set();
    this.treeSelectedPath = null;
    this.workspaceCollapsed = false;
    this.gitStatus = { isRepo: false, changes: [], branch: '', ahead: 0, behind: 0 };
    this.gitMap = new Map();
    this.tasks = [];
    this.quickFiles = [];
    this.quickFilesFolder = null;
    this.markerProblems = [];
    this.searchState = {
      query: '',
      replace: '',
      matchCase: false,
      wholeWord: false,
      isRegex: false,
      results: [],
      count: 0,
      busy: false,
    };
    this.terminalManager = null;
    this.terminalStarting = null;
    this.panelView = 'terminal';
    this.panelVisible = false;
    this.sidebarVisible = true;
    this.activeView = 'explorer';
    this.panelMaximized = false;
    this.panelPreviousHeight = null;
    this.lastRunCommand = '';
    this.autoSaveTimer = null;
    this.persistTimer = null;
    this.gitTimer = null;
    this.workspaceTimer = null;
    this.searchTimer = null;
    this.markerTimer = null;
    this.closeFlowActive = false;
    this.startupRestoring = false;
    this.commands = [];
    this.commandById = new Map();
    this.keymap = new Map();
    this.menus = {};
    this.outputLines = [];
    this.themeId = 'kali';
    this.dropDepth = 0;
    this.zenMode = false;
    this.initialized = false;
    this.editor = null;
    this.el = {};
  }

  async init() {
    setupMonaco();
    this.ui = new UI();
    this.cacheDom();
    this.appInfo = await window.kali.app
      .info()
      .catch(() => ({ appVersion: '1.0.0', versions: window.kali.versions, defaultShell: window.kali.env.shell }));
    const stored = await window.kali.settings.get().catch(() => ({}));
    this.normalizeSettings(stored);
    this.applyTheme(this.settings.theme, false);
    this.createEditor();
    this.bindEditor();
    this.buildCommands();
    this.bindEvents();
    this.bindWindowEvents();
    this.applySettings(true);
    this.renderExtensions();
    this.renderGit();
    this.setWorkspaceUI();
    this.renderWelcome();
    this.updateEmptyState();
    this.updateStatus();
    this.updateRunPanel();
    this.updateWindowChrome();
    this.logOutput(
      `KaliCode ${this.appInfo.appVersion} · Electron ${this.appInfo.versions?.electron || ''} · Chromium ${this.appInfo.versions?.chrome || ''}`,
      'info',
    );
    this.initialized = true;
    try {
      await this.restoreStartup();
    } catch (error) {
      console.error(error);
      this.ui.toast(`Startup error: ${error.message}`, 'error', 6000);
      this.updateEmptyState();
    }
    requestAnimationFrame(() => this.editor?.layout());
  }

  cacheDom() {
    const ids = [
      'app',
      'titlebar',
      'brand',
      'menubar',
      'command-center',
      'command-center-label',
      'win-min',
      'win-max',
      'win-close',
      'sidebar',
      'sidebar-resizer',
      'panel-resizer',
      'bottom-panel',
      'tree',
      'explorer-empty',
      'workspace-row',
      'workspace-name',
      'workspace-toggle',
      'workspace-open',
      'workspace-close',
      'explorer-new-file',
      'explorer-new-folder',
      'explorer-refresh',
      'explorer-collapse',
      'explorer-open-folder',
      'search-input',
      'replace-input',
      'search-case',
      'search-word',
      'search-regex',
      'search-summary',
      'search-results',
      'btn-replace-all',
      'search-clear',
      'search-refresh',
      'git-content',
      'git-empty',
      'git-empty-text',
      'git-init',
      'git-branch-button',
      'git-branch-name',
      'git-sync',
      'git-message',
      'git-commit',
      'git-changes',
      'git-refresh',
      'git-more',
      'git-badge',
      'run-content',
      'run-active-file',
      'run-command-preview',
      'btn-run',
      'btn-run-terminal',
      'run-tasks',
      'run-refresh',
      'run-empty',
      'extensions-filter',
      'extensions-count',
      'language-grid',
      'theme-grid',
      'tabs',
      'tabs-list',
      'tab-more',
      'breadcrumbs',
      'editor-area',
      'welcome',
      'editor-host',
      'welcome-open-folder',
      'welcome-new-file',
      'recent-folders',
      'recent-files',
      'drop-overlay',
      'terminal-view',
      'problems-view',
      'output-view',
      'terminal',
      'terminal-placeholder',
      'terminal-tools',
      'problems-list',
      'problems-count',
      'output',
      'term-new',
      'term-clear',
      'term-kill',
      'panel-maximize',
      'panel-close',
      'panel-tab-problems',
      'panel-tab-terminal',
      'panel-tab-output',
      'status-branch',
      'status-branch-name',
      'status-sync',
      'status-sync-label',
      'status-problems',
      'status-errors',
      'status-warnings',
      'status-workspace',
      'status-folder',
      'status-position',
      'status-indent',
      'status-encoding',
      'status-eol',
      'status-language',
      'status-theme',
      'status-theme-name',
      'activity-settings',
      'activity-theme',
    ];
    for (const id of ids) {
      const camel = id.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      this.el[camel] = byId(id);
    }
    this.el.activityButtons = [...document.querySelectorAll('.activity-item[data-view]')];
    this.el.menuButtons = [...document.querySelectorAll('#menubar [data-menu]')];
    this.el.panelTabButtons = [...document.querySelectorAll('.panel-tab-buttons [data-panel-view]')];
    this.el.panelViews = [...document.querySelectorAll('.panel-view')];
    this.el.winMaxIcon = this.el.winMax?.querySelector('.codicon');
  }

  createEditor() {
    this.el.editorHost.hidden = false;
    this.editor = monaco.editor.create(this.el.editorHost, {
      theme: THEMES[this.themeId]?.monaco || 'kalicode-kali',
      fontFamily: this.settings.fontFamily,
      fontSize: this.settings.fontSize,
      fontLigatures: true,
      tabSize: this.settings.tabSize,
      insertSpaces: this.settings.insertSpaces,
      detectIndentation: false,
      automaticLayout: false,
      wordWrap: this.settings.wordWrap ? 'on' : 'off',
      minimap: { enabled: this.settings.minimap, renderCharacters: false, maxColumn: 90, scale: 1 },
      lineNumbers: this.settings.lineNumbers ? 'on' : 'off',
      glyphMargin: true,
      folding: true,
      showFoldingControls: 'mouseover',
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking: 'smooth',
      renderLineHighlight: 'all',
      renderWhitespace: 'selection',
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: 'active', indentation: true, highlightActiveIndentation: true },
      stickyScroll: { enabled: true, maxLineCount: 5 },
      padding: { top: 12, bottom: 24 },
      suggest: { preview: true, showStatusBar: true },
      quickSuggestions: { other: true, comments: false, strings: false },
      linkedEditing: true,
      colorDecorators: true,
      codeLens: true,
      lightbulb: { enabled: 'onCode' },
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      mouseWheelZoom: false,
      multiCursorModifier: 'alt',
      largeFileOptimizations: true,
      accessibilitySupport: 'auto',
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: false,
      },
      renderValidationDecorations: 'on',
      unicodeHighlight: { ambiguousCharacters: false },
    });
    this.el.editorHost.hidden = true;
    this.editorResizeObserver = new ResizeObserver(() => this.editor?.layout());
    this.editorResizeObserver.observe(this.el.editorArea);
  }

  bindEditor() {
    this.editor.onDidChangeCursorPosition(() => this.updateStatus());
    this.editor.onDidChangeModel(() => {
      this.updateStatus();
      this.renderBreadcrumbs();
    });
    this.editor.onDidChangeModelContent(() => {
      const tab = this.currentTab();
      const model = this.editor.getModel();
      if (!tab || tab.model !== model) return;
      const wasDirty = tab.dirty;
      tab.dirty = tab.savedVersion !== model.getAlternativeVersionId();
      if (tab.dirty !== wasDirty) {
        this.renderTabs();
        this.updateWindowChrome();
        this.saveSession();
      }
      this.updateStatus();
      if (this.settings.autoSave && tab.dirty && tab.path) {
        if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
          this.autoSaveTimer = null;
          this.saveTab(tab, { silent: true }).catch((error) => this.logOutput(error.message, 'error'));
        }, 900);
      }
    });
    this.editor.onDidChangeModelLanguage(() => {
      const tab = this.currentTab();
      if (tab) tab.language = this.editor.getModel()?.getLanguageId() || tab.language;
      this.updateStatus();
    });
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => this.saveActive());
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS, () =>
      this.saveActiveAs(),
    );
    this.markerListener = monaco.editor.onDidChangeMarkers(() => {
      if (this.markerTimer) clearTimeout(this.markerTimer);
      this.markerTimer = setTimeout(() => this.refreshProblemsFromMarkers(), 120);
    });
  }

  currentTab() {
    return this.activeTab;
  }

  getShell() {
    return (
      this.settings.terminalShell ||
      this.appInfo.defaultShell ||
      window.kali?.env?.shell ||
      '/bin/bash'
    );
  }

  normalizeSettings(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const settings = { ...DEFAULT_SETTINGS, ...input };
    if (!THEMES[settings.theme]) settings.theme = 'kali';
    settings.fontSize = clamp(Number(settings.fontSize) || 14, 10, 28);
    settings.terminalFontSize = clamp(Number(settings.terminalFontSize) || 13, 10, 22);
    settings.tabSize = clamp(Number(settings.tabSize) || 4, 1, 12);
    settings.sidebarWidth = clamp(Number(settings.sidebarWidth) || 286, 200, 600);
    settings.panelHeight = clamp(Number(settings.panelHeight) || 245, 110, 700);
    settings.insertSpaces = settings.insertSpaces !== false;
    settings.wordWrap = Boolean(settings.wordWrap);
    settings.minimap = settings.minimap !== false;
    settings.lineNumbers = settings.lineNumbers !== false;
    settings.autoSave = Boolean(settings.autoSave);
    settings.hiddenFiles = settings.hiddenFiles !== false;
    settings.restoreSession = settings.restoreSession !== false;
    settings.fontFamily = String(settings.fontFamily || DEFAULT_SETTINGS.fontFamily);
    settings.terminalShell = String(settings.terminalShell || '');
    settings.recentFolders = Array.isArray(settings.recentFolders)
      ? settings.recentFolders.filter((item) => typeof item === 'string').slice(0, 10)
      : [];
    settings.recentFiles = Array.isArray(settings.recentFiles)
      ? settings.recentFiles.filter((item) => typeof item === 'string').slice(0, 12)
      : [];
    settings.session =
      settings.session && typeof settings.session === 'object' ? settings.session : null;
    this.settings = settings;
  }

  applySettings(first = false) {
    if (!this.editor) return;
    this.editor.updateOptions({
      fontFamily: this.settings.fontFamily,
      fontSize: this.settings.fontSize,
      tabSize: this.settings.tabSize,
      insertSpaces: this.settings.insertSpaces,
      wordWrap: this.settings.wordWrap ? 'on' : 'off',
      minimap: { enabled: this.settings.minimap, renderCharacters: false, maxColumn: 90, scale: 1 },
      lineNumbers: this.settings.lineNumbers ? 'on' : 'off',
    });
    for (const model of monaco.editor.getModels()) {
      model.updateOptions({
        tabSize: this.settings.tabSize,
        insertSpaces: this.settings.insertSpaces,
      });
    }
    document.documentElement.style.setProperty(
      '--sidebar-width',
      `${clamp(this.settings.sidebarWidth, 200, 600)}px`,
    );
    document.documentElement.style.setProperty(
      '--panel-height',
      `${clamp(this.settings.panelHeight, 110, 700)}px`,
    );
    if (this.terminalManager) {
      this.terminalManager.setFont(this.settings.terminalFontSize);
    }
    if (!first) {
      this.updateStatus();
      requestAnimationFrame(() => this.editor?.layout());
    }
  }

  applyTheme(themeId, persist = true) {
    const theme = THEMES[themeId] || THEMES.kali;
    this.themeId = theme.id;
    document.documentElement.dataset.theme = theme.id;
    monaco.editor.setTheme(theme.monaco);
    if (this.terminalManager) this.terminalManager.setTheme(theme.terminal);
    this.settings.theme = theme.id;
    if (this.el.statusThemeName) this.el.statusThemeName.textContent = theme.label;
    document.querySelectorAll('.theme-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.theme === theme.id);
    });
    if (persist) this.persistSettings();
  }

  persistSettings(immediate = false) {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const write = async () => {
      try {
        await window.kali.settings.set(this.settings);
      } catch (error) {
        console.error('Unable to save settings', error);
      }
    };
    if (immediate) return write();
    this.persistTimer = setTimeout(write, 350);
    return undefined;
  }

  saveSession() {
    if (!this.initialized && !this.startupRestoring) return;
    this.settings.session = {
      folder: this.folder,
      files: this.tabs
        .filter((tab) => tab.path)
        .slice(0, 40)
        .map((tab) => tab.path),
      active: this.activeTab?.path || null,
    };
    this.persistSettings();
  }

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
  }

  async safeRun(fn, context = 'KaliCode') {
    try {
      return await fn();
    } catch (error) {
      console.error(context, error);
      this.logOutput(`${context}: ${error.message || error}`, 'error');
      this.ui.toast(error.message || String(error), 'error', 5000);
      return undefined;
    }
  }
}

Object.assign(
  KaliCodeApp.prototype,
  workspaceMethods,
  tabMethods,
  searchMethods,
  gitMethods,
  runMethods,
  settingsMethods,
  commandMethods,
  uiMethods,
);
