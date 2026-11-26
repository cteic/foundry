export interface AddedLine {
  path: string;
  line: number;
  text: string;
}

const hunkHeader = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function unquote(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) {
    return path;
  }
  return path.slice(1, -1).replace(/\\(.)/g, (_match, char: string) => {
    if (char === 't') {
      return '\t';
    }
    return char === 'n' ? '\n' : char;
  });
}

function newPath(header: string): string | undefined {
  const target = header.slice('+++ '.length).replace(/\t$/, '');
  if (target === '/dev/null') {
    return undefined;
  }
  const path = unquote(target);
  return path.startsWith('b/') ? path.slice(2) : path;
}

export function parseAddedLines(diff: string): AddedLine[] {
  const added: AddedLine[] = [];
  let path: string | undefined;
  let line = 0;
  let removedLeft = 0;
  let addedLeft = 0;
  for (const text of diff.split('\n')) {
    if (removedLeft > 0 && text.startsWith('-')) {
      removedLeft -= 1;
    } else if (addedLeft > 0 && text.startsWith('+')) {
      if (path !== undefined) {
        added.push({ path, line, text: text.slice(1) });
      }
      line += 1;
      addedLeft -= 1;
    } else if (text.startsWith('\\')) {
      continue;
    } else if (text.startsWith('+++ ')) {
      path = newPath(text);
    } else {
      const hunk = hunkHeader.exec(text);
      if (hunk !== null) {
        removedLeft = Number(hunk[1] ?? '1');
        line = Number(hunk[2]);
        addedLeft = Number(hunk[3] ?? '1');
      }
    }
  }
  return added;
}
