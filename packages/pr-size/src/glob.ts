const regExpSpecials = /[\\^$+.()|[\]{}]/g;

export function globToRegExp(glob: string): RegExp {
  const pattern = glob.startsWith('./') ? glob.slice(2) : glob;
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern.charAt(index);
    if (char === '*' && pattern.charAt(index + 1) === '*') {
      const beforeSlash = pattern.charAt(index + 2) === '/';
      source += beforeSlash ? '(?:.*/)?' : '.*';
      index += beforeSlash ? 3 : 2;
    } else if (char === '*') {
      source += '[^/]*';
      index += 1;
    } else if (char === '?') {
      source += '[^/]';
      index += 1;
    } else {
      source += char.replace(regExpSpecials, '\\$&');
      index += 1;
    }
  }
  const prefix = pattern.includes('/') ? '' : '(?:.*/)?';
  return new RegExp(`^${prefix}${source}$`);
}

export function firstMatch(path: string, globs: readonly string[]): string | undefined {
  return globs.find((glob) => globToRegExp(glob).test(path));
}
