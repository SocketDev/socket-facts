// Single source of truth for `excludePaths` glob semantics against a build
// root's subproject dirs: anchored, relative, case-sensitive; `*` within one
// path segment, `**` across zero or more segments, `?` within one segment, and
// `[...]` character classes with `[!..]`/`[^..]` negation. Entries are assumed
// pre-validated by the caller (relative, no negation, no `..`, balanced
// brackets, comma-free). A malformed entry falls back to a literal match,
// never throws.
//
// Compiled HERE, once, and handed to every emitter pre-compiled, so there is
// exactly one implementation and one test suite instead of the same algorithm
// re-implemented per language. Sibling of config-glob.mts, which does the same
// for `includeConfigs`/`excludeConfigs`; the difference is that a config glob
// matches a flat name, so its `*` is `.*`, while a path glob is
// segment-aware.
//
// Portability contract: gradle/sbt/maven all run on the JVM and share the same
// regex engine (java.util.regex), so the emitted subset (`.*`, `[^/]*`,
// `[^/]`, `[...]`, `[^...]`, backslash-escaped metacharacters) is
// authoritative for every emitter — this compiler and JS RegExp agree on the
// identical subset. Class bodies escape `&` because Java classes support `&&`
// intersection (JS treats it literally). Each compiled pattern already means
// "this path OR its whole subtree", matching the documented excludePaths
// contract, so an emitter never needs its own "self + /**" expansion.
// Patterns transport comma-joined: an input glob can never contain a comma,
// since the comma-split happens before glob parsing reaches this module.

import { GLOB_METACHARACTERS, translateGlobClass } from './glob-syntax.mts'

export type ExcludePathFilter = (relPath: string) => boolean

export function compileExcludePathPatterns(
  paths: readonly string[] | undefined,
): string[] {
  return (paths ?? []).map(excludePathGlobToRegexSource)
}

export function createExcludePathFilter(
  paths: readonly string[] | undefined,
): ExcludePathFilter {
  const patterns = compileExcludePathPatterns(paths).map(s => new RegExp(s))
  return relPath => patterns.some(p => p.test(relPath))
}

export function excludePathGlobToRegexSource(glob: string): string {
  const stripped = stripTrailingGlobstar(glob)
  if (!stripped) {
    // Defensive only: a caller's validation rejects a pattern that reduces to
    // "match everything".
    return excludePathLiteralSource(glob)
  }
  try {
    const segments = stripped.split('/')
    let base = ''
    for (let i = 0, { length } = segments; i < length; i += 1) {
      const segment = segments[i]!
      const isLast = i === length - 1
      if (segment === '**') {
        // Zero or more whole segments: mid-pattern, each consumed segment
        // carries its own trailing slash; as the last segment, anything
        // (including nothing) for the rest of the path.
        base += isLast ? '.*' : '(?:[^/]+/)*'
      } else {
        base += translateExcludePathSegment(segment)
        if (!isLast) {
          base += '/'
        }
      }
    }
    const source = `^(?:${base})(?:/.*)?$`
    void new RegExp(source)
    return source
  } catch {
    return excludePathLiteralSource(glob)
  }
}

export function excludePathLiteralSource(glob: string): string {
  const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return `^(?:${escaped})(?:/.*)?$`
}

// Transport form handed to the emitters: comma-joined pattern sources. Empty
// string when there are no patterns.
export function serializeExcludePathPatterns(
  paths: readonly string[] | undefined,
): string {
  return compileExcludePathPatterns(paths).join(',')
}

// Strips a trailing `/**` (and trailing slashes) so `dir` and `dir/**` both
// compile to the same base pattern — the "self OR subtree" wrap is what
// encodes matching the subtree, not the user's own suffix.
export function stripTrailingGlobstar(glob: string): string {
  let g = glob
  while (g.endsWith('/')) {
    g = g.slice(0, -1)
  }
  while (g.endsWith('/**')) {
    g = g.slice(0, -3)
    while (g.endsWith('/')) {
      g = g.slice(0, -1)
    }
  }
  return g
}

// Translates one path segment's `*`/`?`/`[...]` — never crosses a `/`.
export function translateExcludePathSegment(segment: string): string {
  let sb = ''
  let i = 0
  const n = segment.length
  while (i < n) {
    const ch = segment.charAt(i)
    if (ch === '*') {
      sb += '[^/]*'
      i += 1
    } else if (ch === '?') {
      sb += '[^/]'
      i += 1
    } else if (ch === '[') {
      const cls = translateGlobClass(segment, i)
      if (!cls) {
        // Signal the caller to fall back to a whole-glob literal match.
        throw new Error('empty-class')
      }
      sb += cls.source
      i = cls.next
    } else if (GLOB_METACHARACTERS.includes(ch)) {
      sb += `\\${ch}`
      i += 1
    } else {
      sb += ch
      i += 1
    }
  }
  return sb
}
