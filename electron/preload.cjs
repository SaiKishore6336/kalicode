'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('kali', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  env: {
    shell: process.env.SHELL || '/bin/bash',
    home: process.env.HOME || '',
  },
  win: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    confirmClose: () => ipcRenderer.send('window:confirm-close'),
    toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
    onMaximized: (callback) => subscribe('window:maximized', callback),
    onCloseRequest: (callback) => subscribe('window:close-request', callback),
  },
  dialog: {
    openFolder: () => invoke('dialog:open-folder'),
    openFile: () => invoke('dialog:open-file'),
    saveFile: (defaultPath) => invoke('dialog:save-file', defaultPath),
  },
  fs: {
    readDir: (target) => invoke('fs:read-dir', target),
    readFile: (target) => invoke('fs:read-file', target),
    writeFile: (target, content) => invoke('fs:write-file', target, content),
    createFile: (target) => invoke('fs:create-file', target),
    createDir: (target) => invoke('fs:create-dir', target),
    rename: (oldPath, newPath) => invoke('fs:rename', oldPath, newPath),
    trash: (target) => invoke('fs:trash', target),
    exists: (target) => invoke('fs:exists', target),
    stat: (target) => invoke('fs:stat', target),
    listFiles: (root) => invoke('fs:list-files', root),
    search: (root, options) => invoke('fs:search', root, options),
    replaceAll: (root, options) => invoke('fs:replace-all', root, options),
    watch: (root) => invoke('fs:watch', root),
    unwatch: () => invoke('fs:unwatch'),
    onChanged: (callback) => subscribe('workspace:changed', callback),
  },
  git: {
    status: (root) => invoke('git:status', root),
    init: (root) => invoke('git:init', root),
    stage: (root, relative) => invoke('git:stage', root, relative),
    unstage: (root, relative) => invoke('git:unstage', root, relative),
    stageAll: (root) => invoke('git:stage-all', root),
    unstageAll: (root) => invoke('git:unstage-all', root),
    commit: (root, message) => invoke('git:commit', root, message),
    branches: (root) => invoke('git:branches', root),
    checkout: (root, branch) => invoke('git:checkout', root, branch),
    createBranch: (root, branch) => invoke('git:create-branch', root, branch),
    diff: (root, file, staged) => invoke('git:diff', root, file, staged),
  },
  terminal: {
    start: (id, cwd, shell) => invoke('term:start', id, cwd, shell),
    write: (id, data) => ipcRenderer.send('term:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('term:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('term:kill', id),
    onData: (callback) => subscribe('term:data', callback),
    onExit: (callback) => subscribe('term:exit', callback),
  },
  lint: {
    run: (file, language) => invoke('lint:run', file, language),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (settings) => invoke('settings:set', settings),
    open: () => invoke('settings:open'),
  },
  app: {
    info: () => invoke('app:info'),
    getLaunchPaths: () => invoke('app:get-launch-paths'),
    openExternal: (url) => invoke('app:open-external', url),
    openPath: (target) => invoke('app:open-path', target),
    showItem: (target) => invoke('app:show-item', target),
    reload: () => ipcRenderer.send('app:reload'),
    devtools: () => ipcRenderer.send('app:devtools'),
    readClipboard: () => invoke('app:read-clipboard'),
    writeClipboard: (text) => ipcRenderer.send('app:write-clipboard', text),
    getPathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    },
    onOpenPaths: (callback) => subscribe('app:open-paths', callback),
  },
});
