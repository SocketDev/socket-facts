// Single source of truth for `includeConfigs` / `excludeConfigs` glob
// semantics: case-sensitive; `*`, `?`, and `[...]` character classes with
// `[!..]`/`[^..]` negation; a malformed glob falls back to a literal match,
// never throws. Globs are compiled to regex pattern source strings HERE and
// handed to every emitter (the Gradle init script, the sbt plugin, the Maven
// extension, and the dotnet tool) pre-compiled, so there is exactly one
// implementation and one test suite.
//
// Portability contract: the emitted subset (`.*`, `.`, `[...]`, `[^...]`, and
// backslash-escaped metacharacters) behaves identically in JS RegExp, Java
// java.util.regex (via `.matcher(name).matches()`), and .NET Regex (via
// `IsMatch`). Patterns are anchored with `^(?:...)$` so unanchored matchers
// still test the full name. Class bodies escape `&` because Java classes
// support `&&` intersection (JS/.NET treat it literally). Patterns transport
// comma-joined: an input glob can never contain a comma because the
// comma-split happens before glob parsing.
//
// One deliberate direction change from the per-language implementations this
// replaces: an emitter that receives a pattern it cannot compile DROPS it
// rather than degrading to a literal match. Since an empty include list means
// include-everything, a dropped include widens the scan instead of narrowing
// it. That is safe here because every pattern this module emits is validated
// before it is sent; it only matters to an out-of-band caller driving a
// shipped emitter with hand-written patterns.

import { GLOB_METACHARACTERS, translateGlobClass } from './glob-syntax.mts'

export type ConfigGlobFilter = (name: string) => boolean

// Comma-separated globs → anchored regex pattern sources.
export function compileConfigPatterns(csv: string | undefined): string[] {
  return (csv ?? '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(globToRegexSource)
}

// A config is scanned when it matches some include (or there are none) AND
// matches no exclude — the contract documented on the includeConfigs /
// excludeConfigs options.
export function createConfigGlobFilter(
  includeConfigs: string | undefined,
  excludeConfigs: string | undefined,
): ConfigGlobFilter {
  const includes = compileConfigPatterns(includeConfigs).map(s => new RegExp(s))
  const excludes = compileConfigPatterns(excludeConfigs).map(s => new RegExp(s))
  return name => {
    if (excludes.some(p => p.test(name))) {
      return false
    }
    return !includes.length || includes.some(p => p.test(name))
  }
}

export function globToRegexSource(glob: string): string {
  let sb = ''
  let i = 0
  const n = glob.length
  while (i < n) {
    const ch = glob.charAt(i)
    if (ch === '*') {
      sb += '.*'
      i += 1
    } else if (ch === '?') {
      sb += '.'
      i += 1
    } else if (ch === '[') {
      const cls = translateGlobClass(glob, i)
      if (!cls) {
        return literalRegexSource(glob)
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
  const source = `^(?:${sb})$`
  try {
    // Validity gate: an unbalanced range or a stray quantifier compiled from a
    // hand-written glob degrades to a literal match instead of throwing.
    void new RegExp(source)
    return source
  } catch {
    return literalRegexSource(glob)
  }
}

export function literalRegexSource(glob: string): string {
  return `^(?:${glob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})$`
}

// Transport form handed to the emitters: comma-joined pattern sources (safe,
// because globs — and therefore emitted patterns — cannot contain a comma).
// Empty string when there are no patterns.
export function serializeConfigPatterns(csv: string | undefined): string {
  return compileConfigPatterns(csv).join(',')
}
