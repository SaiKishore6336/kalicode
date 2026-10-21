const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}

export function icon(name, className = '') {
  return `<i class="codicon codicon-${name} ${className}"></i>`;
}

export function fuzzyScore(query, target) {
  if (!query) return 1;
  const needle = query.toLowerCase();
  const haystack = String(target || '').toLowerCase();
  let score = 0;
  let index = 0;
  let previous = -2;
  for (let position = 0; position < needle.length; position += 1) {
    const found = haystack.indexOf(needle[position], index);
    if (found === -1) return -Infinity;
    score += 12;
    if (found === previous + 1) score += 14;
    if (found === 0 || /[\s/_.-]/.test(haystack[found - 1] || '')) score += 9;
    score -= Math.max(0, found - index) * 0.2;
    previous = found;
    index = found + 1;
  }
  score -= Math.max(0, haystack.length - needle.length) * 0.015;
  return score;
}

function isTypingTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  );
}

export class UI {
  constructor() {
    this.overlayRoot = document.getElementById('overlay-root');
    this.menuRoot = document.getElementById('menu-root');
    this.toastContainer = document.getElementById('toast-container');
    this.activeOverlay = null;
    this.activeModal = null;
    this.activeMenu = null;
    this.previousFocus = null;
  }

  isOverlayOpen() {
    return Boolean(this.activeOverlay || this.activeModal || this.activeMenu);
  }

  isModalOpen() {
    return Boolean(this.activeModal);
  }

  toast(message, type = 'info', timeout = 3600) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconName =
      type === 'success'
        ? 'pass-filled'
        : type === 'error'
          ? 'error'
          : type === 'warning'
            ? 'warning'
            : 'info';
    toast.innerHTML = `${icon(iconName)}<span>${escapeHtml(message)}</span><button class="toast-close" title="Dismiss">${icon('close')}</button>`;
    this.toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    const remove = () => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 180);
    };
    toast.querySelector('.toast-close').addEventListener('click', remove);
    if (timeout > 0) setTimeout(remove, timeout);
    while (this.toastContainer.children.length > 5) this.toastContainer.firstElementChild.remove();
    return remove;
  }

  quickPick({ placeholder = 'Type to filter…', items = [], emptyText = 'No matching results', footer, initialQuery = '' }) {
    this.closeOverlays();
    this.previousFocus = document.activeElement;
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ui-overlay quick-pick-overlay';
      overlay.innerHTML = `
        <div class="quick-pick" role="dialog" aria-label="${escapeHtml(placeholder)}">
          <div class="quick-pick-input-row">
            ${icon('search')}
            <input class="quick-pick-input" type="text" spellcheck="false" autocomplete="off" placeholder="${escapeHtml(placeholder)}" />
          </div>
          <div class="quick-pick-list" role="listbox"></div>
          <div class="quick-pick-footer">
            <span>${footer || '↑↓ Navigate &nbsp; ↵ Select &nbsp; Esc Close'}</span>
            <span class="quick-pick-count"></span>
          </div>
        </div>`;
      this.overlayRoot.appendChild(overlay);
      this.activeOverlay = overlay;

      const input = overlay.querySelector('.quick-pick-input');
      const list = overlay.querySelector('.quick-pick-list');
      const count = overlay.querySelector('.quick-pick-count');
      let selected = 0;
      let filtered = [];

      const close = (value = null) => {
        if (!this.activeOverlay) return;
        overlay.remove();
        this.activeOverlay = null;
        document.removeEventListener('keydown', onKeyDown, true);
        if (this.previousFocus && document.contains(this.previousFocus)) {
          this.previousFocus.focus({ preventScroll: true });
        }
        resolve(value);
      };

      const render = () => {
        const query = input.value;
        filtered = items
          .map((item) => {
            if (item.separator) return { item, score: -Infinity };
            const haystack = item.searchText || `${item.label} ${item.description || ''} ${item.detail || ''}`;
            return { item, score: fuzzyScore(query, haystack) };
          })
          .filter(({ item, score }) => !item.separator && score !== -Infinity)
          .sort((a, b) => (query ? b.score - a.score : 0))
          .slice(0, 300)
          .map(({ item }) => item);

        if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1);
        if (!filtered.length) {
          list.innerHTML = `<div class="quick-pick-empty">${icon('search')}<span>${escapeHtml(emptyText)}</span></div>`;
          count.textContent = '0 results';
          return;
        }
        list.innerHTML = filtered
          .map((item, index) => {
            const iconMarkup = item.icon
              ? icon(item.icon, `quick-pick-icon ${item.iconClass || ''}`)
              : item.iconHtml || '';
            const badge = item.badge
              ? `<span class="quick-pick-badge">${escapeHtml(item.badge)}</span>`
              : '';
            const keys = item.keys ? `<span class="quick-pick-keys">${escapeHtml(item.keys)}</span>` : '';
            return `<button class="quick-pick-item ${index === selected ? 'selected' : ''}" data-index="${index}" role="option" aria-selected="${index === selected}">
              ${iconMarkup}
              <span class="quick-pick-main"><span class="quick-pick-label">${escapeHtml(item.label)}</span>${
                item.description
                  ? `<span class="quick-pick-description">${escapeHtml(item.description)}</span>`
                  : ''
              }</span>
              ${badge}${keys}
            </button>`;
          })
          .join('');
        count.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
        requestAnimationFrame(() => {
          list.querySelector('.quick-pick-item.selected')?.scrollIntoView({ block: 'nearest' });
        });
      };

      const choose = (index = selected) => {
        const item = filtered[index];
        if (!item) return;
        close(item);
      };

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close(null);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          if (!filtered.length) return;
          selected = (selected + 1) % filtered.length;
          render();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          event.stopPropagation();
          if (!filtered.length) return;
          selected = (selected - 1 + filtered.length) % filtered.length;
          render();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          choose();
        } else if (event.key === 'Home' && !isTypingTarget(document.activeElement)) {
          selected = 0;
          render();
        } else if (event.key === 'End' && !isTypingTarget(document.activeElement)) {
          selected = filtered.length - 1;
          render();
        }
      };

      input.addEventListener('input', () => {
        selected = 0;
        render();
      });
      list.addEventListener('click', (event) => {
        const item = event.target.closest('.quick-pick-item');
        if (!item) return;
        choose(Number(item.dataset.index));
      });
      list.addEventListener('mousemove', (event) => {
        const item = event.target.closest('.quick-pick-item');
        if (!item) return;
        const index = Number(item.dataset.index);
        if (index !== selected) {
          selected = index;
          list.querySelectorAll('.quick-pick-item').forEach((node, i) => {
            node.classList.toggle('selected', i === selected);
          });
        }
      });
      overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) close(null);
      });
      document.addEventListener('keydown', onKeyDown, true);
      render();
      input.value = initialQuery;
      input.focus();
      render();
    });
  }

  modal({
    title,
    body,
    actions = [],
    width = '520px',
    className = '',
    onMount = null,
    persistent = false,
  }) {
    this.closeModal(null);
    this.closeOverlays();
    this.previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = `modal ${className}`.trim();
    modal.style.width = width;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', title || 'Dialog');
    modal.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">${escapeHtml(title || '')}</span>
        <button class="modal-close" title="Close">${icon('close')}</button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>`;
    const bodyEl = modal.querySelector('.modal-body');
    if (body instanceof HTMLElement) bodyEl.appendChild(body);
    else bodyEl.innerHTML = body || '';
    const footer = modal.querySelector('.modal-footer');
    if (actions.length) {
      for (const action of actions) {
        const button = document.createElement('button');
        button.className = `btn ${action.primary ? 'btn-primary' : ''} ${action.danger ? 'btn-danger' : ''}`.trim();
        if (action.icon) button.innerHTML = `${icon(action.icon)}<span>${escapeHtml(action.label)}</span>`;
        else button.textContent = action.label;
        button.addEventListener('click', async () => {
          if (action.onClick) {
            const value = await action.onClick();
            if (value === false) return;
            this.closeModal(value === undefined ? action.value : value);
          } else {
            this.closeModal(action.value);
          }
        });
        footer.appendChild(button);
      }
    } else {
      footer.remove();
    }
    backdrop.appendChild(modal);
    this.overlayRoot.appendChild(backdrop);
    this.activeModal = backdrop;
    document.body.classList.add('modal-open');

    const close = modal.querySelector('.modal-close');
    close.addEventListener('click', () => this.closeModal(null));
    if (!persistent) {
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) this.closeModal(null);
      });
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !persistent) {
        event.preventDefault();
        event.stopPropagation();
        this.closeModal(null);
      }
    };
    modal._onKeyDown = onKeyDown;
    document.addEventListener('keydown', onKeyDown, true);

    requestAnimationFrame(() => {
      const focusable = modal.querySelector(
        'input:not([type="hidden"]), textarea, select, button.btn-primary, button',
      );
      focusable?.focus({ preventScroll: true });
      if (focusable instanceof HTMLInputElement && focusable.type === 'text') focusable.select();
    });
    if (onMount) onMount(modal, bodyEl);

    return new Promise((resolve) => {
      backdrop._resolve = resolve;
    });
  }

  closeModal(value = null) {
    if (!this.activeModal) return;
    const backdrop = this.activeModal;
    const resolve = backdrop._resolve;
    const modal = backdrop.querySelector('.modal');
    if (modal && modal._onKeyDown) document.removeEventListener('keydown', modal._onKeyDown, true);
    backdrop.remove();
    this.activeModal = null;
    document.body.classList.remove('modal-open');
    if (this.previousFocus && document.contains(this.previousFocus)) {
      this.previousFocus.focus({ preventScroll: true });
    }
    if (resolve) resolve(value);
  }

  async confirm({
    title = 'Confirm',
    message = 'Are you sure?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false,
  }) {
    const value = await this.modal({
      title,
      body: `<p class="modal-message">${escapeHtml(message)}</p>`,
      actions: [
        { label: cancelText, value: false },
        { label: confirmText, value: true, primary: !danger, danger },
      ],
      width: '460px',
    });
    return value === true;
  }

  async prompt({
    title = 'Input',
    label = '',
    value = '',
    placeholder = '',
    confirmText = 'OK',
    cancelText = 'Cancel',
    help = '',
  }) {
    const body = document.createElement('div');
    body.className = 'prompt-form';
    body.innerHTML = `
      ${label ? `<label>${escapeHtml(label)}</label>` : ''}
      <input class="text-input" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" spellcheck="false" autocomplete="off" />
      ${help ? `<div class="prompt-help">${escapeHtml(help)}</div>` : ''}`;
    const input = body.querySelector('input');
    const promise = this.modal({
      title,
      body,
      actions: [
        { label: cancelText, value: null },
        { label: confirmText, value: 'ok', primary: true },
      ],
      width: '520px',
      onMount: () => {
        setTimeout(() => {
          input.focus();
          const dot = input.value.lastIndexOf('.');
          if (dot > 0) input.setSelectionRange(0, dot);
          else input.select();
        }, 20);
      },
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.closeModal('ok');
      }
    });
    const result = await promise;
    if (result !== 'ok') return null;
    return input.value.trim();
  }

  contextMenu(x, y, items) {
    this.closeMenu();
    this.closeOverlays();
    if (!items.length) return;
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items
      .map((item, index) => {
        if (item.separator) return '<div class="context-separator"></div>';
        return `<button class="context-item ${item.danger ? 'danger' : ''}" data-index="${index}" role="menuitem" ${
          item.disabled ? 'disabled' : ''
        }>
          ${item.icon ? icon(item.icon, 'context-icon') : '<span class="context-icon"></span>'}
          <span class="context-label">${escapeHtml(item.label)}</span>
          ${item.keys ? `<span class="context-keys">${escapeHtml(item.keys)}</span>` : ''}
        </button>`;
      })
      .join('');
    this.menuRoot.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    this.activeMenu = menu;
    requestAnimationFrame(() => menu.classList.add('visible'));

    const close = () => this.closeMenu();
    menu.addEventListener('click', (event) => {
      const button = event.target.closest('.context-item');
      if (!button || button.disabled) return;
      const item = items[Number(button.dataset.index)];
      close();
      if (item && item.run) setTimeout(() => item.run(), 0);
    });
    const onPointer = (event) => {
      if (!menu.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll('.context-item:not(:disabled)')];
        if (!buttons.length) return;
        const current = buttons.indexOf(document.activeElement);
        let next;
        if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
        else next = (current - 1 + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    };
    setTimeout(() => {
      window.addEventListener('mousedown', onPointer, true);
      window.addEventListener('keydown', onKey, true);
      menu.querySelector('.context-item:not(:disabled)')?.focus();
    }, 0);
    menu._cleanup = () => {
      window.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }

  closeMenu() {
    if (!this.activeMenu) return;
    if (this.activeMenu._cleanup) this.activeMenu._cleanup();
    this.activeMenu.remove();
    this.activeMenu = null;
  }

  closeOverlays() {
    this.closeMenu();
    if (this.activeOverlay) {
      const overlay = this.activeOverlay;
      this.activeOverlay = null;
      overlay.remove();
    }
  }

  closeAll() {
    this.closeMenu();
    this.closeOverlays();
    this.closeModal(null);
  }
}
