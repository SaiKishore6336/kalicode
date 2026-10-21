'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  shell,
} = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { StringDecoder } = require('string_decoder');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_ROOT = path.join(PROJECT_ROOT, 'dist');
const ICON_PATH = path.join(PROJECT_ROOT, 'assets', 'icon.png');
const PTY_BRIDGE = path.join(__dirname, 'pty_bridge.py');
const IS_DEV = Boolean(process.env.KALICODE_DEV);
const DEV_SERVER_URL = process.env.KALICODE_DEV_URL || 'http://localhost:5173';

app.setName('KaliCode');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;
let allowClose = false;
let pendingOpenPaths = [];
let workspaceWatcher = null;
let watchTimer = null;
const terminals = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const DEFAULT_EXCLUDES = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
]);

function existsSyncSafe(target) {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function getWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function send(channel, payload) {
  const win = getWindow();
  if (win) win.webContents.send(channel, payload);
}

function parseLaunchPaths(argv) {
  const start = app.isPackaged ? 1 : 2;
  const candidates = argv.slice(start);
  const paths = [];
  for (const arg of candidates) {
    if (!arg || arg.startsWith('-')) continue;
    const resolved = path.resolve(arg);
    if (resolved === PROJECT_ROOT || resolved === path.join(PROJECT_ROOT, 'dist')) continue;
    if (existsSyncSafe(resolved)) paths.push(resolved);
  }
  return [...new Set(paths)];
}

function initialPaths() {
  const fromArgv = parseLaunchPaths(process.argv);
  if (fromArgv.length) return fromArgv;
  const cwd = path.resolve(process.cwd());
  if (cwd !== PROJECT_ROOT && cwd !== path.join(PROJECT_ROOT, 'dist') && existsSyncSafe(cwd)) {
    // Only use the cwd when launched from a foreign directory, never from KaliCode itself.
    if (!isPathInside(PROJECT_ROOT, cwd)) return [cwd];
  }
  return [];
}

pendingOpenPaths = initialPaths();

function openExternalSafe(url) {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      shell.openExternal(url);
    }
  } catch {
    // Ignore malformed URLs.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 960,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#0d0b12',
    icon: existsSyncSafe(ICON_PATH) ? ICON_PATH : undefined,
    title: 'KaliCode',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  if (IS_DEV) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadURL('app://kalicode/index.html');
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isInternal = url.startsWith('app://kalicode/') || (IS_DEV && url.startsWith(DEV_SERVER_URL));
    if (!isInternal) {
      event.preventDefault();
      openExternalSafe(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[KaliCode] Failed to load ${url}: ${description} (${code})`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[KaliCode] Renderer process gone:', details);
  });

  mainWindow.webContents.on('console-message', (...args) => {
    const details =
      args[1] && typeof args[1] === 'object'
        ? args[1]
        : { level: args[1], message: args[2], lineNumber: args[3], sourceId: args[4] };
    const level = String(details.level ?? '');
    if (!['warning', 'error', '2', '3'].includes(level)) return;
    const message = details.message ?? '';
    const source = details.sourceId ?? '';
    const line = details.lineNumber ?? 0;
    console.error(`[renderer:${level}] ${message}${source ? ` (${source}:${line})` : ''}`);
  });

  const notifyMaximized = () => send('window:maximized', mainWindow.isMaximized());
  mainWindow.on('maximize', notifyMaximized);
  mainWindow.on('unmaximize', notifyMaximized);
  mainWindow.on('enter-full-screen', notifyMaximized);
  mainWindow.on('leave-full-screen', notifyMaximized);

  mainWindow.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    send('window:close-request');
  });

  mainWindow.on('closed', () => {
    killAllTerminals();
    closeWorkspaceWatcher();
    mainWindow = null;
  });
}

function killAllTerminals() {
  for (const entry of terminals.values()) {
    try {
      entry.child.stdin.write(JSON.stringify({ type: 'kill' }) + '\n');
    } catch {
      // Ignore.
    }
    try {
      entry.child.kill('SIGHUP');
    } catch {
      // Ignore.
    }
  }
  terminals.clear();
}

function closeWorkspaceWatcher() {
  if (watchTimer) {
    clearTimeout(watchTimer);
    watchTimer = null;
  }
  if (workspaceWatcher) {
    try {
      workspaceWatcher.close();
    } catch {
      // Ignore.
    }
    workspaceWatcher = null;
  }
}

async function serveAppFile(request) {
  try {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname || '/');
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    if (pathname.endsWith('/')) pathname += 'index.html';
    const relative = pathname.replace(/^\/+/, '');
    const target = path.normalize(path.join(DIST_ROOT, relative));
    if (!isPathInside(DIST_ROOT, target)) {
      return new Response('Forbidden', { status: 403 });
    }
    const data = await fsp.readFile(target);
    const type = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    if (error && error.code === 'ENOENT') return new Response('Not found', { status: 404 });
    console.error('[KaliCode] app:// request failed:', error);
    return new Response('Internal error', { status: 500 });
  }
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeout || 20000,
        maxBuffer: options.maxBuffer || 12 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_PAGER: 'cat',
          PAGER: 'cat',
          ...(options.env || {}),
        },
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error && typeof error.code === 'number' ? error.code : error ? 1 : 0,
          stdout: stdout || '',
          stderr: stderr || '',
          error,
        });
      },
    );
  });
}

async function git(cwd, args, options = {}) {
  return runProcess('git', args, { cwd, timeout: options.timeout || 20000 });
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function globToRegExp(glob) {
  let source = '^';
  const normalized = String(glob).replace(/\\/g, '/');
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '*' && normalized[i + 1] === '*') {
      source += '.*';
      i += 1;
      if (normalized[i + 1] === '/') i += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  source += '$';
  try {
    return new RegExp(source);
  } catch {
    return /$a/;
  }
}

function buildIncludeMatcher(include) {
  const patterns = String(include || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!patterns.length) return null;
  const matchers = patterns.map((pattern) => ({
    regex: globToRegExp(pattern),
    basenameOnly: !pattern.includes('/'),
  }));
  return (relative) => {
    const normalized = relative.replace(/\\/g, '/');
    const base = path.posix.basename(normalized);
    return matchers.some(({ regex, basenameOnly }) =>
      basenameOnly ? regex.test(base) : regex.test(normalized),
    );
  };
}

function buildExcludeMatcher(exclude) {
  const patterns = String(exclude || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!patterns.length) return null;
  const matchers = patterns.map((pattern) => ({
    regex: globToRegExp(pattern),
    basenameOnly: !pattern.includes('/'),
  }));
  return (relative) => {
    const normalized = relative.replace(/\\/g, '/');
    const base = path.posix.basename(normalized);
    return matchers.some(({ regex, basenameOnly }) =>
      basenameOnly ? regex.test(base) : regex.test(normalized),
    );
  };
}

async function walkWorkspace(root, visitor, options = {}) {
  const maxFiles = options.maxFiles || 25000;
  const include = buildIncludeMatcher(options.include);
  const exclude = buildExcludeMatcher(options.exclude);
  let visited = 0;
  let truncated = false;

  async function walk(directory) {
    if (visited >= maxFiles) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (visited >= maxFiles) {
        truncated = true;
        return;
      }
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDES.has(entry.name)) continue;
        if (exclude && exclude(relative)) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (exclude && exclude(relative)) continue;
      if (include && !include(relative)) continue;
      visited += 1;
      const shouldStop = await visitor(full, relative);
      if (shouldStop) return;
    }
  }

  await walk(root);
  return { visited, truncated };
}

function isProbablyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

function parseGitStatus(output, root) {
  const lines = output.split(/\r?\n/);
  const changes = [];
  let branch = '';
  let ahead = 0;
  let behind = 0;

  for (const raw of lines) {
    if (!raw) continue;
    if (raw.startsWith('## ')) {
      let value = raw.slice(3).trim();
      value = value.replace(/^No commits yet on\s+/, '');
      const bracket = value.match(/\[([^\]]+)\]/);
      if (bracket) {
        const aheadMatch = bracket[1].match(/ahead (\d+)/);
        const behindMatch = bracket[1].match(/behind (\d+)/);
        ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
        behind = behindMatch ? Number(behindMatch[1]) : 0;
      }
      value = value.replace(/\[[^\]]+\]/, '').trim();
      if (value.startsWith('HEAD (no branch)')) branch = 'HEAD';
      else branch = value.split('...')[0].split(' ')[0];
      continue;
    }
    if (raw.startsWith('?? ')) {
      const file = raw.slice(3).trim();
      changes.push({
        path: file,
        absolute: path.join(root, file),
        x: '?',
        y: '?',
        staged: false,
        unstaged: true,
        status: 'U',
      });
      continue;
    }
    if (raw.startsWith('!! ')) continue;
    if (raw.length < 4) continue;
    const x = raw[0];
    const y = raw[1];
    let file = raw.slice(3);
    if (file.includes(' -> ')) file = file.split(' -> ').pop();
    file = file.trim();
    if (!file) continue;
    const staged = x !== ' ' && x !== '?';
    const unstaged = y !== ' ' && y !== '?';
    changes.push({
      path: file,
      absolute: path.join(root, file),
      x,
      y,
      staged,
      unstaged,
      status: x === '?' ? 'U' : x !== ' ' ? x : y,
    });
  }

  return { branch, ahead, behind, changes };
}

function registerIpc() {
  ipcMain.handle('app:get-launch-paths', () => {
    const paths = pendingOpenPaths;
    pendingOpenPaths = [];
    return paths;
  });

  ipcMain.handle('app:info', () => ({
    appVersion: app.getVersion(),
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    platform: process.platform,
    arch: process.arch,
    projectRoot: PROJECT_ROOT,
    readme: path.join(PROJECT_ROOT, 'README.md'),
    home: os.homedir(),
    userData: app.getPath('userData'),
    tempDir: os.tmpdir(),
    defaultShell: process.env.SHELL || '/bin/bash',
  }));

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Open Folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Open Folder',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Open File',
      properties: ['openFile', 'multiSelections'],
      buttonLabel: 'Open',
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:save-file', async (_event, defaultPath) => {
    const result = await dialog.showSaveDialog(getWindow(), {
      title: 'Save File',
      defaultPath: defaultPath || undefined,
      buttonLabel: 'Save',
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('fs:read-dir', async (_event, target) => {
    const entries = await fsp.readdir(target, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      let isDirectory = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const stat = await fsp.stat(path.join(target, entry.name));
          isDirectory = stat.isDirectory();
          isFile = stat.isFile();
        } catch {
          // Broken symlink, leave it out.
        }
      }
      if (!isDirectory && !isFile) continue;
      items.push({
        name: entry.name,
        path: path.join(target, entry.name),
        isDirectory,
        hidden: entry.name.startsWith('.'),
      });
    }
    items.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
    return items;
  });

  ipcMain.handle('fs:read-file', async (_event, target) => {
    const stat = await fsp.stat(target);
    if (!stat.isFile()) throw new Error('Not a file');
    if (stat.size > 16 * 1024 * 1024) throw new Error('File is larger than 16 MB');
    const buffer = await fsp.readFile(target);
    if (isProbablyBinary(buffer)) throw new Error('Binary files cannot be opened in the text editor');
    return {
      content: buffer.toString('utf8'),
      size: stat.size,
      mtime: stat.mtimeMs,
    };
  });

  ipcMain.handle('fs:write-file', async (_event, target, content) => {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, String(content ?? ''), 'utf8');
    return { ok: true };
  });

  ipcMain.handle('fs:create-file', async (_event, target) => {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
    return { ok: true };
  });

  ipcMain.handle('fs:create-dir', async (_event, target) => {
    await fsp.mkdir(target, { recursive: false });
    return { ok: true };
  });

  ipcMain.handle('fs:rename', async (_event, oldPath, newPath) => {
    if (path.resolve(oldPath) === path.resolve(newPath)) return { ok: true };
    try {
      await fsp.access(newPath);
      throw new Error('A file or folder already exists at that path');
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error;
    }
    await fsp.rename(oldPath, newPath);
    return { ok: true };
  });

  ipcMain.handle('fs:trash', async (_event, target) => {
    await shell.trashItem(target);
    return { ok: true };
  });

  ipcMain.handle('fs:exists', async (_event, target) => {
    try {
      await fsp.access(target);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:stat', async (_event, target) => {
    const stat = await fsp.stat(target);
    return {
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtime: stat.mtimeMs,
    };
  });

  ipcMain.handle('fs:list-files', async (_event, root) => {
    const files = [];
    const result = await walkWorkspace(
      root,
      async (_full, relative) => {
        files.push(relative.replace(/\\/g, '/'));
        return false;
      },
      { maxFiles: 30000 },
    );
    return { files, truncated: result.truncated };
  });

  ipcMain.handle('fs:search', async (_event, root, options = {}) => {
    const query = String(options.query ?? '');
    if (!query) return { files: [], count: 0, truncated: false };
    const flags = `g${options.matchCase ? '' : 'i'}`;
    let expression;
    try {
      const source = options.isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expression = new RegExp(options.wholeWord ? `\\b(?:${source})\\b` : source, flags);
    } catch (error) {
      return { error: `Invalid regular expression: ${error.message}`, files: [], count: 0 };
    }

    const groups = new Map();
    let total = 0;
    let truncated = false;
    const maxMatches = 2000;
    const maxPerFile = 120;

    const result = await walkWorkspace(
      root,
      async (full, relative) => {
        let buffer;
        try {
          const stat = await fsp.stat(full);
          if (stat.size > 2 * 1024 * 1024) return false;
          buffer = await fsp.readFile(full);
        } catch {
          return false;
        }
        if (isProbablyBinary(buffer)) return false;
        const content = buffer.toString('utf8');
        const lines = content.split(/\r?\n/);
        let fileMatches = 0;
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          if (line.length > 12000 && !query) continue;
          expression.lastIndex = 0;
          let match;
          while ((match = expression.exec(line)) !== null) {
            if (fileMatches >= maxPerFile || total >= maxMatches) {
              truncated = true;
              break;
            }
            const text = line.length > 320 ? `${line.slice(0, 320)}…` : line;
            const group = groups.get(relative) || { path: full, relative, matches: [] };
            group.matches.push({
              line: index + 1,
              column: match.index + 1,
              length: Math.max(match[0].length, 1),
              text,
            });
            groups.set(relative, group);
            fileMatches += 1;
            total += 1;
            if (match[0].length === 0) expression.lastIndex += 1;
            if (expression.lastIndex > line.length) break;
          }
          if (total >= maxMatches) {
            truncated = true;
            break;
          }
        }
        return total >= maxMatches;
      },
      { include: options.include, exclude: options.exclude },
    );

    return {
      files: [...groups.values()],
      count: total,
      truncated: truncated || result.truncated,
    };
  });

  ipcMain.handle('fs:replace-all', async (_event, root, options = {}) => {
    const query = String(options.query ?? '');
    if (!query) throw new Error('Search query is empty');
    const flags = `g${options.matchCase ? '' : 'i'}`;
    let expression;
    try {
      const source = options.isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expression = new RegExp(options.wholeWord ? `\\b(?:${source})\\b` : source, flags);
    } catch (error) {
      throw new Error(`Invalid regular expression: ${error.message}`);
    }
    const replacement = String(options.replace ?? '');
    let total = 0;
    const changed = [];

    await walkWorkspace(
      root,
      async (full, relative) => {
        let buffer;
        try {
          const stat = await fsp.stat(full);
          if (stat.size > 5 * 1024 * 1024) return false;
          buffer = await fsp.readFile(full);
        } catch {
          return false;
        }
        if (isProbablyBinary(buffer)) return false;
        const content = buffer.toString('utf8');
        expression.lastIndex = 0;
        const matches = content.match(expression);
        if (!matches || !matches.length) return false;
        expression.lastIndex = 0;
        const next = content.replace(expression, replacement);
        if (next !== content) {
          await fsp.writeFile(full, next, 'utf8');
          total += matches.length;
          changed.push({ path: full, relative, count: matches.length });
        }
        return false;
      },
      { include: options.include, exclude: options.exclude },
    );

    return { count: total, files: changed };
  });

  ipcMain.handle('fs:watch', async (_event, root) => {
    closeWorkspaceWatcher();
    try {
      workspaceWatcher = fs.watch(root, { recursive: true }, (_type, filename) => {
        const name = filename ? String(filename) : '';
        if (
          name &&
          /(^|\/)(\.git|node_modules|__pycache__|\.venv|venv|dist)(\/|$)/.test(name)
        ) {
          return;
        }
        if (watchTimer) clearTimeout(watchTimer);
        watchTimer = setTimeout(() => {
          send('workspace:changed', { path: name });
        }, 400);
      });
      workspaceWatcher.on('error', (error) => {
        console.error('[KaliCode] Workspace watcher error:', error);
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('fs:unwatch', () => {
    closeWorkspaceWatcher();
    return { ok: true };
  });

  ipcMain.handle('git:status', async (_event, root) => {
    const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
    if (!inside.ok || inside.stdout.trim() !== 'true') {
      return { isRepo: false };
    }
    const result = await git(root, ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-b']);
    if (!result.ok) {
      return { isRepo: false, error: result.stderr.trim() };
    }
    return { isRepo: true, ...parseGitStatus(result.stdout, root) };
  });

  ipcMain.handle('git:init', async (_event, root) => {
    const result = await git(root, ['init']);
    return { ok: result.ok, output: result.stdout + result.stderr };
  });

  ipcMain.handle('git:stage', async (_event, root, relative) => {
    const result = await git(root, ['add', '-A', '--', relative]);
    return { ok: result.ok, error: result.stderr.trim() };
  });

  ipcMain.handle('git:unstage', async (_event, root, relative) => {
    let result = await git(root, ['restore', '--staged', '--', relative]);
    if (!result.ok) result = await git(root, ['rm', '--cached', '--ignore-unmatch', '--', relative]);
    return { ok: result.ok, error: result.stderr.trim() };
  });

  ipcMain.handle('git:stage-all', async (_event, root) => {
    const result = await git(root, ['add', '-A']);
    return { ok: result.ok, error: result.stderr.trim() };
  });

  ipcMain.handle('git:unstage-all', async (_event, root) => {
    let result = await git(root, ['restore', '--staged', '.']);
    if (!result.ok) result = await git(root, ['reset']);
    return { ok: result.ok, error: result.stderr.trim() };
  });

  ipcMain.handle('git:commit', async (_event, root, message) => {
    const text = String(message || '').trim();
    if (!text) throw new Error('Commit message is empty');
    const result = await git(root, ['commit', '-m', text], { timeout: 60000 });
    return {
      ok: result.ok,
      output: (result.stdout + result.stderr).trim(),
      error: result.ok ? '' : result.stderr.trim() || result.stdout.trim(),
    };
  });

  ipcMain.handle('git:branches', async (_event, root) => {
    const list = await git(root, ['branch', '--format=%(refname:short)']);
    const current = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!list.ok) return { branches: [], current: '' };
    return {
      branches: list.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      current: current.ok ? current.stdout.trim() : '',
    };
  });

  ipcMain.handle('git:checkout', async (_event, root, branch) => {
    const name = String(branch || '').trim();
    if (!name || name.startsWith('-')) throw new Error('Invalid branch name');
    const result = await git(root, ['checkout', name], { timeout: 60000 });
    return { ok: result.ok, output: (result.stdout + result.stderr).trim() };
  });

  ipcMain.handle('git:create-branch', async (_event, root, branch) => {
    const name = String(branch || '').trim();
    if (!name || name.startsWith('-')) throw new Error('Invalid branch name');
    const check = await git(root, ['check-ref-format', '--branch', name]);
    if (!check.ok) throw new Error('Invalid branch name');
    const result = await git(root, ['checkout', '-b', name], { timeout: 60000 });
    return { ok: result.ok, output: (result.stdout + result.stderr).trim() };
  });

  ipcMain.handle('git:diff', async (_event, root, file, staged) => {
    const prefixResult = await git(root, ['rev-parse', '--show-prefix']);
    const prefix = prefixResult.ok ? prefixResult.stdout.trim() : '';
    const relative = toPosix(path.relative(root, file));
    const repoPath = `${prefix}${relative}`;
    let original = '';
    const head = await git(root, ['show', `HEAD:${repoPath}`]);
    if (head.ok) original = head.stdout;

    let modified = '';
    if (staged) {
      const index = await git(root, ['show', `:${repoPath}`]);
      if (index.ok) modified = index.stdout;
    } else {
      try {
        modified = await fsp.readFile(file, 'utf8');
      } catch {
        modified = '';
      }
    }
    return { original, modified, path: relative };
  });

  ipcMain.handle('term:start', async (_event, id, cwd, shellPath) => {
    if (!id) throw new Error('Missing terminal id');
    const existing = terminals.get(id);
    if (existing) {
      try {
        existing.child.kill('SIGHUP');
      } catch {
        // Ignore.
      }
      terminals.delete(id);
    }
    const shell = shellPath || process.env.SHELL || '/bin/bash';
    const child = spawn('python3', [PTY_BRIDGE, cwd || os.homedir(), shell], {
      cwd: cwd || os.homedir(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'C.UTF-8',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const entry = { child, buffer: '', exited: false, decoder: new StringDecoder('utf8') };
    terminals.set(id, entry);

    child.stdout.on('data', (chunk) => {
      entry.buffer += chunk.toString('utf8');
      let newline = entry.buffer.indexOf('\n');
      while (newline !== -1) {
        const line = entry.buffer.slice(0, newline).trim();
        entry.buffer = entry.buffer.slice(newline + 1);
        if (line) {
          try {
            const text = entry.decoder.write(Buffer.from(line, 'base64'));
            if (text) send('term:data', { id, data: text });
          } catch {
            // Ignore malformed frames.
          }
        }
        newline = entry.buffer.indexOf('\n');
      }
    });

    child.stderr.on('data', (chunk) => {
      send('term:data', { id, data: chunk.toString('utf8') });
    });

    child.on('error', (error) => {
      send('term:data', { id, data: `\r\n[Unable to start shell: ${error.message}]\r\n` });
    });

    child.on('close', (code) => {
      if (!entry.exited) {
        entry.exited = true;
        send('term:exit', { id, code: typeof code === 'number' ? code : 0 });
      }
      terminals.delete(id);
    });

    return { id, cwd: cwd || os.homedir(), shell };
  });

  ipcMain.on('term:write', (_event, id, data) => {
    const entry = terminals.get(id);
    if (!entry) return;
    try {
      entry.child.stdin.write(
        JSON.stringify({ type: 'input', data: Buffer.from(String(data), 'utf8').toString('base64') }) + '\n',
      );
    } catch {
      // Ignore write failures.
    }
  });

  ipcMain.on('term:resize', (_event, id, cols, rows) => {
    const entry = terminals.get(id);
    if (!entry) return;
    const safeCols = Math.max(2, Math.min(500, Number(cols) || 80));
    const safeRows = Math.max(1, Math.min(300, Number(rows) || 24));
    try {
      entry.child.stdin.write(
        JSON.stringify({ type: 'resize', cols: safeCols, rows: safeRows }) + '\n',
      );
    } catch {
      // Ignore.
    }
  });

  ipcMain.on('term:kill', (_event, id) => {
    const entry = terminals.get(id);
    if (!entry) return;
    try {
      entry.child.stdin.write(JSON.stringify({ type: 'kill' }) + '\n');
    } catch {
      // Ignore.
    }
    setTimeout(() => {
      try {
        entry.child.kill('SIGHUP');
      } catch {
        // Ignore.
      }
    }, 600);
  });

  ipcMain.handle('lint:run', async (_event, file, language) => {
    if (language === 'python') {
      const script = [
        'import sys',
        'p = sys.argv[1]',
        'try:',
        '    with open(p, "rb") as f:',
        '        src = f.read()',
        '    compile(src, p, "exec")',
        '    print("OK")',
        'except SyntaxError as e:',
        '    print(f"{e.msg}|{e.lineno or 1}|{e.offset or 1}")',
        '    sys.exit(1)',
        'except Exception as e:',
        '    print(f"{type(e).__name__}: {e}|1|1")',
        '    sys.exit(1)',
      ].join('\n');
      const result = await runProcess(process.env.PYTHON || 'python3', ['-c', script, file], {
        timeout: 15000,
      });
      if (result.stdout.trim() === 'OK') return { problems: [] };
      const parts = result.stdout.trim().split('|');
      if (parts.length >= 3) {
        return {
          problems: [
            {
              line: Number(parts[1]) || 1,
              column: Number(parts[2]) || 1,
              message: parts[0] || 'Python syntax error',
              severity: 'error',
              source: 'python',
            },
          ],
        };
      }
      return {
        problems: [
          {
            line: 1,
            column: 1,
            message: result.stderr.trim() || 'Python syntax error',
            severity: 'error',
            source: 'python',
          },
        ],
      };
    }

    if (language === 'shell') {
      const result = await runProcess('bash', ['-n', file], { timeout: 15000 });
      if (result.ok) return { problems: [] };
      const text = result.stderr.trim();
      const match = text.match(/: line (\d+):\s*([^\n]+)/);
      return {
        problems: [
          {
            line: match ? Number(match[1]) : 1,
            column: 1,
            message: match ? match[2] : text || 'Shell syntax error',
            severity: 'error',
            source: 'shellcheck',
          },
        ],
      };
    }

    return { problems: [] };
  });

  ipcMain.handle('settings:get', async () => {
    try {
      const file = path.join(app.getPath('userData'), 'settings.json');
      return JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch {
      return {};
    }
  });

  ipcMain.handle('settings:set', async (_event, settings) => {
    const directory = app.getPath('userData');
    await fsp.mkdir(directory, { recursive: true });
    const file = path.join(directory, 'settings.json');
    const temporary = `${file}.tmp`;
    await fsp.writeFile(temporary, JSON.stringify(settings, null, 2), 'utf8');
    await fsp.rename(temporary, file);
    return { ok: true, file };
  });

  ipcMain.handle('settings:open', async () => {
    const directory = app.getPath('userData');
    await fsp.mkdir(directory, { recursive: true });
    const file = path.join(directory, 'settings.json');
    if (!existsSyncSafe(file)) {
      await fsp.writeFile(file, JSON.stringify({}, null, 2), 'utf8');
    }
    return shell.openPath(file);
  });

  ipcMain.handle('app:open-external', async (_event, url) => {
    openExternalSafe(url);
    return { ok: true };
  });

  ipcMain.handle('app:open-path', async (_event, target) => {
    const result = await shell.openPath(target);
    return { ok: !result, error: result };
  });

  ipcMain.handle('app:show-item', (_event, target) => {
    shell.showItemInFolder(target);
    return { ok: true };
  });

  ipcMain.on('window:minimize', () => getWindow()?.minimize());

  ipcMain.on('window:toggle-maximize', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.on('window:close', () => getWindow()?.close());

  ipcMain.on('window:confirm-close', () => {
    allowClose = true;
    const win = getWindow();
    if (win) win.close();
  });

  ipcMain.on('window:toggle-fullscreen', () => {
    const win = getWindow();
    if (!win) return;
    win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.on('app:reload', () => getWindow()?.webContents.reload());

  ipcMain.on('app:devtools', () => getWindow()?.webContents.toggleDevTools());

  ipcMain.handle('app:read-clipboard', () => {
    const { clipboard } = require('electron');
    return clipboard.readText();
  });

  ipcMain.on('app:write-clipboard', (_event, text) => {
    const { clipboard } = require('electron');
    clipboard.writeText(String(text ?? ''));
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const paths = parseLaunchPaths(argv);
    const win = getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      if (paths.length) win.webContents.send('app:open-paths', paths);
    } else {
      pendingOpenPaths.push(...paths);
      createWindow();
    }
  });

  app.whenReady().then(async () => {
    protocol.handle('app', serveAppFile);
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    allowClose = true;
    killAllTerminals();
    closeWorkspaceWatcher();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
