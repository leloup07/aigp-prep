// Shims for older iOS Safari (iPhone/iPad not on the latest iOS). Imported before anything else.

// Object.hasOwn: iOS < 15.4 (used by react-markdown)
if (!(Object as any).hasOwn) {
  (Object as any).hasOwn = (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k);
}

/**
 * RegExp lookbehind "(?<=…)" / "(?<!…)" is a syntax error on iOS < 16.4. remark-gfm builds one at
 * runtime for e-mail autolinks; on those devices we swap such patterns for one that never matches
 * (e-mails simply aren't auto-linked) instead of crashing the whole page.
 */
export function makeRegExpShim(Native: RegExpConstructor): RegExpConstructor {
  const Shim = function (pattern: string | RegExp, flags?: string) {
    if (typeof pattern === 'string' && /\(\?<[=!]/.test(pattern)) pattern = '(?!)';
    return new Native(pattern, flags);
  } as unknown as RegExpConstructor;
  Object.setPrototypeOf(Shim, Native);
  (Shim as any).prototype = Native.prototype;
  return Shim;
}

function supportsLookbehind() {
  try {
    new RegExp('(?<=a)b');
    return true;
  } catch {
    return false;
  }
}

if (!supportsLookbehind()) (globalThis as any).RegExp = makeRegExpShim(RegExp);
