export type SupportedCodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'go'
  | 'cpp'
  | 'c'
  | 'rust'
  | 'java'
  | 'bash'
  | 'matlab';

export type CodeTokenType = 'plain' | 'keyword' | 'builtin' | 'type' | 'string' | 'number' | 'comment' | 'operator';

export interface CodeToken {
  type: CodeTokenType;
  text: string;
}

export interface CodeHighlightLine {
  tokens: CodeToken[];
}

interface InternalLanguageConfig {
  id: SupportedCodeLanguage;
  label: string;
  aliases: string[];
  browserRunnable: boolean;
  placeholder: string;
  lineComment: string;
  keywords: string[];
  builtins: string[];
}

export interface CodeLanguageOption {
  id: SupportedCodeLanguage;
  label: string;
  browserRunnable: boolean;
  placeholder: string;
}

const LANGUAGE_CONFIG: InternalLanguageConfig[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    aliases: ['js', 'javascript'],
    browserRunnable: true,
    placeholder: '// JavaScript code',
    lineComment: '//',
    keywords: ['function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'class', 'extends', 'import', 'export', 'default', 'async', 'await'],
    builtins: ['console', 'Math', 'Date', 'JSON', 'Promise', 'Map', 'Set', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Error']
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    aliases: ['ts', 'typescript'],
    browserRunnable: false,
    placeholder: '// TypeScript code',
    lineComment: '//',
    keywords: ['type', 'interface', 'implements', 'namespace', 'declare', 'readonly', 'public', 'private', 'protected', 'abstract', 'enum', 'as', 'satisfies', 'keyof', 'infer', 'extends', 'import', 'export', 'default', 'async', 'await', 'function', 'return', 'const', 'let'],
    builtins: ['Promise', 'Map', 'Set', 'Array', 'Record', 'Partial', 'Pick', 'Omit', 'Readonly']
  },
  {
    id: 'python',
    label: 'Python',
    aliases: ['py', 'python'],
    browserRunnable: false,
    placeholder: '# Python code',
    lineComment: '#',
    keywords: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'pass', 'class', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'global', 'nonlocal'],
    builtins: ['print', 'len', 'range', 'dict', 'list', 'set', 'tuple', 'int', 'float', 'str', 'bool', 'sum', 'min', 'max', 'abs']
  },
  {
    id: 'go',
    label: 'Go',
    aliases: ['go', 'golang'],
    browserRunnable: false,
    placeholder: '// Go code',
    lineComment: '//',
    keywords: ['package', 'import', 'func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'go', 'defer', 'select', 'struct', 'interface', 'map', 'chan', 'type', 'const', 'var'],
    builtins: ['fmt', 'make', 'append', 'len', 'cap', 'panic', 'recover', 'error', 'string', 'int', 'float64', 'bool']
  },
  {
    id: 'cpp',
    label: 'C++',
    aliases: ['cpp', 'c++', 'cc', 'cxx'],
    browserRunnable: false,
    placeholder: '// C++ code',
    lineComment: '//',
    keywords: ['int', 'float', 'double', 'char', 'void', 'bool', 'auto', 'const', 'class', 'struct', 'namespace', 'template', 'typename', 'if', 'else', 'for', 'while', 'switch', 'case', 'return', 'break', 'continue', 'try', 'catch', 'throw', 'new', 'delete'],
    builtins: ['std', 'cout', 'cin', 'vector', 'string', 'map', 'set', 'unique_ptr', 'shared_ptr']
  },
  {
    id: 'c',
    label: 'C',
    aliases: ['c'],
    browserRunnable: false,
    placeholder: '// C code',
    lineComment: '//',
    keywords: ['int', 'float', 'double', 'char', 'void', 'const', 'struct', 'enum', 'typedef', 'if', 'else', 'for', 'while', 'switch', 'case', 'return', 'break', 'continue', 'static', 'extern'],
    builtins: ['printf', 'scanf', 'malloc', 'free', 'size_t', 'FILE', 'fopen', 'fclose']
  },
  {
    id: 'rust',
    label: 'Rust',
    aliases: ['rust', 'rs'],
    browserRunnable: false,
    placeholder: '// Rust code',
    lineComment: '//',
    keywords: ['fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'impl', 'trait', 'where', 'if', 'else', 'match', 'for', 'while', 'loop', 'break', 'continue', 'return', 'pub', 'crate', 'use', 'mod'],
    builtins: ['println', 'String', 'Vec', 'Option', 'Result', 'Some', 'None', 'Ok', 'Err']
  },
  {
    id: 'java',
    label: 'Java',
    aliases: ['java'],
    browserRunnable: false,
    placeholder: '// Java code',
    lineComment: '//',
    keywords: ['class', 'interface', 'enum', 'public', 'private', 'protected', 'static', 'final', 'void', 'int', 'double', 'boolean', 'if', 'else', 'for', 'while', 'switch', 'case', 'return', 'break', 'continue', 'try', 'catch', 'throw', 'new', 'import', 'package'],
    builtins: ['System', 'String', 'List', 'Map', 'Set', 'Integer', 'Double', 'Boolean']
  },
  {
    id: 'bash',
    label: 'Bash',
    aliases: ['bash', 'sh', 'shell'],
    browserRunnable: false,
    placeholder: '# Bash script',
    lineComment: '#',
    keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while', 'case', 'esac', 'function', 'return', 'local'],
    builtins: ['echo', 'printf', 'grep', 'sed', 'awk', 'cat', 'ls', 'cd', 'export', 'chmod']
  },
  {
    id: 'matlab',
    label: 'MATLAB',
    aliases: ['matlab', 'octave'],
    browserRunnable: false,
    placeholder: '% MATLAB script',
    lineComment: '%',
    keywords: ['function', 'end', 'if', 'elseif', 'else', 'for', 'while', 'switch', 'case', 'otherwise', 'break', 'continue', 'return', 'try', 'catch', 'classdef', 'properties', 'methods'],
    builtins: ['plot', 'disp', 'fprintf', 'zeros', 'ones', 'linspace', 'meshgrid', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'sum', 'mean', 'size', 'length']
  }
];

const LANGUAGE_BY_ID = new Map<SupportedCodeLanguage, InternalLanguageConfig>(
  LANGUAGE_CONFIG.map((config) => [config.id, config])
);
const ALIAS_MAP = new Map<string, SupportedCodeLanguage>();

for (const config of LANGUAGE_CONFIG) {
  for (const alias of config.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), config.id);
  }
}

const TYPE_HEAVY_LANGUAGES = new Set<SupportedCodeLanguage>(['typescript', 'go', 'cpp', 'c', 'rust', 'java']);
const TOKEN_PATTERN = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|==|!=|<=|>=|=>|&&|\|\||\+\+|--|[+\-*/%<>:=!&|^~.,;()[\]{}]/g;

export const CODE_LANGUAGE_OPTIONS: CodeLanguageOption[] = LANGUAGE_CONFIG.map((config) => ({
  id: config.id,
  label: config.label,
  browserRunnable: config.browserRunnable,
  placeholder: config.placeholder
}));

export function normalizeCodeLanguage(value: unknown): SupportedCodeLanguage {
  if (typeof value !== 'string') return 'javascript';
  const key = value.trim().toLowerCase();
  return ALIAS_MAP.get(key) ?? 'javascript';
}

export function getCodeLanguageLabel(language: SupportedCodeLanguage): string {
  return LANGUAGE_BY_ID.get(language)?.label ?? 'JavaScript';
}

export function getCodePlaceholder(language: SupportedCodeLanguage): string {
  return LANGUAGE_BY_ID.get(language)?.placeholder ?? '// Code';
}

export function canExecuteInBrowser(language: SupportedCodeLanguage): boolean {
  return LANGUAGE_BY_ID.get(language)?.browserRunnable === true;
}

export function getCodeBackendHint(language: SupportedCodeLanguage): string {
  const label = getCodeLanguageLabel(language);
  return `[info] ${label} 需要后端执行器，当前前端仅支持链路调度与高亮。`;
}

function splitLineComment(line: string, marker: string): { code: string; comment: string } {
  if (!line || !marker) return { code: line, comment: '' };

  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (!inDouble && !inBacktick && char === '\'') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inBacktick && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inBacktick = !inBacktick;
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (marker.length === 1) {
        if (char === marker) {
          return { code: line.slice(0, i), comment: line.slice(i) };
        }
      } else if (char === marker[0] && next === marker[1]) {
        return { code: line.slice(0, i), comment: line.slice(i) };
      }
    }
  }

  return { code: line, comment: '' };
}

function classifyWord(word: string, language: SupportedCodeLanguage): CodeTokenType {
  const config = LANGUAGE_BY_ID.get(language);
  if (!config) return 'plain';
  if (config.keywords.includes(word)) return 'keyword';
  if (config.builtins.includes(word)) return 'builtin';
  if (TYPE_HEAVY_LANGUAGES.has(language) && /^[A-Z][A-Za-z0-9_]*$/.test(word)) return 'type';
  return 'plain';
}

function tokenizeCodePart(code: string, language: SupportedCodeLanguage): CodeToken[] {
  if (!code) return [];
  const tokens: CodeToken[] = [];
  let cursor = 0;

  for (const match of code.matchAll(TOKEN_PATTERN)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ type: 'plain', text: code.slice(cursor, index) });
    }

    let type: CodeTokenType = 'plain';
    if (/^["'`]/.test(value)) {
      type = 'string';
    } else if (/^\d/.test(value)) {
      type = 'number';
    } else if (/^[A-Za-z_]/.test(value)) {
      type = classifyWord(value, language);
    } else if (/^[+\-*/%<>:=!&|^~.,;()[\]{}]+$/.test(value)) {
      type = 'operator';
    }

    tokens.push({ type, text: value });
    cursor = index + value.length;
  }

  if (cursor < code.length) {
    tokens.push({ type: 'plain', text: code.slice(cursor) });
  }

  return tokens;
}

export function highlightCode(content: string, language: SupportedCodeLanguage): CodeHighlightLine[] {
  if (content.length === 0) return [];
  const config = LANGUAGE_BY_ID.get(language);
  if (!config) return [];

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  return lines.map((line) => {
    const { code, comment } = splitLineComment(line, config.lineComment);
    const tokens = tokenizeCodePart(code, language);
    if (comment) {
      tokens.push({ type: 'comment', text: comment });
    }
    if (tokens.length === 0) {
      tokens.push({ type: 'plain', text: '' });
    }
    return { tokens };
  });
}
