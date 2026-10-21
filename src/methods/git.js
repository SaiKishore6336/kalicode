import { monaco, detectLanguage } from '../monaco.js';
import { escapeHtml, icon } from '../ui.js';
import { fileBadge, pathBase, pathDir } from '../util.js';

export const gitMethods = {
  bindGitEvents() {
    this.el.gitRefresh.addEventListener('click', () => this.refreshGit(false));
    this.el.gitInit.addEventListener('click', () => this.initializeRepository());
    this.el.gitBranchButton.addEventListener('click', () => this.showBranchPicker());
    this.el.gitMore.addEventListener('click', () => {
      const rect = this.el.gitMore.getBoundingClientRect();
      this.showGitMoreMenu(rect.left, rect.bottom + 4);
    });
    this.el.gitMessage.addEventListener('input', () => this.updateGitCommitButton());
    this.el.gitMessage.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.commitChanges();
      }
    });
    this.el.gitCommit.addEventListener('click', () => this.commitChanges());
    this.el.gitChanges.addEventListener('click', (event) => {
      const groupAction = event.target.closest('[data-git-group-action]');
      if (groupAction) {
        event.stopPropagation();
        const kind = groupAction.dataset.gitGroupAction;
        if (kind === 'stage-all') this.stageAll();
        else if (kind === 'unstage-all') this.unstageAll();
        return;
      }
      const action = event.target.closest('[data-git-action]');
      const row = event.target.closest('.git-file-row');
      if (!row) return;
      const path = row.dataset.relative;
      const absolute = row.dataset.absolute;
      const staged = row.dataset.staged === 'true';
      const change = this.gitStatus.changes.find(
        (item) => item.path === path && (staged ? item.staged : item.unstaged),
      );
      if (!change) return;
      if (action) {
        event.stopPropagation();
        const kind = action.dataset.gitAction;
        if (kind === 'stage') this.stageChange(change.path);
        else if (kind === 'unstage') this.unstageChange(change.path);
        else if (kind === 'diff') this.openDiff(change, staged);
        return;
      }
      this.openFile(absolute).catch(() => {
        this.openDiff(change, staged);
      });
    });
    this.el.gitChanges.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('.git-file-row');
      if (!row) return;
      event.preventDefault();
      const staged = row.dataset.staged === 'true';
      const relative = row.dataset.relative;
      this.ui.contextMenu(event.clientX, event.clientY, [
        {
          label: 'Open File',
          icon: 'go-to-file',
          run: () => this.openFile(row.dataset.absolute),
        },
        {
          label: 'Open Changes',
          icon: 'diff',
          run: () => {
            const change = this.gitStatus.changes.find((item) => item.path === relative);
            if (change) this.openDiff(change, staged);
          },
        },
        { separator: true },
        {
          label: staged ? 'Unstage Changes' : 'Stage Changes',
          icon: staged ? 'remove' : 'add',
          run: () => (staged ? this.unstageChange(relative) : this.stageChange(relative)),
        },
        {
          label: 'Copy Path',
          icon: 'copy',
          run: () => this.copyPath(row.dataset.absolute),
        },
      ]);
    });
  },

  async refreshGit(silent = true) {
    if (!this.folder) {
      this.gitStatus = { isRepo: false, changes: [], branch: '', ahead: 0, behind: 0 };
      this.gitMap.clear();
      this.renderGit();
      this.updateStatus();
      this.renderTree();
      return;
    }
    const token = (this.gitStatusToken || 0) + 1;
    this.gitStatusToken = token;
    try {
      const status = await window.kali.git.status(this.folder);
      if (token !== this.gitStatusToken) return;
      if (!status.isRepo) {
        this.gitStatus = { isRepo: false, changes: [], branch: '', ahead: 0, behind: 0 };
        this.gitMap.clear();
      } else {
        this.gitStatus = {
          isRepo: true,
          changes: status.changes || [],
          branch: status.branch || 'HEAD',
          ahead: status.ahead || 0,
          behind: status.behind || 0,
        };
        this.gitMap.clear();
        for (const change of this.gitStatus.changes) {
          this.gitMap.set(change.absolute, change);
        }
      }
    } catch (error) {
      if (!silent) this.ui.toast(error.message, 'error');
      this.logOutput(`Git status failed: ${error.message}`, 'error');
    }
    this.renderGit();
    this.updateStatus();
    this.renderTree();
  },

  renderGit() {
    const hasFolder = Boolean(this.folder);
    const isRepo = Boolean(this.gitStatus.isRepo);
    this.el.gitContent.hidden = !isRepo;
    this.el.gitEmpty.hidden = isRepo && hasFolder;
    if (!hasFolder) {
      this.el.gitEmptyText.textContent = 'No folder is open.';
      this.el.gitInit.hidden = true;
    } else if (!isRepo) {
      this.el.gitEmptyText.textContent = 'This folder is not a Git repository.';
      this.el.gitInit.hidden = false;
    } else {
      this.el.gitInit.hidden = true;
    }
    const changes = this.gitStatus.changes || [];
    this.el.gitBadge.hidden = !changes.length;
    this.el.gitBadge.textContent = String(changes.length);
    this.el.gitBranchName.textContent = isRepo ? this.gitStatus.branch || 'HEAD' : '—';
    this.el.gitSync.textContent = isRepo
      ? this.gitStatus.ahead || this.gitStatus.behind
        ? `↑${this.gitStatus.ahead || 0} ↓${this.gitStatus.behind || 0}`
        : ''
      : '';
    if (!isRepo) {
      this.el.gitChanges.innerHTML = '';
      this.updateGitCommitButton();
      return;
    }
    const staged = changes.filter((change) => change.staged);
    const unstaged = changes.filter((change) => change.unstaged);
    const groups = [];
    if (staged.length) {
      groups.push(this.renderGitGroup('Staged Changes', staged, true));
    }
    if (unstaged.length) {
      groups.push(this.renderGitGroup('Changes', unstaged, false));
    }
    if (!groups.length) {
      groups.push(`<div class="git-clean"><i class="codicon codicon-check"></i><span>No changes</span></div>`);
    }
    this.el.gitChanges.innerHTML = groups.join('');
    this.updateGitCommitButton();
  },

  renderGitGroup(title, changes, staged) {
    const rows = changes
      .map((change) => {
        const status = staged ? change.x : change.y;
        const letter = status === '?' ? 'U' : status === ' ' ? 'M' : status;
        const actionIcon = staged ? 'remove' : 'add';
        const actionTitle = staged ? 'Unstage Changes' : 'Stage Changes';
        return `<div class="git-file-row" data-relative="${escapeHtml(change.path)}" data-absolute="${escapeHtml(
          change.absolute,
        )}" data-staged="${staged}">
          <button class="git-file-main" title="${escapeHtml(change.path)}">
            ${fileBadge(pathBase(change.path))}
            <span class="git-file-name">${escapeHtml(pathBase(change.path))}</span>
            <span class="git-file-dir">${escapeHtml(pathDir(change.path) === '.' ? '' : pathDir(change.path))}</span>
            <span class="git-status-letter git-${String(letter).toLowerCase()}" title="${escapeHtml(letter)}">${escapeHtml(
              letter,
            )}</span>
          </button>
          <div class="git-file-actions">
            <button data-git-action="diff" title="Open Changes">${icon('diff')}</button>
            <button data-git-action="${staged ? 'unstage' : 'stage'}" title="${actionTitle}">${icon(
              actionIcon,
            )}</button>
          </div>
        </div>`;
      })
      .join('');
    return `<div class="git-group">
      <div class="git-group-header">
        <span>${escapeHtml(title)} <span class="git-group-count">${changes.length}</span></span>
        <button data-git-group-action="${staged ? 'unstage-all' : 'stage-all'}" title="${
          staged ? 'Unstage All' : 'Stage All'
        }">${icon(staged ? 'remove' : 'add')}</button>
      </div>
      ${rows}
    </div>`;
  },

  updateGitCommitButton() {
    const hasStaged = (this.gitStatus.changes || []).some((change) => change.staged);
    const hasMessage = Boolean(this.el.gitMessage.value.trim());
    this.el.gitCommit.disabled = !(hasStaged && hasMessage);
    this.el.gitCommit.title = hasStaged
      ? hasMessage
        ? 'Commit staged changes (Ctrl+Enter)'
        : 'Enter a commit message'
      : 'Stage changes before committing';
  },

  async initializeRepository() {
    if (!this.folder) return;
    try {
      const result = await window.kali.git.init(this.folder);
      this.logOutput(result.output || 'Initialized Git repository', 'info');
      this.ui.toast('Initialized Git repository', 'success');
      await this.refreshGit(false);
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  async stageChange(relative) {
    try {
      const result = await window.kali.git.stage(this.folder, relative);
      if (!result.ok) throw new Error(result.error || 'Unable to stage file');
      await this.refreshGit(true);
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  async unstageChange(relative) {
    try {
      const result = await window.kali.git.unstage(this.folder, relative);
      if (!result.ok) throw new Error(result.error || 'Unable to unstage file');
      await this.refreshGit(true);
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  async stageAll() {
    try {
      const result = await window.kali.git.stageAll(this.folder);
      if (!result.ok) throw new Error(result.error || 'Unable to stage changes');
      await this.refreshGit(true);
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  async unstageAll() {
    try {
      const result = await window.kali.git.unstageAll(this.folder);
      if (!result.ok) throw new Error(result.error || 'Unable to unstage changes');
      await this.refreshGit(true);
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  async commitChanges() {
    if (!this.folder) return;
    const message = this.el.gitMessage.value.trim();
    if (!message) {
      this.ui.toast('Enter a commit message first.', 'warning');
      return;
    }
    try {
      this.el.gitCommit.disabled = true;
      const result = await window.kali.git.commit(this.folder, message);
      if (!result.ok) {
        this.logOutput(result.error || 'Commit failed', 'error');
        this.ui.toast(result.error || 'Commit failed', 'error', 5000);
        return;
      }
      this.logOutput(result.output || 'Committed changes', 'info');
      this.el.gitMessage.value = '';
      this.ui.toast('Changes committed', 'success');
      await this.refreshGit(true);
      this.refreshTree();
    } catch (error) {
      this.ui.toast(error.message, 'error');
    } finally {
      this.updateGitCommitButton();
    }
  },

  async showBranchPicker() {
    if (!this.folder || !this.gitStatus.isRepo) return;
    try {
      const data = await window.kali.git.branches(this.folder);
      const items = data.branches.map((branch) => ({
        label: branch,
        description: branch === data.current ? 'current branch' : 'checkout branch',
        icon: branch === data.current ? 'check' : 'git-branch',
        badge: branch === data.current ? 'Current' : '',
        run: async () => {
          if (branch === data.current) return;
          const result = await window.kali.git.checkout(this.folder, branch);
          if (!result.ok) {
            this.ui.toast(result.output || 'Checkout failed', 'error', 5000);
            this.logOutput(result.output, 'error');
            return;
          }
          this.ui.toast(`Checked out ${branch}`, 'success');
          this.refreshGit(true);
          this.refreshTree();
          this.loadProjectTasks();
        },
      }));
      items.push({ separator: true });
      items.push({
        label: 'Create new branch…',
        icon: 'add',
        run: async () => {
          const name = await this.ui.prompt({
            title: 'Create Branch',
            label: 'Branch name',
            placeholder: 'feature/my-change',
            confirmText: 'Create Branch',
          });
          if (!name) return;
          const result = await window.kali.git.createBranch(this.folder, name);
          if (!result.ok) {
            this.ui.toast(result.output || 'Unable to create branch', 'error', 5000);
            return;
          }
          this.ui.toast(`Created and checked out ${name}`, 'success');
          this.refreshGit(true);
        },
      });
      const selected = await this.ui.quickPick({
        placeholder: 'Switch Branch',
        items,
      });
      if (selected?.run) await selected.run();
    } catch (error) {
      this.ui.toast(error.message, 'error');
    }
  },

  showGitMoreMenu(x, y) {
    const hasRepo = this.gitStatus.isRepo;
    this.ui.contextMenu(x, y, [
      {
        label: 'Stage All Changes',
        icon: 'add',
        disabled: !hasRepo,
        run: () => this.stageAll(),
      },
      {
        label: 'Unstage All Changes',
        icon: 'remove',
        disabled: !hasRepo,
        run: () => this.unstageAll(),
      },
      { separator: true },
      {
        label: 'Refresh',
        icon: 'refresh',
        run: () => this.refreshGit(false),
      },
      {
        label: 'Initialize Repository',
        icon: 'repo',
        disabled: !this.folder || hasRepo,
        run: () => this.initializeRepository(),
      },
      { separator: true },
      {
        label: 'Show Git Output',
        icon: 'output',
        run: () => this.showPanel('output'),
      },
      {
        label: 'Copy Branch Name',
        icon: 'copy',
        disabled: !hasRepo,
        run: () => {
          window.kali.app.writeClipboard(this.gitStatus.branch || '');
          this.ui.toast('Branch name copied', 'success', 1500);
        },
      },
    ]);
  },

  async openDiff(change, staged = false) {
    if (!this.folder) return;
    let diff;
    try {
      diff = await window.kali.git.diff(this.folder, change.absolute, staged);
    } catch (error) {
      this.ui.toast(error.message, 'error');
      return;
    }
    const container = document.createElement('div');
    container.className = 'diff-container';
    let diffEditor = null;
    let originalModel = null;
    let modifiedModel = null;
    const modalPromise = this.ui.modal({
      title: `${pathBase(change.path)} — ${staged ? 'Staged Changes' : 'Working Tree'}`,
      body: container,
      width: 'min(1480px, 94vw)',
      className: 'modal-diff',
      actions: [{ label: 'Close', value: true }],
      onMount: () => {
        setTimeout(() => {
          if (!document.contains(container)) return;
          const language = detectLanguage(change.path);
          const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
          originalModel = monaco.editor.createModel(
            diff.original || '',
            language,
            monaco.Uri.parse(`inmemory://diff/original-${suffix}`),
          );
          modifiedModel = monaco.editor.createModel(
            diff.modified || '',
            language,
            monaco.Uri.parse(`inmemory://diff/modified-${suffix}`),
          );
          diffEditor = monaco.editor.createDiffEditor(container, {
            automaticLayout: true,
            readOnly: true,
            renderSideBySide: window.innerWidth > 1100,
            originalEditable: false,
            minimap: { enabled: false },
            fontSize: this.settings.fontSize,
            fontFamily: this.settings.fontFamily,
            scrollBeyondLastLine: false,
            padding: { top: 10, bottom: 10 },
            renderOverviewRuler: true,
            wordWrap: this.settings.wordWrap ? 'on' : 'off',
          });
          diffEditor.setModel({ original: originalModel, modified: modifiedModel });
        }, 30);
      },
    });
    await modalPromise;
    diffEditor?.dispose();
    originalModel?.dispose();
    modifiedModel?.dispose();
  },
};
