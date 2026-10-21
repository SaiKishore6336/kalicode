import { escapeHtml, icon } from '../ui.js';
import { fileBadge, pathBase, pathDir } from '../util.js';

export const searchMethods = {
  bindSearchEvents() {
    const debouncedSearch = () => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.searchTimer = null;
        this.runSearch();
      }, 350);
    };
    this.el.searchInput.addEventListener('input', () => {
      this.searchState.query = this.el.searchInput.value;
      debouncedSearch();
    });
    this.el.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (this.searchTimer) clearTimeout(this.searchTimer);
        this.runSearch();
      }
    });
    this.el.replaceInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.replaceAll();
      }
    });
    const bindToggle = (element, key) => {
      element.addEventListener('click', () => {
        this.searchState[key] = !this.searchState[key];
        element.classList.toggle('active', this.searchState[key]);
        element.setAttribute('aria-pressed', String(this.searchState[key]));
        this.runSearch();
      });
    };
    bindToggle(this.el.searchCase, 'matchCase');
    bindToggle(this.el.searchWord, 'wholeWord');
    bindToggle(this.el.searchRegex, 'isRegex');
    this.el.searchClear.addEventListener('click', () => this.clearSearch());
    this.el.searchRefresh.addEventListener('click', () => this.runSearch());
    this.el.btnReplaceAll.addEventListener('click', () => this.replaceAll());
    this.el.searchResults.addEventListener('click', (event) => {
      const header = event.target.closest('.search-file-header');
      const match = event.target.closest('.search-match');
      if (match) {
        this.openFile(match.dataset.file, {
          line: Number(match.dataset.line),
          column: Number(match.dataset.column),
        }).then((tab) => {
          if (tab) this.revealLine(Number(match.dataset.line), Number(match.dataset.column));
        });
        return;
      }
      if (header) header.parentElement.classList.toggle('collapsed');
    });
  },

  focusSearch(focusReplace = false) {
    this.setSidebarView('search');
    requestAnimationFrame(() => {
      if (focusReplace) {
        this.el.replaceInput.focus();
        this.el.replaceInput.select();
      } else {
        this.el.searchInput.focus();
        this.el.searchInput.select();
      }
    });
  },

  clearSearch() {
    this.searchState.results = [];
    this.searchState.count = 0;
    this.searchState.query = '';
    this.el.searchInput.value = '';
    this.el.replaceInput.value = '';
    this.el.searchSummary.textContent = '';
    this.el.btnReplaceAll.disabled = true;
    this.el.searchResults.innerHTML = this.emptySearchMarkup(
      this.folder ? 'Search across your workspace.' : 'Open a folder to search.',
      this.folder
        ? 'Use the toggles for case, whole word, and regex.'
        : 'Search runs across every text file in the open folder.',
    );
  },

  emptySearchMarkup(message, hint) {
    return `<div class="empty-state compact">
      <i class="codicon codicon-search empty-icon"></i>
      <p>${escapeHtml(message)}</p>
      <span class="muted small">${escapeHtml(hint)}</span>
    </div>`;
  },

  async runSearch() {
    const query = this.el.searchInput.value.trim();
    this.searchState.query = query;
    this.searchState.matchCase = this.el.searchCase.getAttribute('aria-pressed') === 'true';
    this.searchState.wholeWord = this.el.searchWord.getAttribute('aria-pressed') === 'true';
    this.searchState.isRegex = this.el.searchRegex.getAttribute('aria-pressed') === 'true';
    if (!query) {
      this.clearSearch();
      return;
    }
    if (!this.folder) {
      this.el.searchResults.innerHTML = this.emptySearchMarkup(
        'Open a folder to search.',
        'Use File → Open Folder to get started.',
      );
      this.el.searchSummary.textContent = '';
      return;
    }
    const requestId = (this.searchState.requestId || 0) + 1;
    this.searchState.requestId = requestId;
    this.searchState.busy = true;
    this.el.searchSummary.innerHTML = `${icon('loading', 'codicon-modifier-spin')} Searching…`;
    this.el.btnReplaceAll.disabled = true;
    try {
      const result = await window.kali.fs.search(this.folder, {
        query,
        matchCase: this.searchState.matchCase,
        wholeWord: this.searchState.wholeWord,
        isRegex: this.searchState.isRegex,
      });
      if (requestId !== this.searchState.requestId) return;
      if (result.error) {
        this.el.searchSummary.textContent = result.error;
        this.el.searchResults.innerHTML = this.emptySearchMarkup(
          'Invalid search pattern',
          result.error,
        );
        return;
      }
      this.searchState.results = result.files || [];
      this.searchState.count = result.count || 0;
      this.searchState.truncated = Boolean(result.truncated);
      this.searchState.busy = false;
      this.renderSearchResults();
      this.el.btnReplaceAll.disabled = this.searchState.count === 0;
    } catch (error) {
      if (requestId !== this.searchState.requestId) return;
      this.searchState.busy = false;
      this.el.searchSummary.textContent = error.message;
      this.el.searchResults.innerHTML = this.emptySearchMarkup('Search failed', error.message);
    }
  },

  renderSearchResults() {
    const { results, count, truncated } = this.searchState;
    const fileCount = results.length;
    if (!fileCount) {
      this.el.searchSummary.textContent = 'No results found';
      this.el.searchResults.innerHTML = this.emptySearchMarkup(
        'No results found.',
        'Try a different query or search option.',
      );
      return;
    }
    this.el.searchSummary.textContent = `${count} result${count === 1 ? '' : 's'} in ${fileCount} file${
      fileCount === 1 ? '' : 's'
    }${truncated ? ' · limited' : ''}`;
    this.el.searchResults.innerHTML = results
      .map((file) => {
        const relativeDir = pathDir(file.relative);
        return `<div class="search-file-group" data-file="${escapeHtml(file.relative)}">
          <div class="search-file-header" role="button" tabindex="0">
            ${icon('chevron-down', 'search-file-chevron')}
            ${fileBadge(pathBase(file.relative))}
            <span class="search-file-name">${escapeHtml(pathBase(file.relative))}</span>
            <span class="search-file-dir">${escapeHtml(relativeDir === '.' ? '' : relativeDir)}</span>
            <span class="search-file-count">${file.matches.length}</span>
          </div>
          <div class="search-file-matches">
            ${file.matches
              .map(
                (match) => `<button class="search-match" data-file="${escapeHtml(
                  file.path,
                )}" data-line="${match.line}" data-column="${match.column}">
                  <span class="search-line-number">${match.line}</span>
                  <span class="search-preview">${this.highlightSearchMatch(match)}</span>
                </button>`,
              )
              .join('')}
          </div>
        </div>`;
      })
      .join('');
  },

  highlightSearchMatch(match) {
    const text = String(match.text || '');
    const start = Math.max(0, Number(match.column || 1) - 1);
    const end = Math.min(text.length, start + Math.max(1, Number(match.length || 1)));
    return `${escapeHtml(text.slice(0, start))}<mark>${escapeHtml(
      text.slice(start, end),
    )}</mark>${escapeHtml(text.slice(end))}`;
  },

  async replaceAll() {
    const query = this.el.searchInput.value.trim();
    if (!query) {
      this.ui.toast('Enter a search query first.', 'warning');
      return;
    }
    if (!this.folder) {
      this.ui.toast('Open a folder first.', 'warning');
      return;
    }
    const replace = this.el.replaceInput.value;
    const ok = await this.ui.confirm({
      title: 'Replace All',
      message: `Replace ${this.searchState.count || 'all'} match${
        this.searchState.count === 1 ? '' : 'es'
      } across the workspace? This writes directly to files on disk.`,
      confirmText: 'Replace All',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await window.kali.fs.replaceAll(this.folder, {
        query,
        replace,
        matchCase: this.searchState.matchCase,
        wholeWord: this.searchState.wholeWord,
        isRegex: this.searchState.isRegex,
      });
      this.logOutput(
        `Replaced ${result.count} occurrence${result.count === 1 ? '' : 's'} in ${
          result.files.length
        } file${result.files.length === 1 ? '' : 's'}.`,
        'info',
      );
      for (const changed of result.files) {
        const tab = this.tabs.find((item) => item.path === changed.path);
        if (tab && !tab.dirty) {
          await this.reloadTabFromDisk(tab);
        }
      }
      this.ui.toast(
        `Replaced ${result.count} occurrence${result.count === 1 ? '' : 's'}.`,
        'success',
        2500,
      );
      await this.refreshTree();
      this.refreshGit(true);
      this.refreshFileIndex();
      await this.runSearch();
    } catch (error) {
      this.ui.toast(error.message, 'error', 5000);
      this.logOutput(`Replace failed: ${error.message}`, 'error');
    }
  },
};
