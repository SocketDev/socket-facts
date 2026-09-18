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
      const j = glob.indexOf(']', i + 1)
      // Treat as a class only with a non-empty body; else a literal `[`.
      if (j <= i + 1) {
        sb += '\\['
        i += 1
      } else {
        let body = glob.slice(i + 1, j)
        const neg = body.startsWith('!') || body.startsWith('^')
        if (neg) {
          body = body.slice(1)
        }
        if (!body) {
          // `[!]`/`[^]` would emit `[^]`, which JS accepts but Java/.NET
          // reject; the JS validity gate below can't catch that, so replicate
          // the old per-language fallback: the WHOLE glob matches literally.
          return literalRegexSource(glob)
        }
        // Only literal chars and `-` ranges are meaningful; neutralize
        // regex-class tricks (`&` guards Java's `&&` class intersection).
        body = body
          .replace(/\\/g, '\\\\')
          .replace(/\[/g, '\\[')
          .replace(/\]/g, '\\]')
          .replace(/&/g, '\\&')
        sb += `[${neg ? '^' : ''}${body}]`
        i = j + 1
      }
    } else if ('.\\^$|+(){}]'.includes(ch)) {
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
