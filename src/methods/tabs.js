import { monaco, detectLanguage } from '../monaco.js';
import { escapeHtml, icon } from '../ui.js';
import {
  fileBadge,
  isInsidePath,
  joinPath,
  pathBase,
  pathDir,
  relativePath,
} from '../util.js';

let untitledSequence = 0;

export const tabMethods = {
  bindTabEvents() {
    this.el.tabsList.addEventListener('click', (event) => {
      const close = event.target.closest('.tab-close');
      const tabElement = event.target.closest('.editor-tab');
      if (!tabElement) return;
      const tab = this.tabs.find((item) => item.id === tabElement.dataset.tabId);
      if (!tab) return;
      if (close) {
        event.stopPropagation();
        this.closeTab(tab);
      } else {
        this.activateTab(tab);
      }
    });
    this.el.tabsList.addEventListener('auxclick', (event) => {
      if (event.button !== 1) return;
      const tabElement = event.target.closest('.editor-tab');
      if (!tabElement) return;
      const tab = this.tabs.find((item) => item.id === tabElement.dataset.tabId);
      if (tab) {
        event.preventDefault();
        this.closeTab(tab);
      }
    });
    this.el.tabsList.addEventListener('contextmenu', (event) => {
      const tabElement = event.target.closest('.editor-tab');
      if (!tabElement) return;
      event.preventDefault();
      const tab = this.tabs.find((item) => item.id === tabElement.dataset.tabId);
      if (!tab) return;
      this.showTabMenu(tab, event.clientX, event.clientY);
    });
    this.el.tabsList.addEventListener(
      'wheel',
      (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        this.el.tabsList.scrollLeft += event.deltaY;
      },
      { passive: true },
    );
    this.el.tabMore.addEventListener('click', () => {
      const rect = this.el.tabMore.getBoundingClientRect();
      this.showTabBarMenu(rect.left, rect.bottom + 4);
    });
    this.el.breadcrumbs.addEventListener('click', (event) => {
      const crumb = event.target.closest('[data-crumb-path]');
      if (!crumb) return;
      const target = crumb.dataset.crumbPath;
      if (target === '__file__') {
        this.editor.focus();
        return;
      }
      this.revealInTree(target);
    });
  },

  showTabMenu(tab, x, y) {
    const index = this.tabs.indexOf(tab);
    this.ui.contextMenu(x, y, [
      { label: 'Close', icon: 'close', keys: 'Ctrl+W', run: () => this.closeTab(tab) },
      {
        label: 'Close Others',
        icon: 'close-all',
        run: () => this.closeTabsList(this.tabs.filter((item) => item !== tab)),
      },
      {
        label: 'Close to the Right',
        icon: 'arrow-right',
        disabled: index === this.tabs.length - 1,
        run: () => this.closeTabsList(this.tabs.slice(index + 1)),
      },
      { separator: true },
      { label: 'Save', icon: 'save', keys: 'Ctrl+S', run: () => this.saveTab(tab, { notify: true }) },
      { label: 'Save As…', icon: 'save-as', run: () => this.saveTab(tab, { saveAs: true, notify: true }) },
      { separator: true },
      {
        label: 'Copy Path',
        icon: 'copy',
        disabled: !tab.path,
        run: () => tab.path && this.copyPath(tab.path),
      },
      {
        label: 'Reveal in Explorer',
        icon: 'folder-opened',
        disabled: !tab.path,
        run: () => tab.path && this.revealInTree(tab.path),
      },
      {
        label: 'Reveal in File Manager',
        icon: 'folder',
        disabled: !tab.path,
        run: () => tab.path && window.kali.app.showItem(tab.path),
      },
    ]);
  },

  showTabBarMenu(x, y) {
    this.ui.contextMenu(x, y, [
      {
        label: 'Save All',
        icon: 'save-all',
        disabled: !this.dirtyTabs().length,
        run: () => this.saveAllTabs({ notify: true }),
      },
      {
        label: 'Close All Editors',
        icon: 'close-all',
        disabled: !this.tabs.length,
        run: () => this.closeAllTabs(),
      },
      { separator: true },
      {
        label: this.settings.wordWrap ? 'Turn Off Word Wrap' : 'Turn On Word Wrap',
        icon: 'word-wrap',
        run: () => this.toggleWordWrap(),
      },
      {
        label: this.settings.minimap ? 'Hide Minimap' : 'Show Minimap',
        icon: 'map',
        run: () => this.toggleMinimap(),
      },
      { separator: true },
      {
        label: 'Reveal Active File',
        icon: 'folder-opened',
        disabled: !this.activeTab?.path,
        run: () => this.activeTab?.path && window.kali.app.showItem(this.activeTab.path),
      },
    ]);
  },

  async openFile(filePath, options = {}) {
    const { activate = true, silent = false, line = null, column = 1, restoring = false } = options;
    const existing = this.tabs.find((tab) => tab.path === filePath);
    if (existing) {
      if (activate) {
        this.activateTab(existing);
        if (line) this.revealLine(line, column);
      }
      return existing;
    }
    let data;
    try {
      data = await window.kali.fs.readFile(filePath);
    } catch (error) {
      if (!silent) this.ui.toast(error.message, 'error', 5000);
      this.logOutput(`Unable to open ${filePath}: ${error.message}`, 'error');
      return null;
    }
    const uri = monaco.Uri.file(filePath);
    let model = monaco.editor.getModel(uri);
    const language = detectLanguage(filePath);
    if (model) {
      model.setValue(data.content);
      monaco.editor.setModelLanguage(model, language);
    } else {
      model = monaco.editor.createModel(data.content, language, uri);
    }
    const tab = {
      id: `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      path: filePath,
      name: pathBase(filePath),
      model,
      dirty: false,
      savedVersion: model.getAlternativeVersionId(),
      language: model.getLanguageId(),
      viewState: null,
      saving: false,
      untitled: false,
    };
    this.tabs.push(tab);
    if (!restoring) this.addRecentFile(filePath);
    if (activate) {
      this.activateTab(tab);
      if (line) this.revealLine(line, column);
      if (!restoring) this.revealInTree(filePath);
    } else {
      this.renderTabs();
      this.updateEmptyState();
    }
    this.saveSession();
    if (!silent) this.logOutput(`Opened ${filePath}`, 'info');
    return tab;
  },

  newUntitled(language = 'plaintext', suggestedName = null) {
    untitledSequence += 1;
    const languageInfo = monaco.languages.getLanguages().find((item) => item.id === language);
    const extension = suggestedName ? '' : languageInfo?.extensions?.[0] || '';
    const name = suggestedName || `Untitled-${untitledSequence}${extension}`;
    const uri = monaco.Uri.parse(`inmemory://kalicode/${encodeURIComponent(name)}-${Date.now()}`);
    const model = monaco.editor.createModel('', language, uri);
    const tab = {
      id: `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      path: null,
      name,
      model,
      dirty: false,
      savedVersion: model.getAlternativeVersionId(),
      language: model.getLanguageId(),
      viewState: null,
      saving: false,
      untitled: true,
    };
    this.tabs.push(tab);
    this.activateTab(tab);
    return tab;
  },

  activateTab(tab, { focus = true } = {}) {
    if (!tab || !this.tabs.includes(tab)) return;
    if (this.activeTab === tab) {
      if (focus) this.editor.focus();
      return;
    }
    if (this.activeTab && this.editor.getModel() === this.activeTab.model) {
      this.activeTab.viewState = this.editor.saveViewState();
    }
    this.activeTab = tab;
    this.el.editorHost.hidden = false;
    this.el.welcome.hidden = true;
    this.el.tabs.classList.remove('is-empty');
    this.el.breadcrumbs.hidden = false;
    if (this.editor.getModel() !== tab.model) this.editor.setModel(tab.model);
    if (tab.viewState) {
      try {
        this.editor.restoreViewState(tab.viewState);
      } catch {
        // Ignore stale view states.
      }
    }
    this.renderTabs();
    this.renderBreadcrumbs();
    this.updateEmptyState();
    this.updateStatus();
    this.updateWindowChrome();
    this.updateRunPanel();
    this.saveSession();
    requestAnimationFrame(() => {
      this.editor.layout();
      if (focus) this.editor.focus();
    });
  },

  renderTabs() {
    this.el.tabs.classList.toggle('is-empty', !this.tabs.length);
    this.el.tabsList.innerHTML = this.tabs
      .map((tab) => {
        const active = this.activeTab?.id === tab.id;
        const title = tab.path || tab.name;
        return `<div class="editor-tab ${active ? 'active' : ''} ${tab.dirty ? 'dirty' : ''}" data-tab-id="${
          tab.id
        }" title="${escapeHtml(title)}" role="tab" aria-selected="${active}">
          ${fileBadge(tab.name)}
          <span class="tab-label">${escapeHtml(tab.name)}</span>
          ${tab.dirty ? '<span class="tab-dirty" title="Unsaved changes"></span>' : ''}
          <button class="tab-close" title="Close" aria-label="Close ${escapeHtml(tab.name)}">${icon('close')}</button>
        </div>`;
      })
      .join('');
    requestAnimationFrame(() => {
      this.el.tabsList
        .querySelector('.editor-tab.active')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  },

  renderBreadcrumbs() {
    const tab = this.activeTab;
    if (!tab) {
      this.el.breadcrumbs.innerHTML = '';
      this.el.breadcrumbs.hidden = true;
      return;
    }
    this.el.breadcrumbs.hidden = false;
    let crumbs = [];
    if (this.folder && tab.path && isInsidePath(this.folder, tab.path)) {
      const relative = relativePath(this.folder, tab.path) || '';
      const parts = relative.split('/').filter(Boolean);
      let current = this.folder;
      for (let index = 0; index < parts.length; index += 1) {
        current = joinPath(current, parts[index]);
        const isLast = index === parts.length - 1;
        crumbs.push(
          `<span class="breadcrumb-segment">${isLast ? fileBadge(tab.name) : icon('folder')}<button data-crumb-path="${
            isLast ? '__file__' : escapeHtml(current)
          }">${escapeHtml(parts[index])}</button></span>`,
        );
      }
    } else {
      crumbs = [
        `<span class="breadcrumb-segment">${fileBadge(tab.name)}<button data-crumb-path="__file__">${escapeHtml(
          tab.name,
        )}</button></span>`,
      ];
    }
    this.el.breadcrumbs.innerHTML = crumbs.join('<span class="breadcrumb-separator">›</span>');
  },

  revealLine(line, column = 1) {
    if (!this.editor.getModel()) return;
    this.editor.revealLineInCenter(Number(line) || 1);
    this.editor.setPosition({ lineNumber: Number(line) || 1, column: Number(column) || 1 });
    this.editor.focus();
  },

  async saveActive() {
    const tab = this.currentTab();
    if (!tab) {
      this.ui.toast('There is no active editor to save.', 'warning');
      return false;
    }
    return this.saveTab(tab);
  },

  async saveActiveAs() {
    const tab = this.currentTab();
    if (!tab) {
      this.ui.toast('There is no active editor to save.', 'warning');
      return false;
    }
    return this.saveTab(tab, { saveAs: true, notify: true });
  },

  async saveAllTabs({ notify = false, silent = false } = {}) {
    const dirty = this.dirtyTabs();
    if (!dirty.length) {
      if (notify) this.ui.toast('All files are already saved.', 'info', 1600);
      return true;
    }
    for (const tab of dirty) {
      const saved = await this.saveTab(tab, { silent, notify: false });
      if (!saved) return false;
    }
    if (notify) this.ui.toast('All changes saved.', 'success', 1800);
    return true;
  },

  async saveTab(tab, { saveAs = false, silent = false, notify = false } = {}) {
    if (!tab) return false;
    if (tab.saving) return false;
    tab.saving = true;
    try {
      let target = tab.path;
      if (!target || saveAs) {
        const defaultName = tab.path
          ? tab.path
          : joinPath(this.folder || this.appInfo.home || '', tab.name);
        target = await window.kali.dialog.saveFile(defaultName);
        if (!target) return false;
      }
      const collision = this.tabs.find((item) => item !== tab && item.path === target);
      if (collision) {
        this.ui.toast('That file is already open in another editor.', 'error');
        return false;
      }
      const content = tab.model.getValue();
      await window.kali.fs.writeFile(target, content);
      const oldPath = tab.path;
      if (target !== tab.path) {
        this.rekeyTabModel(tab, target, { dirty: false });
        this.addRecentFile(target);
        if (this.folder && isInsidePath(this.folder, target)) await this.revealInTree(target);
      }
      tab.dirty = false;
      tab.savedVersion = tab.model.getAlternativeVersionId();
      this.renderTabs();
      this.updateWindowChrome();
      this.updateStatus();
      this.saveSession();
      this.refreshGit(true);
      if (oldPath !== target) await this.refreshTree();
      if (target) await this.runLint(tab);
      if (notify || saveAs) {
        this.ui.toast(`Saved ${pathBase(target)}`, 'success', 1600);
      }
      if (!silent && !notify && !saveAs) this.logOutput(`Saved ${target}`, 'info');
      return true;
    } catch (error) {
      if (!silent) this.ui.toast(error.message, 'error', 5000);
      this.logOutput(`Save failed: ${error.message}`, 'error');
      return false;
    } finally {
      tab.saving = false;
    }
  },

  rekeyTabModel(tab, nextPath, { dirty = tab.dirty } = {}) {
    const oldModel = tab.model;
    const wasActive = this.activeTab === tab;
    const viewState = wasActive ? this.editor.saveViewState() : tab.viewState;
    const content = oldModel.getValue();
    const language = detectLanguage(nextPath);
    const uri = monaco.Uri.file(nextPath);
    const existing = monaco.editor.getModel(uri);
    if (existing) existing.dispose();
    const model = monaco.editor.createModel(content, language, uri);
    tab.model = model;
    tab.path = nextPath;
    tab.name = pathBase(nextPath);
    tab.language = model.getLanguageId();
    tab.untitled = false;
    tab.dirty = dirty;
    tab.savedVersion = dirty ? -1 : model.getAlternativeVersionId();
    if (wasActive) {
      this.editor.setModel(model);
      if (viewState) {
        try {
          this.editor.restoreViewState(viewState);
        } catch {
          // Ignore.
        }
      }
    }
    oldModel.dispose();
    this.renderTabs();
    this.renderBreadcrumbs();
    this.updateWindowChrome();
  },

  handleRenamed(oldPath, newPath) {
    for (const tab of [...this.tabs]) {
      if (!tab.path || !isInsidePath(oldPath, tab.path)) continue;
      const suffix = tab.path.slice(oldPath.length);
      this.rekeyTabModel(tab, `${newPath}${suffix}`, { dirty: tab.dirty });
    }
    this.settings.recentFiles = this.settings.recentFiles.map((item) =>
      isInsidePath(oldPath, item) ? `${newPath}${item.slice(oldPath.length)}` : item,
    );
    this.persistSettings();
    this.renderWelcome();
  },

  async reloadTabFromDisk(tab) {
    if (!tab.path || tab.dirty) return false;
    try {
      const data = await window.kali.fs.readFile(tab.path);
      tab.model.setValue(data.content);
      tab.savedVersion = tab.model.getAlternativeVersionId();
      tab.dirty = false;
      this.renderTabs();
      this.updateWindowChrome();
      this.updateStatus();
      return true;
    } catch (error) {
      this.logOutput(`Unable to reload ${tab.path}: ${error.message}`, 'error');
      return false;
    }
  },

  async chooseFile() {
    const files = await window.kali.dialog.openFile();
    if (!files?.length) return;
    const first = files[0];
    if (!this.folder || !isInsidePath(this.folder, first)) {
      const opened = await this.openFolder(pathDir(first));
      if (!opened) return;
    }
    for (const file of files) {
      await this.openFile(file);
    }
  },

  updateEmptyState() {
    const hasTabs = this.tabs.length > 0;
    this.el.tabs.classList.toggle('is-empty', !hasTabs);
    this.el.breadcrumbs.hidden = !hasTabs;
    this.el.welcome.hidden = hasTabs;
    this.el.editorHost.hidden = !hasTabs;
    if (!hasTabs) {
      this.activeTab = null;
      this.editor?.setModel(null);
      this.renderWelcome();
      this.renderBreadcrumbs();
    }
    this.updateWindowChrome();
    requestAnimationFrame(() => this.editor?.layout());
  },

  dirtyTabs() {
    return this.tabs.filter((tab) => tab.dirty);
  },

  async confirmUnsaved(action = 'continuing') {
    const dirty = this.dirtyTabs();
    if (!dirty.length) return true;
    const list = dirty
      .slice(0, 12)
      .map((tab) => `<li>${escapeHtml(tab.name)}</li>`)
      .join('');
    const choice = await this.ui.modal({
      title: 'Unsaved Changes',
      body: `<p class="modal-message">You have unsaved changes before ${escapeHtml(action)}.</p>
        <ul class="unsaved-list">${list}${dirty.length > 12 ? `<li>…and ${dirty.length - 12} more</li>` : ''}</ul>`,
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: "Don't Save", value: 'discard', danger: true },
        { label: 'Save All', value: 'save', primary: true },
      ],
      width: '540px',
    });
    if (choice === 'save') return this.saveAllTabs({ silent: false });
    return choice === 'discard';
  },

  async closeTab(tab, { force = false } = {}) {
    if (!tab) return true;
    if (tab.dirty && !force) {
      const choice = await this.ui.modal({
        title: 'Unsaved Changes',
        body: `<p class="modal-message">Do you want to save the changes you made to <strong>${escapeHtml(
          tab.name,
        )}</strong>?</p><p class="modal-message muted">Your changes will be lost if you don't save them.</p>`,
        actions: [
          { label: 'Cancel', value: 'cancel' },
          { label: "Don't Save", value: 'discard', danger: true },
          { label: 'Save', value: 'save', primary: true },
        ],
        width: '500px',
      });
      if (choice === 'save') {
        const saved = await this.saveTab(tab);
        if (!saved) return false;
      } else if (choice !== 'discard') {
        return false;
      }
    }
    const index = this.tabs.indexOf(tab);
    if (index === -1) return true;
    if (this.activeTab === tab) {
      this.editor.setModel(null);
      this.activeTab = null;
    }
    this.tabs.splice(index, 1);
    tab.model.dispose();
    if (!this.tabs.length) {
      this.updateEmptyState();
    } else if (!this.activeTab) {
      this.activateTab(this.tabs[Math.min(index, this.tabs.length - 1)]);
    } else {
      this.renderTabs();
    }
    this.saveSession();
    return true;
  },

  async closeTabsList(tabsToClose, { force = false } = {}) {
    const list = tabsToClose.filter((tab) => this.tabs.includes(tab));
    if (!list.length) return true;
    if (!force) {
      const dirtyList = list.filter((tab) => tab.dirty);
      if (dirtyList.length) {
        const choice = await this.ui.modal({
          title: 'Unsaved Changes',
          body: `<p class="modal-message">${dirtyList.length} editor${
            dirtyList.length === 1 ? ' has' : 's have'
          } unsaved changes.</p><p class="modal-message muted">Save them before closing?</p>`,
          actions: [
            { label: 'Cancel', value: 'cancel' },
            { label: "Don't Save", value: 'discard', danger: true },
            { label: 'Save All', value: 'save', primary: true },
          ],
          width: '500px',
        });
        if (choice === 'save') {
          for (const tab of dirtyList) {
            if (!(await this.saveTab(tab))) return false;
          }
        } else if (choice !== 'discard') {
          return false;
        }
      }
    }
    for (const tab of list) {
      const index = this.tabs.indexOf(tab);
      if (index === -1) continue;
      const wasActive = this.activeTab === tab;
      if (wasActive) this.editor.setModel(null);
      this.tabs.splice(index, 1);
      tab.model.dispose();
      if (wasActive) this.activeTab = null;
    }
    if (!this.tabs.length) this.updateEmptyState();
    else if (!this.activeTab) this.activateTab(this.tabs[Math.min(list.length, this.tabs.length - 1)]);
    else {
      this.renderTabs();
      this.renderBreadcrumbs();
    }
    this.saveSession();
    return true;
  },

  closeTabsUnderPath(target) {
    const affected = this.tabs.filter((tab) => tab.path && isInsidePath(target, tab.path));
    if (affected.length) this.closeTabsList(affected, { force: true });
  },

  async closeAllTabs({ force = false, silent = false } = {}) {
    if (!this.tabs.length) return true;
    if (!force) {
      if (!(await this.confirmUnsaved('closing all editors'))) return false;
    }
    for (const tab of this.tabs) {
      tab.model.dispose();
    }
    this.tabs = [];
    this.activeTab = null;
    this.editor.setModel(null);
    this.updateEmptyState();
    this.saveSession();
    if (!silent) this.logOutput('All editors closed', 'info');
    return true;
  },
};
