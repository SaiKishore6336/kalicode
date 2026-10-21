import { THEMES, languageOptions, languageColor } from '../monaco.js';
import { escapeHtml, icon } from '../ui.js';
import { MONACO_SHORTCUTS } from '../constants.js';

export const settingsMethods = {
  bindSettingsEvents() {
    this.el.extensionsFilter.addEventListener('input', () => this.renderExtensions());
    this.el.languageGrid.addEventListener('click', (event) => {
      const card = event.target.closest('[data-language]');
      if (!card) return;
      this.newUntitled(card.dataset.language);
      this.ui.toast(`Created a new ${card.dataset.languageName || card.dataset.language} file.`, 'info', 1800);
    });
    this.el.themeGrid.addEventListener('click', (event) => {
      const card = event.target.closest('[data-theme]');
      if (!card) return;
      this.applyTheme(card.dataset.theme);
      this.ui.toast(`Theme: ${THEMES[card.dataset.theme]?.label || card.dataset.theme}`, 'success', 1600);
    });
  },

  async openSettings() {
    const body = document.createElement('div');
    body.className = 'settings-form';
    const themeOptions = Object.values(THEMES)
      .map(
        (theme) =>
          `<option value="${theme.id}" ${theme.id === this.settings.theme ? 'selected' : ''}>${escapeHtml(
            theme.label,
          )} — ${escapeHtml(theme.kind)}</option>`,
      )
      .join('');
    body.innerHTML = `
      <div class="settings-group">
        <div class="settings-group-title">${icon('symbol-code')} Editor</div>
        <div class="settings-row">
          <label for="settings-font-family">Font family</label>
          <input id="settings-font-family" class="text-input" type="text" value="${escapeHtml(
            this.settings.fontFamily,
          )}" spellcheck="false" />
        </div>
        <div class="settings-row">
          <label for="settings-font-size">Font size</label>
          <input id="settings-font-size" class="text-input short" type="number" min="10" max="28" value="${
            this.settings.fontSize
          }" />
        </div>
        <div class="settings-row">
          <label for="settings-tab-size">Tab size</label>
          <select id="settings-tab-size" class="text-input short">
            ${[2, 4, 8]
              .map(
                (size) =>
                  `<option value="${size}" ${Number(this.settings.tabSize) === size ? 'selected' : ''}>${size}</option>`,
              )
              .join('')}
          </select>
        </div>
        <label class="settings-check"><input id="settings-insert-spaces" type="checkbox" ${
          this.settings.insertSpaces ? 'checked' : ''
        } /> Insert spaces when pressing Tab</label>
        <label class="settings-check"><input id="settings-word-wrap" type="checkbox" ${
          this.settings.wordWrap ? 'checked' : ''
        } /> Word wrap</label>
        <label class="settings-check"><input id="settings-minimap" type="checkbox" ${
          this.settings.minimap ? 'checked' : ''
        } /> Show minimap</label>
        <label class="settings-check"><input id="settings-line-numbers" type="checkbox" ${
          this.settings.lineNumbers ? 'checked' : ''
        } /> Show line numbers</label>
        <label class="settings-check"><input id="settings-auto-save" type="checkbox" ${
          this.settings.autoSave ? 'checked' : ''
        } /> Auto save after a short delay</label>
      </div>
      <div class="settings-group">
        <div class="settings-group-title">${icon('color-mode')} Appearance</div>
        <div class="settings-row">
          <label for="settings-theme">Color theme</label>
          <select id="settings-theme" class="text-input">${themeOptions}</select>
        </div>
      </div>
      <div class="settings-group">
        <div class="settings-group-title">${icon('terminal')} Terminal</div>
        <div class="settings-row">
          <label for="settings-terminal-shell">Shell path</label>
          <input id="settings-terminal-shell" class="text-input" type="text" value="${escapeHtml(
            this.settings.terminalShell,
          )}" placeholder="${escapeHtml(this.appInfo.defaultShell || '/bin/bash')}" spellcheck="false" />
        </div>
        <div class="settings-row">
          <label for="settings-terminal-font-size">Terminal font size</label>
          <input id="settings-terminal-font-size" class="text-input short" type="number" min="10" max="22" value="${
            this.settings.terminalFontSize
          }" />
        </div>
      </div>
      <div class="settings-group">
        <div class="settings-group-title">${icon('folder')} Workspace</div>
        <label class="settings-check"><input id="settings-hidden-files" type="checkbox" ${
          this.settings.hiddenFiles ? 'checked' : ''
        } /> Show hidden files in Explorer</label>
        <label class="settings-check"><input id="settings-restore-session" type="checkbox" ${
          this.settings.restoreSession ? 'checked' : ''
        } /> Restore the previous workspace and editors on startup</label>
      </div>
      <div class="settings-footer-note">
        Settings are stored in <code>${escapeHtml(this.appInfo.userData || '~/.config/KaliCode')}/settings.json</code>
        <button class="link-button" id="open-settings-file">${icon('link-external')} Open settings.json</button>
      </div>`;
    const openFileButton = body.querySelector('#open-settings-file');
    openFileButton.addEventListener('click', () => this.openSettingsFile());

    const result = await this.ui.modal({
      title: 'Settings',
      body,
      width: '760px',
      className: 'settings-modal',
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Save Settings', value: 'save', primary: true },
      ],
    });
    if (result !== 'save') return;
    const read = (id) => body.querySelector(`#${id}`);
    this.settings = {
      ...this.settings,
      fontFamily: read('settings-font-family').value.trim() || this.settings.fontFamily,
      fontSize: Number(read('settings-font-size').value) || this.settings.fontSize,
      tabSize: Number(read('settings-tab-size').value) || this.settings.tabSize,
      insertSpaces: read('settings-insert-spaces').checked,
      wordWrap: read('settings-word-wrap').checked,
      minimap: read('settings-minimap').checked,
      lineNumbers: read('settings-line-numbers').checked,
      autoSave: read('settings-auto-save').checked,
      theme: read('settings-theme').value,
      terminalShell: read('settings-terminal-shell').value.trim(),
      terminalFontSize: Number(read('settings-terminal-font-size').value) || this.settings.terminalFontSize,
      hiddenFiles: read('settings-hidden-files').checked,
      restoreSession: read('settings-restore-session').checked,
    };
    this.normalizeSettings(this.settings);
    this.applyTheme(this.settings.theme, false);
    this.applySettings();
    this.renderTree();
    if (this.terminalManager) this.terminalManager.setFont(this.settings.terminalFontSize);
    await this.persistSettings(true);
    this.ui.toast('Settings saved', 'success', 1800);
  },

  openSettingsFile() {
    window.kali.settings.open().catch((error) => this.ui.toast(error.message, 'error'));
  },

  renderExtensions() {
    if (!this.el.languageGrid) return;
    const filter = String(this.el.extensionsFilter?.value || '').trim().toLowerCase();
    const languages = languageOptions().filter((language) => {
      if (!filter) return true;
      return (
        language.label.toLowerCase().includes(filter) ||
        language.id.toLowerCase().includes(filter) ||
        language.extensions.some((extension) => extension.toLowerCase().includes(filter))
      );
    });
    this.el.extensionsCount.textContent = `${languages.length} built-in`;
    if (!languages.length) {
      this.el.languageGrid.innerHTML = `<div class="muted small extensions-empty">No matching language support.</div>`;
    } else {
      this.el.languageGrid.innerHTML = languages
        .map((language) => {
          const color = languageColor(language.id);
          const abbreviation = language.label.slice(0, 3).toUpperCase();
          return `<button class="language-card" data-language="${escapeHtml(
            language.id,
          )}" data-language-name="${escapeHtml(language.label)}" title="New ${escapeHtml(
            language.label,
          )} file">
            <span class="language-mark" style="color:${color};background:${color}20">${escapeHtml(
              abbreviation,
            )}</span>
            <span class="language-card-main">
              <span class="language-card-name">${escapeHtml(language.label)}</span>
              <span class="language-card-ext">${escapeHtml(
                language.extensions.slice(0, 3).join(' ') || language.id,
              )}</span>
            </span>
            <span class="language-card-add">${icon('add')}</span>
          </button>`;
        })
        .join('');
    }
    this.el.themeGrid.innerHTML = Object.values(THEMES)
      .map(
        (theme) => `<button class="theme-card ${theme.id === this.themeId ? 'active' : ''}" data-theme="${
          theme.id
        }">
          <span class="theme-swatch" style="background:${theme.swatch[0]}">
            <span style="background:${theme.swatch[1]}"></span>
            <span style="background:${theme.swatch[2]}"></span>
          </span>
          <span class="theme-card-main">
            <span class="theme-card-name">${escapeHtml(theme.label)} ${icon('check', 'theme-check')}</span>
            <span class="theme-card-desc">${escapeHtml(theme.description)}</span>
          </span>
        </button>`,
      )
      .join('');
  },

  async showKeyboardShortcuts() {
    const keysMarkup = (keys) =>
      String(keys)
        .split(/\s+\/\s+/)
        .map((combo) =>
          combo
            .split('+')
            .map((key) => `<kbd>${escapeHtml(key.trim())}</kbd>`)
            .join(' '),
        )
        .join(' / ');
    const commandRows = this.commands
      .filter((command) => command.keys)
      .map(
        (command) => `<tr><td><span class="shortcut-command">${escapeHtml(
          command.label,
        )}</span><span class="shortcut-category">${escapeHtml(command.category)}</span></td><td>${keysMarkup(
          command.keys,
        )}</td></tr>`,
      )
      .join('');
    const editorRows = MONACO_SHORTCUTS.map(
      ([keys, description]) =>
        `<tr><td><span class="shortcut-command">${escapeHtml(
          description,
        )}</span><span class="shortcut-category">Editor</span></td><td>${keysMarkup(keys)}</td></tr>`,
    ).join('');
    await this.ui.modal({
      title: 'Keyboard Shortcuts',
      width: '780px',
      className: 'shortcuts-modal',
      body: `<div class="shortcuts-scroll">
        <div class="shortcut-section-title">KaliCode</div>
        <table class="shortcut-table">${commandRows}</table>
        <div class="shortcut-section-title">Editor</div>
        <table class="shortcut-table">${editorRows}</table>
        <p class="muted small">Monaco also supports its standard editor shortcuts, including multi-cursor and folding commands.</p>
      </div>`,
      actions: [{ label: 'Close', value: true, primary: true }],
    });
  },

  async showAbout() {
    const logoSrc = this.el.brand.querySelector('img')?.src || '';
    const result = await this.ui.modal({
      title: 'About KaliCode',
      width: '560px',
      className: 'about-modal',
      body: `<div class="about-hero">
        <img src="${escapeHtml(logoSrc)}" alt="" />
        <div>
          <div class="about-name">KaliCode</div>
          <div class="about-version">Version ${escapeHtml(this.appInfo.appVersion || '1.0.0')}</div>
        </div>
      </div>
      <p class="about-description">A fast, Kali-native code workspace built with Monaco, Electron, and a real PTY terminal. Designed for code, shell, and source control on Linux.</p>
      <div class="about-grid">
        <span>Electron</span><code>${escapeHtml(this.appInfo.versions?.electron || '—')}</code>
        <span>Chromium</span><code>${escapeHtml(this.appInfo.versions?.chrome || '—')}</code>
        <span>Node.js</span><code>${escapeHtml(this.appInfo.versions?.node || '—')}</code>
        <span>Platform</span><code>${escapeHtml(this.appInfo.platform || 'linux')} ${escapeHtml(
          this.appInfo.arch || '',
        )}</code>
      </div>
      <p class="muted small">Built for Kali Linux. Licensed under MIT.</p>`,
      actions: [
        { label: 'Project Folder', value: 'folder' },
        { label: 'Open README', value: 'readme' },
        { label: 'Close', value: 'close', primary: true },
      ],
    });
    if (result === 'readme') {
      await window.kali.app.openPath(this.appInfo.readme);
    } else if (result === 'folder') {
      await window.kali.app.openPath(this.appInfo.projectRoot);
    }
  },
};
