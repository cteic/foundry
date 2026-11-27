import { basename } from 'node:path';
import type { Rule } from 'eslint';

// The part of a file name before the first dot must be kebab-case.
// Router file names pass too: [id], [...slug], [[...slug]], (group), _layout and +not-found.
const kebab = '[a-z0-9]+(?:-[a-z0-9]+)*';
const routeParam = String.raw`\[{1,2}(?:\.{3})?[A-Za-z0-9-]+\]{1,2}`;
const routeGroup = String.raw`\(${kebab}\)`;
const allowed = new RegExp(String.raw`^[_+]?(?:${kebab}|${routeParam}|${routeGroup})$`);

// A route parameter such as [...slug] holds dots, so it ends at its last closing bracket.
function stemOf(name: string): string {
  const closing = name.lastIndexOf(']');
  return name.startsWith('[') && closing > 0
    ? name.slice(0, closing + 1)
    : (name.split('.')[0] ?? '');
}

export function isKebabFileName(fileName: string): boolean {
  return allowed.test(stemOf(basename(fileName)));
}

export const filenameCase: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'File names must be kebab-case.' },
    schema: [],
    messages: {
      notKebab: 'Rename {{name}} to kebab-case, such as session-logger.tsx.',
    },
  },
  create(context) {
    return {
      Program(node) {
        if (!isKebabFileName(context.filename)) {
          context.report({
            node,
            messageId: 'notKebab',
            data: { name: basename(context.filename) },
          });
        }
      },
    };
  },
};
