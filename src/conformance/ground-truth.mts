import { parseGradleDependencyLine } from './_internal/gradle-row.mts'

// A build tool's OWN authoritative answer, parsed into the shape the comparer
// diffs emitted facts against. The question every one of these answers is "did
// we report what the build actually resolved", which is the only question the
// #1385 divergence turns on.
//
// Keys are `group:name`, deliberately not the full coordinate: a ground-truth
// report names a module and the version the resolver picked for it, and the
// point of the diff is exactly that pairing.
export type GroundTruth = {
  // `group:name` → resolved version.
  components: Map<string, string>
  // `group:name` → the `group:name` keys it depends on.
  dependencies: Map<string, Set<string>>
}

export function createGroundTruth(): GroundTruth {
  return { components: new Map(), dependencies: new Map() }
}

export function groundTruthKey(group: string, name: string): string {
  return `${group}:${name}`
}

// `gradle dependencies --configuration <name>` renders an ASCII tree whose rows
// carry BOTH halves of the pairing that matters:
//
//   +--- demo.dyn:widget:1.+ -> 1.7
//   \--- demo.dyn:gadget:[1.0,2.0)
//   |    \--- org.example:transitive:2.0 (*)
//
// The `-> x` suffix is the resolver's substitution, so a row that has one is a
// row where the declared selector and the resolved version differ. Rows marked
// `(*)` are Gradle's "already shown above" elision and carry no new edge; `(n)`
// means the configuration was not resolved.
export type GradleRow = {
  depth: number
  group: string
  name: string
  version: string
  elided: boolean
}

export function parseGradleDependencyRow(line: string): GradleRow | undefined {
  const parsedLine = parseGradleDependencyLine(line)
  if (!parsedLine) {
    return undefined
  }
  let { body } = parsedLine
  // `selector -> resolved`: the right-hand side is what the build resolved.
  const arrow = body.lastIndexOf(' -> ')
  let resolved: string | undefined
  if (arrow !== -1) {
    resolved = body.slice(arrow + 4).trim()
    body = body.slice(0, arrow).trim()
  }
  const parts = body.split(':')
  if (parts.length < 2) {
    return undefined
  }
  const group = parts[0]!
  const name = parts[1]!
  // A substitution can replace the whole coordinate (`group:name:v -> g:n:v`),
  // in which case the resolved side carries its own colons.
  const substituted = resolved?.split(':')
  const version =
    substituted && substituted.length >= 3
      ? substituted[2]!
      : (resolved ?? parts[2] ?? '')
  return {
    depth: parsedLine.depth,
    elided: parsedLine.elided,
    group: substituted && substituted.length >= 3 ? substituted[0]! : group,
    name: substituted && substituted.length >= 3 ? substituted[1]! : name,
    version,
  }
}

export function parseGradleDependencyTree(text: string): GroundTruth {
  const truth = createGroundTruth()
  const stack: string[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const row = parseGradleDependencyRow(lines[i]!)
    if (!row) {
      continue
    }
    const key = groundTruthKey(row.group, row.name)
    if (row.version) {
      truth.components.set(key, row.version)
    }
    const parent = row.depth > 0 ? stack[row.depth - 1] : undefined
    if (parent) {
      let edges = truth.dependencies.get(parent)
      if (!edges) {
        edges = new Set()
        truth.dependencies.set(parent, edges)
      }
      edges.add(key)
    }
    stack.length = row.depth
    stack.push(key)
  }
  return truth
}
