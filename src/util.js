import { detectLanguage, languageColor } from './monaco.js';
import { escapeHtml } from './ui.js';
import { EXT_LABELS } from './constants.js';

export function byId(id) {
  return document.getElementById(id);
}

export function pathBase(value) {
  if (!value) return '';
  const normalized = String(value).replace(/[\\/]+$/, '');
  if (normalized === '' || normalized === '/') return '/';
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index === -1 ? normalized : normalized.slice(index + 1);
}

export function pathDir(value) {
  if (!value) return '';
  const normalized = String(value).replace(/[\\/]+$/, '') || '/';
  if (normalized === '/') return '/';
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (index <= 0) return normalized.startsWith('/') ? '/' : '.';
  return normalized.slice(0, index);
}

export function pathExt(value) {
  const base = pathBase(value);
  if (!base || !base.includes('.')) return '';
  return base.split('.').pop().toLowerCase();
}

export function joinPath(base, name) {
  if (!base) return name;
  if (!name) return base;
  return `${String(base).replace(/[\\/]+$/, '')}/${String(name).replace(/^[\\/]+/, '')}`;
}

export function isInsidePath(root, target) {
  if (!root || !target) return false;
  if (target === root) return true;
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return target.startsWith(prefix);
}

export function relativePath(root, target) {
  if (!isInsidePath(root, target)) return null;
  return target.slice(root.endsWith('/') ? root.length : root.length + 1);
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
}

export function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function truncate(value, length = 80) {
  const text = String(value ?? '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function fileBadge(filename, extraClass = '') {
  const language = detectLanguage(filename);
  const extension = pathExt(filename);
  const label = EXT_LABELS[extension] || (filename ? pathBase(filename).slice(0, 2).toUpperCase() : 'F');
  const color = languageColor(language);
  return `<span class="file-badge ${extraClass}" title="${escapeHtml(language)}" style="color:${color};background:${color}1c">${escapeHtml(label)}</span>`;
}

export function fileIcon(filename, extraClass = '') {
  return fileBadge(filename, extraClass);
}

export function folderIcon(open = false, extraClass = '') {
  return `<i class="codicon codicon-${open ? 'folder-opened' : 'folder'} tree-folder-icon ${extraClass}"></i>`;
}

export function platformShell(settings, info) {
  return settings?.terminalShell || info?.defaultShell || window.kali?.env?.shell || '/bin/bash';
}

export function isTypingTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  );
}
