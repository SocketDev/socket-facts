// The glob syntax both compilers share. config-glob.mts matches a flat config
// name, exclude-paths-glob.mts matches a path and is segment-aware, so they
// differ in what `*` and `?` expand to — but character classes and
// metacharacter escaping are identical, and a divergence there would be a
// silent cross-ecosystem mismatch rather than an error.
//
// Portability contract lives with the callers: the emitted subset behaves the
// same in JS RegExp, Java java.util.regex, and .NET Regex.

// Escaped rather than emitted raw, so a glob carrying one matches it literally.
export const GLOB_METACHARACTERS = '.\\^$|+(){}]'

export type GlobClassTranslation = {
  // The regex character class to append.
  source: string
  // Index just past the class in the input.
  next: number
}

// Translates the `[...]` opening at `open`. Returns undefined for an empty
// (possibly negated) body: that would emit `[^]`, which JS accepts and
// Java/.NET reject, so each caller degrades the WHOLE glob to a literal match
// instead of emitting something only one engine parses.
export function translateGlobClass(
  glob: string,
  open: number,
): GlobClassTranslation | undefined {
  const close = glob.indexOf(']', open + 1)
  // A non-empty body is required for a class; otherwise it is a literal `[`.
  if (close <= open + 1) {
    return { source: '\\[', next: open + 1 }
  }
  let body = glob.slice(open + 1, close)
  const negated = body.startsWith('!') || body.startsWith('^')
  if (negated) {
    body = body.slice(1)
  }
  if (!body) {
    return undefined
  }
  // Only literal chars and `-` ranges are meaningful; neutralize regex-class
  // tricks (`&` guards Java's `&&` class intersection).
  // A backslash inside a class body is doubled so the emitted pattern reads
  // it as a literal; these are regex escapes, not path separators.
  // oxlint-disable-next-line socket/prefer-normalize-path -- regex escaping
  body = body
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/&/g, '\\&')
  return { source: `[${negated ? '^' : ''}${body}]`, next: close + 1 }
}
