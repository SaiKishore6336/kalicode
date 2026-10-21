import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

const kaliRules = [
  { token: '', foreground: 'E9E2F5' },
  { token: 'comment', foreground: '7D7294', fontStyle: 'italic' },
  { token: 'keyword', foreground: 'C084FC' },
  { token: 'keyword.control', foreground: 'C084FC' },
  { token: 'keyword.operator', foreground: '67E8F9' },
  { token: 'string', foreground: '86EFAC' },
  { token: 'string.escape', foreground: 'FCD34D' },
  { token: 'number', foreground: 'FCD34D' },
  { token: 'regexp', foreground: 'F9A8D4' },
  { token: 'operator', foreground: '67E8F9' },
  { token: 'delimiter', foreground: 'A99EBF' },
  { token: 'type', foreground: '67E8F9' },
  { token: 'type.identifier', foreground: '67E8F9' },
  { token: 'function', foreground: '93C5FD' },
  { token: 'identifier', foreground: 'E9E2F5' },
  { token: 'variable', foreground: 'E9E2F5' },
  { token: 'variable.predefined', foreground: '67E8F9' },
  { token: 'constant', foreground: 'FBBF24' },
  { token: 'tag', foreground: 'F472B6' },
  { token: 'attribute.name', foreground: 'FCD34D' },
  { token: 'attribute.value', foreground: '86EFAC' },
  { token: 'metatag', foreground: 'C084FC' },
  { token: 'annotation', foreground: 'FBBF24' },
  { token: 'namespace', foreground: '67E8F9' },
  { token: 'invalid', foreground: 'F87171' },
  { token: 'key', foreground: '67E8F9' },
  { token: 'string.key.json', foreground: 'C084FC' },
  { token: 'string.value.json', foreground: '86EFAC' },
];

const kaliColors = {
  'editor.background': '#121018',
  'editor.foreground': '#E9E2F5',
  'editorLineNumber.foreground': '#4D455E',
  'editorLineNumber.activeForeground': '#C084FC',
  'editorCursor.foreground': '#C084FC',
  'editor.selectionBackground': '#7C3AED52',
  'editor.inactiveSelectionBackground': '#7C3AED2E',
  'editor.selectionHighlightBackground': '#7C3AED30',
  'editor.wordHighlightBackground': '#22D3EE20',
  'editor.wordHighlightStrongBackground': '#A855F730',
  'editor.findMatchBackground': '#F59E0B55',
  'editor.findMatchHighlightBackground': '#F59E0B28',
  'editor.lineHighlightBackground': '#1A1624',
  'editor.lineHighlightBorder': '#00000000',
  'editorIndentGuide.background1': '#282235',
  'editorIndentGuide.activeBackground1': '#4C3F63',
  'editorBracketHighlight.foreground1': '#C084FC',
  'editorBracketHighlight.foreground2': '#22D3EE',
  'editorBracketHighlight.foreground3': '#FBBF24',
  'editorBracketHighlight.foreground4': '#F472B6',
  'editorError.foreground': '#F87171',
  'editorWarning.foreground': '#FBBF24',
  'editorInfo.foreground': '#67E8F9',
  'editorGutter.background': '#121018',
  'editorGutter.addedBackground': '#4ADE80',
  'editorGutter.modifiedBackground': '#60A5FA',
  'editorGutter.deletedBackground': '#F87171',
  'editorWidget.background': '#18131F',
  'editorWidget.border': '#2C243B',
  'editorHoverWidget.background': '#18131F',
  'editorHoverWidget.border': '#2C243B',
  'editorSuggestWidget.background': '#18131F',
  'editorSuggestWidget.border': '#2C243B',
  'editorSuggestWidget.selectedBackground': '#2A1F3D',
  'editorSuggestWidget.highlightForeground': '#C084FC',
  'editorOverviewRuler.border': '#00000000',
  'scrollbarSlider.background': '#6D5C8A44',
  'scrollbarSlider.hoverBackground': '#8A75AA66',
  'scrollbarSlider.activeBackground': '#A58BC888',
  'minimap.background': '#121018',
  'diffEditor.insertedTextBackground': '#4ADE8020',
  'diffEditor.removedTextBackground': '#F8717122',
  'diffEditor.insertedLineBackground': '#4ADE8012',
  'diffEditor.removedLineBackground': '#F8717112',
  'breadcrumb.foreground': '#8E84A5',
  'breadcrumb.focusForeground': '#E9E2F5',
  'breadcrumb.activeSelectionForeground': '#C084FC',
};

const midnightRules = kaliRules.map((rule) => {
  if (rule.token === 'keyword' || rule.token === 'keyword.control') return { ...rule, foreground: '7DD3FC' };
  if (rule.token === 'function') return { ...rule, foreground: 'A5B4FC' };
  if (rule.token === 'string') return { ...rule, foreground: 'A7F3D0' };
  return rule;
});

const midnightColors = {
  ...kaliColors,
  'editor.background': '#0D1420',
  'editor.foreground': '#DDE8F5',
  'editorLineNumber.foreground': '#3F5267',
  'editorLineNumber.activeForeground': '#38BDF8',
  'editorCursor.foreground': '#38BDF8',
  'editor.selectionBackground': '#0369A152',
  'editor.lineHighlightBackground': '#111B2B',
  'editorIndentGuide.background1': '#1E2E42',
  'editorIndentGuide.activeBackground1': '#36526F',
  'editorWidget.background': '#111A28',
  'editorWidget.border': '#22364D',
  'editorHoverWidget.background': '#111A28',
  'editorHoverWidget.border': '#22364D',
  'editorSuggestWidget.background': '#111A28',
  'editorSuggestWidget.border': '#22364D',
  'editorSuggestWidget.selectedBackground': '#12304A',
  'editorSuggestWidget.highlightForeground': '#38BDF8',
  'minimap.background': '#0D1420',
};

const graphiteRules = kaliRules.map((rule) => {
  if (rule.token === 'keyword' || rule.token === 'keyword.control') return { ...rule, foreground: 'D4D4D4' };
  if (rule.token === 'string') return { ...rule, foreground: 'CE9178' };
  if (rule.token === 'number') return { ...rule, foreground: 'B5CEA8' };
  if (rule.token === 'function') return { ...rule, foreground: 'DCDCAA' };
  if (rule.token === 'type' || rule.token === 'type.identifier') return { ...rule, foreground: '4EC9B0' };
  return rule;
});

const graphiteColors = {
  ...kaliColors,
  'editor.background': '#17181B',
  'editor.foreground': '#E4E4E7',
  'editorLineNumber.foreground': '#4C4F56',
  'editorLineNumber.activeForeground': '#D4D4D8',
  'editorCursor.foreground': '#E4E4E7',
  'editor.selectionBackground': '#3F3F4655',
  'editor.lineHighlightBackground': '#1F2024',
  'editorIndentGuide.background1': '#2A2C31',
  'editorIndentGuide.activeBackground1': '#46494F',
  'editorWidget.background': '#1E1F23',
  'editorWidget.border': '#303238',
  'editorHoverWidget.background': '#1E1F23',
  'editorHoverWidget.border': '#303238',
  'editorSuggestWidget.background': '#1E1F23',
  'editorSuggestWidget.border': '#303238',
  'editorSuggestWidget.selectedBackground': '#303238',
  'editorSuggestWidget.highlightForeground': '#E4E4E7',
  'minimap.background': '#17181B',
};

const lightRules = [
  { token: '', foreground: '24222B' },
  { token: 'comment', foreground: '8A8498', fontStyle: 'italic' },
  { token: 'keyword', foreground: '7C3AED' },
  { token: 'keyword.control', foreground: '7C3AED' },
  { token: 'string', foreground: '047857' },
  { token: 'number', foreground: 'B45309' },
  { token: 'regexp', foreground: 'BE185D' },
  { token: 'operator', foreground: '0E7490' },
  { token: 'delimiter', foreground: '6B6478' },
  { token: 'type', foreground: '0E7490' },
  { token: 'type.identifier', foreground: '0E7490' },
  { token: 'function', foreground: '1D4ED8' },
  { token: 'variable', foreground: '24222B' },
  { token: 'constant', foreground: 'B45309' },
  { token: 'tag', foreground: 'BE185D' },
  { token: 'attribute.name', foreground: 'B45309' },
  { token: 'string.key.json', foreground: '7C3AED' },
  { token: 'string.value.json', foreground: '047857' },
];

const lightColors = {
  'editor.background': '#FBFAFC',
  'editor.foreground': '#24222B',
  'editorLineNumber.foreground': '#B5AFC0',
  'editorLineNumber.activeForeground': '#7C3AED',
  'editorCursor.foreground': '#7C3AED',
  'editor.selectionBackground': '#C4B5FD66',
  'editor.inactiveSelectionBackground': '#C4B5FD33',
  'editor.selectionHighlightBackground': '#C4B5FD33',
  'editor.findMatchBackground': '#F59E0B66',
  'editor.findMatchHighlightBackground': '#F59E0B33',
  'editor.lineHighlightBackground': '#F2EEF8',
  'editorIndentGuide.background1': '#E7E1F0',
  'editorIndentGuide.activeBackground1': '#C9BFDA',
  'editorBracketHighlight.foreground1': '#7C3AED',
  'editorBracketHighlight.foreground2': '#0891B2',
  'editorBracketHighlight.foreground3': '#B45309',
  'editorBracketHighlight.foreground4': '#BE185D',
  'editorGutter.background': '#FBFAFC',
  'editorWidget.background': '#FFFFFF',
  'editorWidget.border': '#DDD6E8',
  'editorHoverWidget.background': '#FFFFFF',
  'editorHoverWidget.border': '#DDD6E8',
  'editorSuggestWidget.background': '#FFFFFF',
  'editorSuggestWidget.border': '#DDD6E8',
  'editorSuggestWidget.selectedBackground': '#F1EBFA',
  'editorSuggestWidget.highlightForeground': '#7C3AED',
  'scrollbarSlider.background': '#8B7BA044',
  'scrollbarSlider.hoverBackground': '#8B7BA066',
  'minimap.background': '#FBFAFC',
  'breadcrumb.foreground': '#7A7388',
  'breadcrumb.focusForeground': '#24222B',
  'breadcrumb.activeSelectionForeground': '#7C3AED',
};

export const THEMES = {
  kali: {
    id: 'kali',
    label: 'Kali',
    description: 'Deep purple with cyan signals',
    kind: 'dark',
    monaco: 'kalicode-kali',
    swatch: ['#121018', '#A855F7', '#22D3EE'],
    terminal: {
      background: '#121018',
      foreground: '#E9E2F5',
      cursor: '#C084FC',
      cursorAccent: '#121018',
      selectionBackground: '#7C3AED66',
      black: '#1C1725',
      red: '#F87171',
      green: '#86EFAC',
      yellow: '#FCD34D',
      blue: '#93C5FD',
      magenta: '#C084FC',
      cyan: '#67E8F9',
      white: '#E9E2F5',
      brightBlack: '#6D6382',
      brightRed: '#FCA5A5',
      brightGreen: '#BBF7D0',
      brightYellow: '#FDE68A',
      brightBlue: '#BFDBFE',
      brightMagenta: '#D8B4FE',
      brightCyan: '#A5F3FC',
      brightWhite: '#FFFFFF',
    },
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    description: 'Cool blue low-light contrast',
    kind: 'dark',
    monaco: 'kalicode-midnight',
    swatch: ['#0D1420', '#38BDF8', '#A5B4FC'],
    terminal: {
      background: '#0D1420',
      foreground: '#DDE8F5',
      cursor: '#38BDF8',
      cursorAccent: '#0D1420',
      selectionBackground: '#0369A166',
      black: '#162235',
      red: '#F87171',
      green: '#A7F3D0',
      yellow: '#FDE68A',
      blue: '#93C5FD',
      magenta: '#A5B4FC',
      cyan: '#67E8F9',
      white: '#DDE8F5',
      brightBlack: '#52677D',
      brightRed: '#FCA5A5',
      brightGreen: '#D1FAE5',
      brightYellow: '#FEF3C7',
      brightBlue: '#DBEAFE',
      brightMagenta: '#C7D2FE',
      brightCyan: '#CFFAFE',
      brightWhite: '#FFFFFF',
    },
  },
  graphite: {
    id: 'graphite',
    label: 'Graphite',
    description: 'Neutral, focused, minimal',
    kind: 'dark',
    monaco: 'kalicode-graphite',
    swatch: ['#17181B', '#D4D4D8', '#CE9178'],
    terminal: {
      background: '#17181B',
      foreground: '#E4E4E7',
      cursor: '#E4E4E7',
      cursorAccent: '#17181B',
      selectionBackground: '#52525B66',
      black: '#202126',
      red: '#F87171',
      green: '#A7F3D0',
      yellow: '#FDE68A',
      blue: '#93C5FD',
      magenta: '#D8B4FE',
      cyan: '#67E8F9',
      white: '#E4E4E7',
      brightBlack: '#5B5E66',
      brightRed: '#FCA5A5',
      brightGreen: '#D1FAE5',
      brightYellow: '#FEF3C7',
      brightBlue: '#DBEAFE',
      brightMagenta: '#E9D5FF',
      brightCyan: '#CFFAFE',
      brightWhite: '#FAFAFA',
    },
  },
  light: {
    id: 'light',
    label: 'Daylight',
    description: 'Bright paper with violet accents',
    kind: 'light',
    monaco: 'kalicode-light',
    swatch: ['#FBFAFC', '#7C3AED', '#0891B2'],
    terminal: {
      background: '#FBFAFC',
      foreground: '#24222B',
      cursor: '#7C3AED',
      cursorAccent: '#FBFAFC',
      selectionBackground: '#C4B5FD66',
      black: '#24222B',
      red: '#DC2626',
      green: '#047857',
      yellow: '#B45309',
      blue: '#1D4ED8',
      magenta: '#7C3AED',
      cyan: '#0E7490',
      white: '#F4F1F8',
      brightBlack: '#8A8498',
      brightRed: '#EF4444',
      brightGreen: '#059669',
      brightYellow: '#D97706',
      brightBlue: '#2563EB',
      brightMagenta: '#8B5CF6',
      brightCyan: '#0891B2',
      brightWhite: '#FFFFFF',
    },
  },
};

const EXTENSION_LANGUAGE = {
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  vue: 'html',
  svelte: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ksh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  java: 'java',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  rake: 'ruby',
  php: 'php',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  lua: 'lua',
  r: 'r',
  pl: 'perl',
  pm: 'perl',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  graphql: 'graphql',
  gql: 'graphql',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  m: 'objective-c',
  mm: 'objective-c',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  clj: 'clojure',
  cljs: 'clojure',
  hs: 'haskell',
  tex: 'latex',
  proto: 'proto',
  tf: 'hcl',
  hcl: 'hcl',
  nix: 'nix',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  cmake: 'cmake',
  asm: 'asm',
  s: 'asm',
  v: 'verilog',
  sv: 'verilog',
  vhd: 'vhdl',
  fs: 'fsharp',
  fsx: 'fsharp',
  pas: 'pascal',
  sol: 'sol',
};

const SPECIAL_FILES = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  cmakelists: 'cmake',
  'cmakelists.txt': 'cmake',
  '.bashrc': 'shell',
  '.zshrc': 'shell',
  '.profile': 'shell',
  '.bash_profile': 'shell',
  'package.json': 'json',
  'tsconfig.json': 'json',
  'jsconfig.json': 'json',
  '.gitignore': 'plaintext',
  '.gitattributes': 'plaintext',
  '.dockerignore': 'plaintext',
  'nginx.conf': 'ini',
  'requirements.txt': 'plaintext',
  'pipfile': 'ini',
  'cargo.toml': 'ini',
  'pyproject.toml': 'ini',
  'go.mod': 'go',
};

const available = new Set(monaco.languages.getLanguages().map((language) => language.id));

export function detectLanguage(filePath) {
  if (!filePath) return 'plaintext';
  const base = String(filePath).split('/').pop().toLowerCase();
  if (SPECIAL_FILES[base]) return SPECIAL_FILES[base];
  if (base.startsWith('dockerfile.')) return 'dockerfile';
  if (base.startsWith('makefile.')) return 'makefile';
  const extension = base.includes('.') ? base.split('.').pop() : '';
  const language = EXTENSION_LANGUAGE[extension];
  if (language && available.has(language)) return language;
  return 'plaintext';
}

const LABELS = {
  plaintext: 'Plain Text',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  markdown: 'Markdown',
  shell: 'Shell Script',
  yaml: 'YAML',
  ini: 'INI / TOML',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  sql: 'SQL',
  xml: 'XML',
  python: 'Python',
  lua: 'Lua',
  r: 'R',
  perl: 'Perl',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  graphql: 'GraphQL',
  powershell: 'PowerShell',
  bat: 'Batch',
  'objective-c': 'Objective-C',
  dart: 'Dart',
  elixir: 'Elixir',
  erlang: 'Erlang',
  clojure: 'Clojure',
  haskell: 'Haskell',
  latex: 'LaTeX',
  proto: 'Protocol Buffers',
  hcl: 'HCL / Terraform',
  nix: 'Nix',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  cmake: 'CMake',
  asm: 'Assembly',
  verilog: 'Verilog',
  vhdl: 'VHDL',
  fsharp: 'F#',
  pascal: 'Pascal',
  sol: 'Solidity',
};

export function languageLabel(id) {
  return LABELS[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Plain Text');
}

const LANGUAGE_COLORS = {
  python: '#FACC15',
  javascript: '#FDE047',
  typescript: '#38BDF8',
  json: '#F59E0B',
  html: '#FB923C',
  css: '#60A5FA',
  scss: '#F472B6',
  less: '#818CF8',
  markdown: '#93C5FD',
  shell: '#4ADE80',
  yaml: '#F87171',
  rust: '#FB923C',
  go: '#22D3EE',
  java: '#F87171',
  c: '#60A5FA',
  cpp: '#818CF8',
  csharp: '#A78BFA',
  php: '#A78BFA',
  ruby: '#F87171',
  sql: '#FBBF24',
  xml: '#FB923C',
  lua: '#60A5FA',
  dockerfile: '#38BDF8',
  makefile: '#FBBF24',
  plaintext: '#8E84A5',
};

export function languageColor(id) {
  return LANGUAGE_COLORS[id] || '#A99EBF';
}

export function languageOptions() {
  return monaco.languages
    .getLanguages()
    .map((language) => ({
      id: language.id,
      label: languageLabel(language.id),
      extensions: language.extensions || [],
      aliases: language.aliases || [],
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function setupMonaco() {
  monaco.editor.defineTheme('kalicode-kali', {
    base: 'vs-dark',
    inherit: true,
    rules: kaliRules,
    colors: kaliColors,
  });
  monaco.editor.defineTheme('kalicode-midnight', {
    base: 'vs-dark',
    inherit: true,
    rules: midnightRules,
    colors: midnightColors,
  });
  monaco.editor.defineTheme('kalicode-graphite', {
    base: 'vs-dark',
    inherit: true,
    rules: graphiteRules,
    colors: graphiteColors,
  });
  monaco.editor.defineTheme('kalicode-light', {
    base: 'vs',
    inherit: true,
    rules: lightRules,
    colors: lightColors,
  });

  const typescript = monaco.typescript;
  const compilerOptions = {
    target: typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    module: typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    allowJs: true,
    checkJs: false,
    resolveJsonModule: true,
    jsx: typescript.JsxEmit.React,
    lib: ['es2022', 'dom', 'dom.iterable'],
  };
  typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  typescript.javascriptDefaults.setCompilerOptions({
    ...compilerOptions,
    allowJs: true,
    checkJs: false,
  });
  typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  typescript.typescriptDefaults.setEagerModelSync(true);
  typescript.javascriptDefaults.setEagerModelSync(true);
  monaco.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    enableSchemaRequest: false,
  });

  monaco.editor.setTheme('kalicode-kali');
}

export { monaco };
