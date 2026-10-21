import { escapeHtml, icon } from '../ui.js';
import {
  byId,
  fileBadge,
  folderIcon,
  isInsidePath,
  joinPath,
  pathBase,
  pathDir,
  relativePath,
} from '../util.js';

function isSafeRelativeName(name) {
  const value = String(name || '').trim();
  if (!value) return false;
  if (value.startsWith('/') || value.startsWith('\\')) return false;
  if (value.split(/[\\/]/).some((part) => part === '..')) return false;
  return true;
}

export const workspaceMethods = {
  bindWorkspaceEvents() {
    const tree = this.el.tree;
    tree.addEventListener('click', (event) => {
      const row = event.target.closest('.tree-row');
      if (!row) return;
      this.treeSelectedPath = row.dataset.path;
      this.treeSelectedType = row.dataset.type;
      if (row.dataset.type === 'dir') {
        this.toggleDir(row.dataset.path);
      } else {
        this.openFile(row.dataset.path);
      }
    });
    tree.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('.tree-row');
      event.preventDefault();
      if (row) {
        this.treeSelectedPath = row.dataset.path;
        this.treeSelectedType = row.dataset.type;
        this.showTreeMenu(event.clientX, event.clientY, row.dataset.path, row.dataset.type);
      } else if (this.folder) {
        this.ui.contextMenu(event.clientX, event.clientY, [
          { label: 'New File…', icon: 'new-file', run: () => this.newFileHere() },
          { label: 'New Folder…', icon: 'new-folder', run: () => this.newFolderHere() },
          { separator: true },
          { label: 'Refresh Explorer', icon: 'refresh', run: () => this.refreshTree() },
          {
            label: 'Reveal Workspace in File Manager',
            icon: 'folder-opened',
            run: () => window.kali.app.openPath(this.folder),
          },
          { separator: true },
          { label: 'Close Folder', icon: 'close', run: () => this.closeFolder() },
        ]);
      }
    });
    tree.addEventListener('keydown', (event) => {
      const row = event.target.closest('.tree-row');
      if (!row) return;
      const path = row.dataset.path;
      const type = row.dataset.type;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (type === 'dir') this.toggleDir(path);
        else this.openFile(path);
      } else if (event.key === 'ArrowRight' && type === 'dir') {
        event.preventDefault();
        if (!this.expanded.has(path)) this.toggleDir(path);
      } else if (event.key === 'ArrowLeft' && type === 'dir') {
        event.preventDefault();
        if (this.expanded.has(path)) this.toggleDir(path);
      }
    });
  },

  async restoreStartup() {
    this.startupRestoring = true;
    try {
      const launchPaths = await window.kali.app.getLaunchPaths();
      if (Array.isArray(launchPaths) && launchPaths.length) {
        await this.openLaunchPaths(launchPaths, { force: true, silent: true });
        return;
      }
      if (this.settings.restoreSession && this.settings.session?.folder) {
        const session = this.settings.session;
        const folder = session.folder;
        const exists = await window.kali.fs.exists(folder);
        if (exists) {
          await this.openFolder(folder, { force: true, silent: true, restoring: true });
          const files = Array.isArray(session.files) ? session.files.slice(0, 25) : [];
          for (const file of files) {
            if (await window.kali.fs.exists(file)) {
              await this.openFile(file, { activate: false, silent: true, restoring: true });
            }
          }
          const activePath = session.active;
          const active = this.tabs.find((tab) => tab.path === activePath);
          if (active) this.activateTab(active);
          else if (this.tabs.length) this.activateTab(this.tabs[this.tabs.length - 1]);
        } else {
          this.settings.session = null;
          this.persistSettings();
        }
      }
    } finally {
      this.startupRestoring = false;
      this.updateEmptyState();
      this.updateWindowChrome();
      this.updateStatus();
    }
  },

  async openLaunchPaths(paths, { force = false, silent = false } = {}) {
    const stats = await Promise.all(
      paths.map(async (target) => ({
        target,
        stat: await window.kali.fs.stat(target).catch(() => null),
      })),
    );
    const valid = stats.filter((entry) => entry.stat);
    if (!valid.length) {
      this.ui.toast('The requested path could not be opened.', 'error');
      return;
    }
    const directory = valid.find((entry) => entry.stat.isDirectory);
    const firstFile = valid.find((entry) => entry.stat.isFile);
    const folder = directory?.target || (firstFile ? pathDir(firstFile.target) : null);
    if (folder) {
      const opened = await this.openFolder(folder, { force, silent: true });
      if (!opened) return;
    }
    for (const entry of valid) {
      if (!entry.stat.isFile) continue;
      await this.openFile(entry.target, { silent: true, activate: false });
    }
    if (this.tabs.length) this.activateTab(this.tabs[this.tabs.length - 1]);
    else this.updateEmptyState();
    if (!silent) {
      this.ui.toast(
        folder ? `Opened ${pathBase(folder)}` : 'Opened file',
        'success',
        1800,
      );
    }
  },

  async handleIncomingPaths(paths) {
    await this.openLaunchPaths(paths, { force: false, silent: false });
  },

  async openPathFromUI(target) {
    if (!target) return;
    const stat = await window.kali.fs.stat(target).catch(() => null);
    if (!stat) {
      this.ui.toast('That file or folder no longer exists.', 'error');
      return;
    }
    if (stat.isDirectory) {
      await this.openFolder(target);
      return;
    }
    const parent = pathDir(target);
    if (!this.folder || !isInsidePath(this.folder, target)) {
      const opened = await this.openFolder(parent);
      if (!opened) return;
    }
    await this.openFile(target);
  },

  async chooseFolder() {
    const folder = await window.kali.dialog.openFolder();
    if (folder) await this.openFolder(folder);
  },

  async openFolder(folder, { force = false, silent = false, restoring = false } = {}) {
    if (!folder) return false;
    if (this.folder === folder) {
      this.updateWorkspaceUI();
      return true;
    }
    if (this.folder && !force) {
      const proceed = await this.confirmUnsaved('opening another folder');
      if (!proceed) return false;
    }
    await this.closeAllTabs({ force: true, silent: true });
    this.folder = folder;
    this.treeCache.clear();
    this.expanded.clear();
    this.treeSelectedPath = null;
    this.treeSelectedType = null;
    this.workspaceCollapsed = false;
    this.el.tree.hidden = false;
    this.el.workspaceToggle.innerHTML = icon('chevron-down');
    this.gitStatus = { isRepo: false, changes: [], branch: '', ahead: 0, behind: 0 };
    this.gitMap.clear();
    this.tasks = [];
    this.searchState.results = [];
    this.searchState.count = 0;
    this.el.searchInput.value = '';
    this.el.replaceInput.value = '';
    this.el.searchResults.innerHTML = '';
    this.el.searchSummary.textContent = '';
    this.setWorkspaceUI();
    await this.loadTreeRoot();
    await window.kali.fs.watch(folder);
    this.refreshGit(true);
    this.loadProjectTasks();
    this.refreshFileIndex();
    this.addRecentFolder(folder);
    this.saveSession();
    this.renderWelcome();
    if (this.terminalManager) {
      this.terminalManager.reset(folder).catch((error) => this.logOutput(error.message, 'error'));
    }
    this.updateEmptyState();
    this.updateWindowChrome();
    if (!silent && !restoring) {
      this.ui.toast(`Opened folder: ${pathBase(folder)}`, 'success', 2000);
    }
    return true;
  },

  async closeFolder() {
    if (!this.folder) return;
    const proceed = await this.confirmUnsaved('closing the folder');
    if (!proceed) return;
    await this.closeAllTabs({ force: true, silent: true });
    await window.kali.fs.unwatch().catch(() => {});
    this.folder = null;
    this.treeCache.clear();
    this.expanded.clear();
    this.treeSelectedPath = null;
    this.gitStatus = { isRepo: false, changes: [], branch: '', ahead: 0, behind: 0 };
    this.gitMap.clear();
    this.tasks = [];
    this.quickFiles = [];
    this.quickFilesFolder = null;
    this.el.tree.innerHTML = '';
    this.el.searchResults.innerHTML = '';
    this.el.searchSummary.textContent = '';
    this.el.searchInput.value = '';
    this.el.replaceInput.value = '';
    this.setWorkspaceUI();
    this.updateEmptyState();
    this.updateStatus();
    this.renderWelcome();
    this.saveSession();
    this.ui.toast('Folder closed', 'info', 1600);
  },

  setWorkspaceUI() {
    const name = this.folder ? pathBase(this.folder) : 'NO FOLDER OPEN';
    this.el.workspaceName.textContent = name;
    this.el.workspaceName.title = this.folder || '';
    this.el.workspaceClose.hidden = !this.folder;
    this.el.explorerEmpty.hidden = Boolean(this.folder);
    this.el.tree.hidden = !this.folder || this.workspaceCollapsed;
    if (!this.folder) this.el.tree.innerHTML = '';
    this.el.statusFolder.textContent = this.folder ? pathBase(this.folder) : 'no folder';
    this.updateWindowChrome();
  },

  async loadTreeRoot() {
    if (!this.folder) {
      this.treeCache.clear();
      this.renderTree();
      return;
    }
    this.treeLoading = this.treeLoading || new Set();
    this.treeLoading.add(this.folder);
    this.renderTree();
    try {
      const items = await window.kali.fs.readDir(this.folder);
      this.treeCache.set(this.folder, items);
    } catch (error) {
      this.ui.toast(`Unable to read folder: ${error.message}`, 'error');
    } finally {
      this.treeLoading.delete(this.folder);
    }
    this.renderTree();
  },

  async loadDir(directory, { render = true } = {}) {
    this.treeLoading = this.treeLoading || new Set();
    this.treeLoading.add(directory);
    if (render) this.renderTree();
    try {
      const items = await window.kali.fs.readDir(directory);
      this.treeCache.set(directory, items);
    } catch (error) {
      this.ui.toast(`Unable to open ${pathBase(directory)}: ${error.message}`, 'error');
      this.expanded.delete(directory);
    } finally {
      this.treeLoading.delete(directory);
    }
    if (render) this.renderTree();
  },

  async refreshTree() {
    if (!this.folder) {
      this.renderTree();
      return;
    }
    this.treeLoading = this.treeLoading || new Set();
    const directories = [this.folder, ...this.expanded].filter((directory) =>
      isInsidePath(this.folder, directory),
    );
    for (const directory of directories) this.treeLoading.add(directory);
    const results = await Promise.allSettled(
      directories.map(async (directory) => ({
        directory,
        items: await window.kali.fs.readDir(directory),
      })),
    );
    results.forEach((result, index) => {
      const directory = directories[index];
      this.treeLoading.delete(directory);
      if (result.status === 'fulfilled') {
        this.treeCache.set(directory, result.value.items);
      } else if (directory !== this.folder) {
        this.treeCache.delete(directory);
        this.expanded.delete(directory);
      }
    });
    this.renderTree();
  },

  async toggleDir(directory) {
    if (this.expanded.has(directory)) {
      this.expanded.delete(directory);
      this.renderTree();
      return;
    }
    this.expanded.add(directory);
    if (!this.treeCache.has(directory)) {
      this.renderTree();
      await this.loadDir(directory);
    } else {
      this.renderTree();
    }
  },

  renderTree() {
    if (!this.folder) {
      this.el.tree.innerHTML = '';
      return;
    }
    this.treeLoading = this.treeLoading || new Set();
    const items = this.treeCache.get(this.folder);
    if (!items) {
      this.el.tree.innerHTML = `<div class="tree-loading"><i class="codicon codicon-loading codicon-modifier-spin"></i> Loading workspace…</div>`;
      return;
    }
    const filtered = items.filter((item) => this.isTreeItemVisible(item));
    if (!filtered.length) {
      this.el.tree.innerHTML = `<div class="tree-empty">${icon('folder')} This folder is empty</div>`;
      return;
    }
    const html = this.renderTreeLevel(this.folder, 0);
    this.el.tree.innerHTML = html;
    const active = this.activeTab?.path;
    if (active) {
      requestAnimationFrame(() => {
        this.el.tree.querySelector(`.tree-row.active`)?.scrollIntoView({ block: 'nearest' });
      });
    }
  },

  isTreeItemVisible(item) {
    if (item.name === '.git') return false;
    if (item.hidden && !this.settings.hiddenFiles) return false;
    return true;
  },

  renderTreeLevel(directory, depth) {
    const items = (this.treeCache.get(directory) || []).filter((item) => this.isTreeItemVisible(item));
    return items
      .map((item) => {
        const expanded = item.isDirectory && this.expanded.has(item.path);
        const active = !item.isDirectory && this.activeTab?.path === item.path;
        const selected = this.treeSelectedPath === item.path;
        const git = !item.isDirectory ? this.gitMap.get(item.path) : null;
        const padding = 6 + depth * 14;
        const chevron = item.isDirectory
          ? `<span class="tree-chevron">${icon(expanded ? 'chevron-down' : 'chevron-right')}</span>`
          : '<span class="tree-chevron tree-chevron-empty"></span>';
        const iconMarkup = item.isDirectory
          ? folderIcon(expanded, 'tree-folder-icon')
          : fileBadge(item.name);
        const gitMarkup = git
          ? `<span class="tree-git git-${String(git.status).toLowerCase()}" title="${escapeHtml(git.status)}">${escapeHtml(git.status)}</span>`
          : '';
        const row = `<div class="tree-row ${active ? 'active' : ''} ${selected ? 'selected' : ''} ${
          item.hidden ? 'is-hidden' : ''
        }" style="padding-left:${padding}px" data-path="${escapeHtml(item.path)}" data-type="${
          item.isDirectory ? 'dir' : 'file'
        }" tabindex="0" title="${escapeHtml(item.path)}">
          ${chevron}${iconMarkup}<span class="tree-label">${escapeHtml(item.name)}</span>${gitMarkup}
        </div>`;
        if (!item.isDirectory || !expanded) return row;
        let children;
        if (this.treeLoading.has(item.path) && !this.treeCache.has(item.path)) {
          children = `<div class="tree-loading" style="padding-left:${padding + 22}px"><i class="codicon codicon-loading codicon-modifier-spin"></i> Loading…</div>`;
        } else {
          const childItems = (this.treeCache.get(item.path) || []).filter((child) =>
            this.isTreeItemVisible(child),
          );
          children = childItems.length
            ? this.renderTreeLevel(item.path, depth + 1)
            : `<div class="tree-empty compact" style="padding-left:${padding + 22}px">Empty folder</div>`;
        }
        return `${row}${children}`;
      })
      .join('');
  },

  async revealInTree(target) {
    if (!this.folder || !isInsidePath(this.folder, target)) return;
    const relative = relativePath(this.folder, target);
    if (relative === null) return;
    const parts = relative.split('/');
    let current = this.folder;
    if (!this.treeCache.has(current)) await this.loadDir(current, { render: false });
    for (let index = 0; index < parts.length - 1; index += 1) {
      current = joinPath(current, parts[index]);
      this.expanded.add(current);
      if (!this.treeCache.has(current)) {
        await this.loadDir(current, { render: false });
      }
    }
    this.treeSelectedPath = target;
    this.treeSelectedType = 'file';
    this.renderTree();
    requestAnimationFrame(() => {
      const row = [...this.el.tree.querySelectorAll('.tree-row')].find(
        (node) => node.dataset.path === target,
      );
      row?.scrollIntoView({ block: 'nearest' });
      row?.classList.add('active');
    });
  },

  showTreeMenu(x, y, target, type) {
    const directory = type === 'dir' ? target : pathDir(target);
    this.ui.contextMenu(x, y, [
      {
        label: type === 'dir' ? 'New File…' : 'Open',
        icon: type === 'dir' ? 'new-file' : 'go-to-file',
        run: () => (type === 'dir' ? this.newFileHere(target) : this.openFile(target)),
      },
      { label: 'New Folder…', icon: 'new-folder', run: () => this.newFolderHere(directory) },
      { separator: true },
      { label: 'Rename…', icon: 'edit', keys: 'F2', run: () => this.renamePath(target, type) },
      { label: 'Move to Trash', icon: 'trash', danger: true, run: () => this.deletePath(target, type) },
      { separator: true },
      { label: 'Reveal in File Manager', icon: 'folder-opened', run: () => window.kali.app.showItem(target) },
      { label: 'Copy Path', icon: 'copy', run: () => this.copyPath(target) },
      {
        label: 'Open in Terminal',
        icon: 'terminal',
        run: () => this.openInTerminalAt(directory),
      },
      { separator: true },
      { label: 'Refresh Explorer', icon: 'refresh', run: () => this.refreshTree() },
    ]);
  },

  getCreationBase(preferred = null) {
    if (preferred) return preferred;
    if (this.treeSelectedPath) {
      return this.treeSelectedType === 'dir'
        ? this.treeSelectedPath
        : pathDir(this.treeSelectedPath);
    }
    return this.folder;
  },

  async newFileHere(preferred = null) {
    if (!this.folder) {
      this.ui.toast('Open a folder first.', 'warning');
      return;
    }
    const base = this.getCreationBase(preferred);
    const name = await this.ui.prompt({
      title: 'New File',
      label: `Create a file in ${pathBase(base) || base}`,
      placeholder: 'example.py',
      confirmText: 'Create File',
      help: 'You can include a relative path, for example src/main.py',
    });
    if (!name) return;
    if (!isSafeRelativeName(name)) {
      this.ui.toast('Enter a relative file name without "..".', 'error');
      return;
    }
    const target = joinPath(base, name);
    try {
      await window.kali.fs.createFile(target);
      await this.refreshTree();
      this.addRecentFile(target);
      await this.openFile(target);
      this.ui.toast(`Created ${name}`, 'success', 1600);
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  async newFolderHere(preferred = null) {
    if (!this.folder) {
      this.ui.toast('Open a folder first.', 'warning');
      return;
    }
    const base = this.getCreationBase(preferred);
    const name = await this.ui.prompt({
      title: 'New Folder',
      label: `Create a folder in ${pathBase(base) || base}`,
      placeholder: 'new-folder',
      confirmText: 'Create Folder',
    });
    if (!name) return;
    if (!isSafeRelativeName(name)) {
      this.ui.toast('Enter a relative folder name without "..".', 'error');
      return;
    }
    const target = joinPath(base, name);
    try {
      await window.kali.fs.createDir(target);
      this.expanded.add(pathDir(target));
      await this.refreshTree();
      this.treeSelectedPath = target;
      this.treeSelectedType = 'dir';
      this.renderTree();
      this.ui.toast(`Created folder ${name}`, 'success', 1600);
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  async renamePath(target, type) {
    const currentName = pathBase(target);
    const name = await this.ui.prompt({
      title: `Rename ${type === 'dir' ? 'Folder' : 'File'}`,
      label: 'New name',
      value: currentName,
      confirmText: 'Rename',
    });
    if (!name || name === currentName) return;
    if (!isSafeRelativeName(name)) {
      this.ui.toast('Enter a relative name without "..".', 'error');
      return;
    }
    const next = joinPath(pathDir(target), name);
    try {
      await window.kali.fs.rename(target, next);
      this.handleRenamed(target, next);
      await this.refreshTree();
      this.addRecentFile(next);
      this.ui.toast(`Renamed to ${name}`, 'success', 1600);
      this.refreshGit(true);
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  async deletePath(target, type) {
    const name = pathBase(target);
    const ok = await this.ui.confirm({
      title: `Delete ${type === 'dir' ? 'Folder' : 'File'}`,
      message: `Move "${name}" to the trash? This cannot be undone from KaliCode.`,
      confirmText: 'Move to Trash',
      danger: true,
    });
    if (!ok) return;
    try {
      await window.kali.fs.trash(target);
      this.closeTabsUnderPath(target);
      if (isInsidePath(target, this.treeSelectedPath || '')) this.treeSelectedPath = null;
      if (this.expanded.has(target)) this.expanded.delete(target);
      for (const directory of [...this.expanded]) {
        if (isInsidePath(target, directory)) this.expanded.delete(directory);
      }
      await this.refreshTree();
      this.refreshGit(true);
      this.ui.toast(`${type === 'dir' ? 'Folder' : 'File'} moved to trash`, 'success', 1800);
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  copyPath(target) {
    window.kali.app.writeClipboard(target);
    this.ui.toast('Path copied to clipboard', 'success', 1600);
  },

  async openInTerminalAt(directory) {
    this.showPanel('terminal');
    await this.ensureTerminal();
    if (!this.terminalManager) return;
    const target = directory || this.folder || this.appInfo.home;
    this.terminalManager.run(`cd ${this.shellQuote(target)}`);
  },

  shellQuote(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
  },

  addRecentFolder(folder) {
    if (!folder) return;
    this.settings.recentFolders = [
      folder,
      ...this.settings.recentFolders.filter((item) => item !== folder),
    ].slice(0, 10);
    this.persistSettings();
    this.renderWelcome();
  },

  addRecentFile(file) {
    if (!file) return;
    this.settings.recentFiles = [
      file,
      ...this.settings.recentFiles.filter((item) => item !== file),
    ].slice(0, 12);
    this.persistSettings();
    this.renderWelcome();
  },

  renderWelcome() {
    if (!this.el.recentFolders || !this.el.recentFiles) return;
    const folders = this.settings.recentFolders || [];
    const files = this.settings.recentFiles || [];
    if (!folders.length) {
      this.el.recentFolders.innerHTML = '<span class="muted small">No recent folders yet.</span>';
    } else {
      this.el.recentFolders.innerHTML = folders
        .slice(0, 6)
        .map(
          (folder) => `<button class="recent-item" data-recent-folder="${escapeHtml(folder)}" title="${escapeHtml(folder)}">
            ${icon('folder', 'recent-icon')}
            <span class="recent-main">
              <span class="recent-name">${escapeHtml(pathBase(folder))}</span>
              <span class="recent-path">${escapeHtml(pathDir(folder))}</span>
            </span>
          </button>`,
        )
        .join('');
    }
    if (!files.length) {
      this.el.recentFiles.innerHTML = '<span class="muted small">No recent files yet.</span>';
    } else {
      this.el.recentFiles.innerHTML = files
        .slice(0, 6)
        .map(
          (file) => `<button class="recent-item" data-recent-file="${escapeHtml(file)}" title="${escapeHtml(file)}">
            ${fileBadge(pathBase(file))}
            <span class="recent-main">
              <span class="recent-name">${escapeHtml(pathBase(file))}</span>
              <span class="recent-path">${escapeHtml(pathDir(file))}</span>
            </span>
          </button>`,
        )
        .join('');
    }
  },

  async refreshFileIndex() {
    if (!this.folder) {
      this.quickFiles = [];
      this.quickFilesFolder = null;
      return;
    }
    const folder = this.folder;
    try {
      const result = await window.kali.fs.listFiles(folder);
      if (this.folder !== folder) return;
      this.quickFiles = (result.files || []).map((relative) => ({
        relative,
        path: joinPath(folder, relative),
      }));
      this.quickFilesFolder = folder;
      if (result.truncated) {
        this.logOutput('Quick Open index was truncated at 30,000 files.', 'warning');
      }
    } catch (error) {
      this.logOutput(`Unable to index workspace: ${error.message}`, 'warning');
    }
  },
};
