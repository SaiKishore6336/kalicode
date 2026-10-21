import { monaco, languageOptions } from '../monaco.js';
import { escapeHtml, icon } from '../ui.js';
import {
  fileBadge,
  isInsidePath,
  isTypingTarget,
  pathBase,
  relativePath,
} from '../util.js';

export const commandMethods = {
  bindCommandEvents() {
    // Global shortcuts and menus are bound from uiMethods. Kept as a hook for
    // command-specific DOM bindings.
  },

  buildCommands() {
    const hasTab = () => Boolean(this.activeTab);
    const hasFolder = () => Boolean(this.folder);
    const hasDirty = () => this.dirtyTabs().length > 0;
    const hasTabs = () => this.tabs.length > 0;

    this.commands = [
      { id: 'file.new', label: 'New File', category: 'File', keys: 'Ctrl+N', icon: 'new-file', run: () => this.newUntitled() },
      { id: 'file.open', label: 'Open File…', category: 'File', keys: 'Ctrl+O', icon: 'go-to-file', run: () => this.chooseFile() },
      { id: 'file.openFolder', label: 'Open Folder…', category: 'File', keys: 'Ctrl+Shift+O', icon: 'folder-opened', run: () => this.chooseFolder() },
      { id: 'file.newFolder', label: 'New Folder…', category: 'File', icon: 'new-folder', when: hasFolder, run: () => this.newFolderHere() },
      { id: 'file.save', label: 'Save', category: 'File', keys: 'Ctrl+S', icon: 'save', when: hasTab, run: () => this.saveActive() },
      { id: 'file.saveAs', label: 'Save As…', category: 'File', keys: 'Ctrl+Shift+S', icon: 'save-as', when: hasTab, run: () => this.saveActiveAs() },
      { id: 'file.saveAll', label: 'Save All', category: 'File', keys: 'Ctrl+Alt+S', icon: 'save-all', when: hasDirty, run: () => this.saveAllTabs({ notify: true }) },
      { id: 'file.close', label: 'Close Editor', category: 'File', keys: 'Ctrl+W', icon: 'close', when: hasTab, run: () => this.closeTab(this.activeTab) },
      { id: 'file.closeAll', label: 'Close All Editors', category: 'File', keys: 'Ctrl+Shift+W', icon: 'close-all', when: hasTabs, run: () => this.closeAllTabs() },
      { id: 'file.closeFolder', label: 'Close Folder', category: 'File', icon: 'folder', when: hasFolder, run: () => this.closeFolder() },
      { id: 'file.reveal', label: 'Reveal Active File', category: 'File', icon: 'folder-opened', when: () => Boolean(this.activeTab?.path), run: () => window.kali.app.showItem(this.activeTab.path) },
      { id: 'file.copyPath', label: 'Copy Active File Path', category: 'File', icon: 'copy', when: () => Boolean(this.activeTab?.path), run: () => this.copyPath(this.activeTab.path) },
      { id: 'file.exit', label: 'Exit KaliCode', category: 'File', keys: 'Ctrl+Q', icon: 'close', run: () => window.kali.win.close() },

      { id: 'edit.undo', label: 'Undo', category: 'Edit', icon: 'undo', when: hasTab, run: () => this.editor.trigger('menu', 'undo', null) },
      { id: 'edit.redo', label: 'Redo', category: 'Edit', icon: 'redo', when: hasTab, run: () => this.editor.trigger('menu', 'redo', null) },
      { id: 'edit.cut', label: 'Cut', category: 'Edit', icon: 'clippy', when: hasTab, run: () => this.editor.getAction('editor.action.clipboardCutAction')?.run() },
      { id: 'edit.copy', label: 'Copy', category: 'Edit', icon: 'copy', when: hasTab, run: () => this.editor.getAction('editor.action.clipboardCopyAction')?.run() },
      { id: 'edit.paste', label: 'Paste', category: 'Edit', icon: 'clippy', when: hasTab, run: () => this.editor.getAction('editor.action.clipboardPasteAction')?.run() },
      { id: 'edit.find', label: 'Find', category: 'Edit', icon: 'search', when: hasTab, run: () => this.editor.getAction('actions.find')?.run() },
      { id: 'edit.replace', label: 'Replace', category: 'Edit', icon: 'replace', when: hasTab, run: () => this.editor.getAction('editor.action.startFindReplaceAction')?.run() },
      { id: 'edit.findInFiles', label: 'Search in Files', category: 'Edit', keys: 'Ctrl+Shift+F', icon: 'search', run: () => this.focusSearch(false) },
      { id: 'edit.replaceInFiles', label: 'Replace in Files', category: 'Edit', keys: 'Ctrl+Shift+H', icon: 'replace', run: () => this.focusSearch(true) },
      { id: 'edit.palette', label: 'Command Palette', category: 'Edit', keys: 'Ctrl+Shift+P', icon: 'terminal-cmd', run: () => this.commandPalette() },
      { id: 'edit.format', label: 'Format Document', category: 'Edit', keys: 'Shift+Alt+F', icon: 'symbol-color', when: hasTab, run: () => this.formatDocument() },
      { id: 'edit.trim', label: 'Trim Trailing Whitespace', category: 'Edit', icon: 'symbol-color', when: hasTab, run: () => this.trimTrailingWhitespace() },
      { id: 'edit.rename', label: 'Rename Symbol', category: 'Edit', keys: 'F2', icon: 'edit', when: hasTab, run: () => this.editor.getAction('editor.action.rename')?.run() },

      { id: 'selection.selectAll', label: 'Select All', category: 'Selection', icon: 'selection', when: hasTab, run: () => this.editor.trigger('menu', 'editor.action.selectAll', null) },
      { id: 'selection.cursorAbove', label: 'Add Cursor Above', category: 'Selection', icon: 'add', when: hasTab, run: () => this.editor.getAction('editor.action.insertCursorAbove')?.run() },
      { id: 'selection.cursorBelow', label: 'Add Cursor Below', category: 'Selection', icon: 'add', when: hasTab, run: () => this.editor.getAction('editor.action.insertCursorBelow')?.run() },
      { id: 'selection.occurrences', label: 'Select All Occurrences', category: 'Selection', icon: 'selection', when: hasTab, run: () => this.editor.getAction('editor.action.selectHighlights')?.run() },

      { id: 'view.explorer', label: 'Show Explorer', category: 'View', keys: 'Ctrl+Shift+E', icon: 'files', run: () => this.setSidebarView('explorer') },
      { id: 'view.search', label: 'Show Search', category: 'View', icon: 'search', run: () => this.setSidebarView('search') },
      { id: 'view.git', label: 'Show Source Control', category: 'View', keys: 'Ctrl+Shift+G', icon: 'source-control', run: () => this.setSidebarView('git') },
      { id: 'view.run', label: 'Show Run and Debug', category: 'View', keys: 'Ctrl+Shift+D', icon: 'run', run: () => this.setSidebarView('run') },
      { id: 'view.extensions', label: 'Show Extensions', category: 'View', keys: 'Ctrl+Shift+X', icon: 'extensions', run: () => this.setSidebarView('extensions') },
      { id: 'view.problems', label: 'Show Problems', category: 'View', keys: 'Ctrl+Shift+M', icon: 'warning', run: () => this.showPanel('problems') },
      { id: 'view.terminal', label: 'Show Terminal', category: 'View', icon: 'terminal', run: () => this.showPanel('terminal') },
      { id: 'view.output', label: 'Show Output', category: 'View', icon: 'output', run: () => this.showPanel('output') },
      { id: 'view.toggleSidebar', label: 'Toggle Primary Side Bar', category: 'View', keys: 'Ctrl+B', icon: 'layout-sidebar-left', run: () => this.toggleSidebar() },
      { id: 'view.togglePanel', label: 'Toggle Panel', category: 'View', keys: 'Ctrl+J', icon: 'layout-panel', run: () => this.togglePanel() },
      { id: 'view.wordWrap', label: 'Toggle Word Wrap', category: 'View', keys: 'Alt+Z', icon: 'word-wrap', run: () => this.toggleWordWrap() },
      { id: 'view.minimap', label: 'Toggle Minimap', category: 'View', icon: 'map', run: () => this.toggleMinimap() },
      { id: 'view.zoomIn', label: 'Zoom In', category: 'View', keys: 'Ctrl+=', icon: 'zoom-in', run: () => this.zoomEditor(1) },
      { id: 'view.zoomOut', label: 'Zoom Out', category: 'View', keys: 'Ctrl+-', icon: 'zoom-out', run: () => this.zoomEditor(-1) },
      { id: 'view.zoomReset', label: 'Reset Zoom', category: 'View', keys: 'Ctrl+0', icon: 'zoom-in', run: () => this.zoomEditor(0) },
      { id: 'view.theme', label: 'Color Theme', category: 'View', icon: 'color-mode', run: () => this.chooseTheme() },
      { id: 'view.fullscreen', label: 'Toggle Full Screen', category: 'View', keys: 'F11', icon: 'screen-full', run: () => window.kali.win.toggleFullscreen() },
      { id: 'view.zen', label: 'Toggle Zen Mode', category: 'View', icon: 'screen-full', run: () => this.toggleZen() },
      { id: 'view.resetLayout', label: 'Reset Layout', category: 'View', icon: 'layout', run: () => this.resetLayout() },
      { id: 'view.reload', label: 'Reload Window', category: 'View', icon: 'refresh', run: () => this.reloadWindow() },
      { id: 'view.devtools', label: 'Toggle Developer Tools', category: 'View', keys: 'Ctrl+Shift+I', icon: 'code', run: () => window.kali.app.devtools() },

      { id: 'go.file', label: 'Go to File…', category: 'Go', keys: 'Ctrl+P', icon: 'go-to-file', run: () => this.quickOpen() },
      { id: 'go.line', label: 'Go to Line/Column…', category: 'Go', keys: 'Ctrl+G', icon: 'go-to-file', run: () => this.editor.getAction('editor.action.gotoLine')?.run() },
      { id: 'go.symbol', label: 'Go to Symbol…', category: 'Go', keys: 'Ctrl+Alt+O', icon: 'symbol-method', when: hasTab, run: () => this.editor.getAction('editor.action.quickOutline')?.run() },
      { id: 'go.definition', label: 'Go to Definition', category: 'Go', keys: 'F12', icon: 'go-to-definition', when: hasTab, run: () => this.editor.getAction('editor.action.revealDefinition')?.run() },
      { id: 'go.references', label: 'Go to References', category: 'Go', keys: 'Shift+F12', icon: 'references', when: hasTab, run: () => this.runEditorAction('editor.action.referenceSearch.trigger') },

      { id: 'run.file', label: 'Run Active File', category: 'Run', keys: 'F5', icon: 'play', when: hasTab, run: () => this.runActiveFile() },
      { id: 'run.terminal', label: 'Run Active File in Terminal', category: 'Run', keys: 'Ctrl+F5', icon: 'terminal', when: hasTab, run: () => this.runActiveFile() },
      { id: 'run.last', label: 'Run Last Command', category: 'Run', icon: 'history', run: () => this.runLastCommand() },
      { id: 'run.tasks', label: 'Show Workspace Tasks', category: 'Run', icon: 'tasklist', run: () => this.setSidebarView('run') },

      { id: 'terminal.toggle', label: 'Toggle Terminal', category: 'Terminal', keys: 'Ctrl+`', icon: 'terminal', run: () => this.togglePanel() },
      { id: 'terminal.new', label: 'New Terminal', category: 'Terminal', keys: 'Ctrl+Alt+T', icon: 'add', run: () => this.newTerminal() },
      { id: 'terminal.clear', label: 'Clear Terminal', category: 'Terminal', icon: 'clear-all', run: () => this.clearTerminal() },
      { id: 'terminal.kill', label: 'Kill Terminal', category: 'Terminal', icon: 'trash', run: () => this.killTerminal() },
      { id: 'terminal.focus', label: 'Focus Terminal', category: 'Terminal', icon: 'terminal', run: () => { this.showPanel('terminal'); this.terminalManager?.focus(); } },

      { id: 'git.refresh', label: 'Refresh Source Control', category: 'Source Control', icon: 'refresh', run: () => this.refreshGit(false) },
      { id: 'git.commit', label: 'Commit Staged Changes', category: 'Source Control', icon: 'git-commit', run: () => { this.setSidebarView('git'); this.el.gitMessage.focus(); } },
      { id: 'search.refresh', label: 'Refresh Search Results', category: 'Search', icon: 'refresh', run: () => this.runSearch() },

      { id: 'help.welcome', label: 'Show Welcome Page', category: 'Help', icon: 'home', run: () => this.showWelcomePage() },
      { id: 'help.shortcuts', label: 'Keyboard Shortcuts', category: 'Help', icon: 'keyboard', run: () => this.showKeyboardShortcuts() },
      { id: 'help.readme', label: 'Open README', category: 'Help', icon: 'book', run: () => window.kali.app.openPath(this.appInfo.readme) },
      { id: 'help.project', label: 'Open Project Folder', category: 'Help', icon: 'folder-opened', run: () => window.kali.app.openPath(this.appInfo.projectRoot) },
      { id: 'help.about', label: 'About KaliCode', category: 'Help', icon: 'info', run: () => this.showAbout() },
      { id: 'settings.open', label: 'Open Settings', category: 'Preferences', keys: 'Ctrl+,', icon: 'settings-gear', run: () => this.openSettings() },
      { id: 'settings.file', label: 'Open settings.json', category: 'Preferences', icon: 'json', run: () => this.openSettingsFile() },
    ];
    this.commandById = new Map(this.commands.map((command) => [command.id, command]));
    this.keymap = new Map();
    for (const command of this.commands) {
      if (command.keys) this.keymap.set(command.keys, command.id);
    }
    this.keymap.set('F1', 'edit.palette');
    this.menus = {
      file: [
        'file.new', 'file.open', 'file.openFolder', 'file.newFolder', 'sep',
        'file.save', 'file.saveAs', 'file.saveAll', 'sep',
        'file.close', 'file.closeAll', 'sep',
        'file.closeFolder', 'file.reveal', 'file.copyPath', 'sep', 'file.exit',
      ],
      edit: [
        'edit.undo', 'edit.redo', 'sep', 'edit.cut', 'edit.copy', 'edit.paste', 'sep',
        'edit.find', 'edit.replace', 'edit.findInFiles', 'edit.replaceInFiles', 'sep',
        'edit.format', 'edit.trim', 'sep', 'edit.rename', 'edit.palette',
      ],
      selection: [
        'selection.selectAll', 'sep', 'selection.cursorAbove', 'selection.cursorBelow', 'selection.occurrences',
      ],
      view: [
        'view.explorer', 'view.search', 'view.git', 'view.run', 'view.extensions', 'view.problems', 'sep',
        'view.terminal', 'view.output', 'sep', 'view.toggleSidebar', 'view.togglePanel', 'sep',
        'view.wordWrap', 'view.minimap', 'sep', 'view.zoomIn', 'view.zoomOut', 'view.zoomReset', 'sep',
        'view.theme', 'view.zen', 'view.fullscreen', 'view.resetLayout', 'sep', 'view.reload', 'view.devtools',
      ],
      go: ['go.file', 'go.line', 'go.symbol', 'sep', 'go.definition', 'go.references'],
      run: ['run.file', 'run.terminal', 'run.last', 'sep', 'run.tasks'],
      terminal: ['terminal.toggle', 'terminal.new', 'sep', 'terminal.clear', 'terminal.kill', 'terminal.focus'],
      help: ['help.welcome', 'help.shortcuts', 'sep', 'help.readme', 'help.project', 'sep', 'settings.open', 'settings.file', 'sep', 'help.about'],
    };
  },

  showAppMenu(name, anchor) {
    const ids = this.menus[name] || [];
    const items = [];
    for (const id of ids) {
      if (id === 'sep') {
        items.push({ separator: true });
        continue;
      }
      const command = this.commandById.get(id);
      if (!command) continue;
      items.push({
        label: command.label,
        keys: command.keys || '',
        icon: command.icon,
        disabled: command.when ? !command.when() : false,
        run: () => this.runCommand(command),
      });
    }
    const rect = anchor.getBoundingClientRect();
    this.ui.contextMenu(rect.left, rect.bottom + 3, items);
  },

  async runCommand(commandOrId) {
    const command =
      typeof commandOrId === 'string' ? this.commandById.get(commandOrId) : commandOrId;
    if (!command) return;
    try {
      await command.run();
    } catch (error) {
      console.error(error);
      this.logOutput(`${command.label} failed: ${error.message}`, 'error');
      this.ui.toast(error.message || String(error), 'error', 5000);
    }
  },

  handleGlobalKeyDown(event) {
    if (this.ui.isOverlayOpen()) return;
    if (event.isComposing) return;
    if (event.key === 'Escape' && this.zenMode) {
      event.preventDefault();
      this.toggleZen();
      return;
    }
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      /^[1-9]$/.test(event.key)
    ) {
      const index = Number(event.key) - 1;
      if (this.tabs[index]) {
        event.preventDefault();
        this.activateTab(this.tabs[index]);
      }
      return;
    }
    if (
      (isTypingTarget(event.target) || event.target?.closest?.('.monaco-editor')) &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !/^F\d{1,2}$/.test(event.key)
    ) {
      return;
    }
    const chord = this.eventChord(event);
    const commandId = this.keymap.get(chord);
    if (!commandId) return;
    event.preventDefault();
    event.stopPropagation();
    this.runCommand(commandId);
  },

  eventChord(event) {
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');
    if (event.metaKey) parts.push('Meta');
    let key = event.key;
    if (event.code === 'Backquote') key = '`';
    else if (event.code === 'Comma') key = ',';
    else if (event.code === 'Period') key = '.';
    else if (event.code === 'Minus') key = '-';
    else if (event.code === 'Equal') key = '=';
    else if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    parts.push(key);
    return parts.join('+');
  },

  async quickOpen() {
    if (!this.folder) {
      const items = [
        {
          label: 'Open Folder…',
          description: 'Start a workspace',
          icon: 'folder-opened',
          keys: 'Ctrl+Shift+O',
          run: () => this.chooseFolder(),
        },
        {
          label: 'Open File…',
          description: 'Open a file from disk',
          icon: 'go-to-file',
          keys: 'Ctrl+O',
          run: () => this.chooseFile(),
        },
        {
          label: 'New File',
          description: 'Start an untitled editor',
          icon: 'new-file',
          keys: 'Ctrl+N',
          run: () => this.newUntitled(),
        },
        {
          label: 'Command Palette…',
          description: 'Show all commands',
          icon: 'terminal-cmd',
          keys: 'Ctrl+Shift+P',
          run: () => this.commandPalette(),
        },
      ];
      for (const file of this.settings.recentFiles.slice(0, 6)) {
        items.push({
          label: pathBase(file),
          description: file,
          iconHtml: fileBadge(pathBase(file)),
          run: () => this.openPathFromUI(file),
        });
      }
      const selected = await this.ui.quickPick({
        placeholder: 'Search files and commands',
        items,
        emptyText: 'No matching files',
      });
      if (selected?.run) await selected.run();
      return;
    }
    if (this.quickFilesFolder !== this.folder || !this.quickFiles.length) {
      await this.refreshFileIndex();
    }
    const items = this.quickFiles.map((file) => ({
      label: pathBase(file.relative),
      description: pathBase(file.relative) === file.relative ? '' : file.relative.slice(0, -(pathBase(file.relative).length + 1)),
      searchText: file.relative,
      iconHtml: fileBadge(pathBase(file.relative)),
      run: () => this.openFile(file.path),
    }));
    if (!items.length) {
      items.push({
        label: 'Open File…',
        description: 'The workspace index is empty',
        icon: 'go-to-file',
        run: () => this.chooseFile(),
      });
    }
    const selected = await this.ui.quickPick({
      placeholder: 'Search files by name',
      items,
      emptyText: 'No matching files. Try another name.',
      footer: '↑↓ Navigate &nbsp; ↵ Open &nbsp; Esc Close',
    });
    if (selected?.run) await selected.run();
  },

  async commandPalette() {
    const items = this.commands
      .filter((command) => !command.when || command.when())
      .map((command) => ({
        label: command.label,
        description: command.category,
        keys: command.keys || '',
        icon: command.icon || 'terminal-cmd',
        run: () => this.runCommand(command),
      }));
    const selected = await this.ui.quickPick({
      placeholder: 'Type a command…',
      items,
      emptyText: 'No matching commands',
      footer: '↑↓ Navigate &nbsp; ↵ Run &nbsp; Esc Close',
    });
    if (selected?.run) await selected.run();
  },

  async runEditorAction(actionId) {
    if (!this.editor.getModel()) {
      this.ui.toast('Open a file first.', 'warning');
      return;
    }
    const action = this.editor.getAction(actionId);
    if (!action) {
      this.ui.toast('That editor action is not available for this file.', 'info');
      return;
    }
    try {
      await action.run();
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  async formatDocument() {
    if (!this.editor.getModel()) {
      this.ui.toast('Open a file first.', 'warning');
      return;
    }
    const action = this.editor.getAction('editor.action.formatDocument');
    if (action?.isSupported?.()) {
      await action.run();
      return;
    }
    this.ui.toast('No formatter is available for this language.', 'info', 3500);
  },

  trimTrailingWhitespace() {
    const tab = this.currentTab();
    if (!tab) return;
    const model = tab.model;
    const original = model.getValue();
    const cleaned = original.replace(/[ \t]+$/gm, '');
    if (cleaned === original) {
      this.ui.toast('No trailing whitespace found.', 'info', 1600);
      return;
    }
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: cleaned }],
      () => null,
    );
    this.ui.toast('Trailing whitespace removed.', 'success', 1600);
  },

  toggleWordWrap() {
    this.settings.wordWrap = !this.settings.wordWrap;
    this.applySettings();
    this.persistSettings();
    this.ui.toast(`Word wrap ${this.settings.wordWrap ? 'on' : 'off'}`, 'info', 1400);
  },

  toggleMinimap() {
    this.settings.minimap = !this.settings.minimap;
    this.applySettings();
    this.persistSettings();
    this.ui.toast(`Minimap ${this.settings.minimap ? 'shown' : 'hidden'}`, 'info', 1400);
  },

  zoomEditor(direction) {
    if (direction === 0) this.settings.fontSize = 14;
    else this.settings.fontSize = Math.max(10, Math.min(28, this.settings.fontSize + direction));
    this.applySettings();
    this.persistSettings();
    this.ui.toast(`Editor font size: ${this.settings.fontSize}px`, 'info', 1200);
  },

  async changeLanguage() {
    const tab = this.currentTab();
    if (!tab) {
      this.ui.toast('Open a file first.', 'warning');
      return;
    }
    const items = languageOptions().map((language) => ({
      label: language.label,
      description: language.extensions.slice(0, 4).join(' '),
      icon: language.id === tab.language ? 'check' : 'code',
      badge: language.id === tab.language ? 'Current' : '',
      run: () => {
        monaco.editor.setModelLanguage(tab.model, language.id);
        tab.language = language.id;
        this.updateStatus();
        this.renderTabs();
        this.ui.toast(`Language mode: ${language.label}`, 'success', 1600);
      },
    }));
    const selected = await this.ui.quickPick({
      placeholder: 'Select Language Mode',
      items,
    });
    if (selected?.run) selected.run();
  },

  reloadWindow() {
    if (!this.dirtyTabs().length) {
      window.kali.app.reload();
      return;
    }
    this.confirmUnsaved('reloading the window').then((ok) => {
      if (ok) window.kali.app.reload();
    });
  },
};
