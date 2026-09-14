const GRADLE_CONNECTORS = new Set(['\\', '+'])
const GRADLE_ELISIONS = new Set(['(*)', '(c)', '(n)'])
const GRADLE_INDENT_CHARACTERS = new Set([' ', '|'])

export type ParsedGradleDependencyLine = {
  body: string
  depth: number
  elided: boolean
}

export function parseGradleDependencyLine(
  line: string,
): ParsedGradleDependencyLine | undefined {
  let bodyStart = 0
  while (GRADLE_INDENT_CHARACTERS.has(line[bodyStart]!)) {
    bodyStart += 1
  }
  if (
    !GRADLE_CONNECTORS.has(line[bodyStart]!) ||
    !line.startsWith('---', bodyStart + 1)
  ) {
    return undefined
  }
  const depth = Math.floor(bodyStart / 5)
  bodyStart += 4
  const separatorStart = bodyStart
  while (bodyStart < line.length && line[bodyStart]!.trim().length === 0) {
    bodyStart += 1
  }
  if (bodyStart === separatorStart || bodyStart === line.length) {
    return undefined
  }
  let body = line.slice(bodyStart).trimEnd()
  const elisionStart = body.length - 3
  const elided =
    elisionStart > 0 &&
    body[elisionStart - 1]!.trim().length === 0 &&
    GRADLE_ELISIONS.has(body.slice(elisionStart))
  if (elided) {
    body = body.slice(0, elisionStart).trimEnd()
  }
  return { body, depth, elided }
}
