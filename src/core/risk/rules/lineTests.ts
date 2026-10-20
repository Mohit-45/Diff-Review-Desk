// Predicates over one added line of text, shared by the rule registry.

export function includesAny(value: string, markers: readonly string[]): boolean {
  for (const marker of markers) {
    if (value.includes(marker)) {
      return true;
    }
  }
  return false;
}

function isComment(text: string): boolean {
  const trimmed = text.trimStart();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('<!--') ||
    trimmed.startsWith('--')
  );
}

export function isAssertionLine(text: string): boolean {
  return includesAny(text.toLowerCase(), TEST_ASSERTION_MARKERS);
}

const TEST_ASSERTION_MARKERS = [
  'expect(',
  'assert',
  'assertequal',
  'assertthat',
  'should.',
  't.fatal',
  't.error',
  'require.',
  'self.assert',
  'xctassert',
] as const;

const PIPED_SHELL_MARKERS = [
  ' sh',
  '|sh',
  ' bash',
  '|bash',
  ' zsh',
  '|zsh',
  ' fish',
  '|fish',
  ' pwsh',
  '|pwsh',
] as const;

const DESTRUCTIVE_MARKERS = ['chmod 777', 'mkfs'] as const;

const BROAD_REMOVE_TARGET_PREFIXES = ['/*', '*', '$home', '~', '..', './..'] as const;

function pipesDownloadToShell(lower: string): boolean {
  return (
    (lower.includes('curl') || lower.includes('wget')) &&
    lower.includes('|') &&
    includesAny(lower, PIPED_SHELL_MARKERS)
  );
}

function removesBroadPath(lower: string): boolean {
  const remove = lower.indexOf('rm -rf');
  if (remove < 0) {
    return false;
  }
  const target = lower.slice(remove + 'rm -rf'.length).trimStart();
  return (
    target === '/' ||
    target === '.' ||
    BROAD_REMOVE_TARGET_PREFIXES.some((prefix) => target.startsWith(prefix))
  );
}

function isIdentifierCharacter(character: string | undefined): boolean {
  if (character === undefined) {
    return false;
  }
  const code = character.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    character === '_' ||
    character === '$'
  );
}

function isCommandSeparator(character: string | undefined): boolean {
  return character === ';' || character === '|' || character === '&' || character === '\n';
}

/** `dd` as a command word, i.e. not the tail of another word and followed by arguments. */
function startsDdCommand(lower: string, index: number): boolean {
  return (
    lower.startsWith('dd', index) &&
    !isIdentifierCharacter(lower[index - 1]) &&
    (lower[index + 2] === ' ' || lower[index + 2] === '\t')
  );
}

/** `dd` with an `of=/dev/` argument later in the same command, in any argument order. */
function writesToDevice(lower: string): boolean {
  let inDd = false;
  for (let index = 0; index < lower.length; index += 1) {
    const character = lower[index];
    if (isCommandSeparator(character)) {
      inDd = false;
    } else if (startsDdCommand(lower, index)) {
      inDd = true;
    } else if (inDd && lower.startsWith('of=/dev/', index)) {
      return true;
    }
  }
  return false;
}

export function dangerousShell(text: string): boolean {
  const lower = text.toLowerCase();
  if (isComment(text)) {
    return false;
  }
  return (
    pipesDownloadToShell(lower) ||
    includesAny(lower, DESTRUCTIVE_MARKERS) ||
    writesToDevice(lower) ||
    removesBroadPath(lower)
  );
}

const TLS_DISABLED_MARKERS = [
  'node_tls_reject_unauthorized=0',
  'node_tls_reject_unauthorized = 0',
  'curl -k',
  'insecureskipverify: true',
  'insecureskipverify=true',
  'verify=false',
] as const;

export function disabledTls(text: string): boolean {
  if (isComment(text)) {
    return false;
  }
  const lower = text.toLowerCase();
  if (includesAny(lower, TLS_DISABLED_MARKERS)) {
    return true;
  }
  const reject = lower.indexOf('rejectunauthorized');
  return reject >= 0 && lower.slice(reject).includes('false');
}

const ELISION_PHRASES = [
  'existing code',
  'rest of the file',
  'rest of file',
  'rest of the code',
  'rest of code',
  'rest of the function',
  'rest of function',
  'unchanged',
  'same as before',
  'same as above',
  'implementation here',
  'code omitted',
] as const;

export function elisionMarker(text: string): boolean {
  if (!isComment(text)) {
    return false;
  }
  const lower = text.toLowerCase();
  if (lower.includes('...') && !includesAny(lower, ['existing code', 'rest of', 'code omitted'])) {
    return false;
  }
  return includesAny(lower, ELISION_PHRASES);
}

export function placeholder(text: string): boolean {
  return (
    text.includes('TODO') ||
    text.includes('FIXME') ||
    text.includes('XXX') ||
    text.includes('HACK') ||
    text.includes('NotImplementedError') ||
    text.includes('todo!(') ||
    text.toLowerCase().includes('not implemented')
  );
}

/** True when `marker` occurs in `lower` and is not the tail of a longer identifier. */
function includesWord(lower: string, marker: string): boolean {
  let index = lower.indexOf(marker);
  while (index >= 0) {
    if (!isIdentifierCharacter(lower[index - 1])) {
      return true;
    }
    index = lower.indexOf(marker, index + 1);
  }
  return false;
}

export function disabledTest(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('.only(') ||
    lower.includes('.skip(') ||
    includesWord(lower, 'xit(') ||
    lower.includes('pytest.mark.skip') ||
    lower.includes('pytest.mark.xfail') ||
    includesWord(lower, 't.skip') ||
    lower.includes('@disabled') ||
    lower.includes('@ignore')
  );
}

export function suppression(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('eslint-disable') ||
    lower.includes('@ts-ignore') ||
    lower.includes('@ts-nocheck') ||
    lower.includes('@ts-expect-error') ||
    lower.includes('type: ignore') ||
    lower.includes('noqa') ||
    lower.includes('nolint')
  );
}
