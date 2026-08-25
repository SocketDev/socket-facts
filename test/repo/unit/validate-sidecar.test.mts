import { describe, expect, it } from 'vitest'

import {
  assertResolvedPathsSidecar,
  SIDECAR_COMPONENT_FIELDS,
  SIDECAR_PROJECT_FIELDS,
  validateResolvedPathsSidecar,
} from '../../../src/contract/validate-sidecar.mts'

const FACTS_FILE = '/repo/.socket.facts.json'

// Every field the strict consumer lists, so the field-list tests below compare
// against a complete entry rather than a partial one.
function component(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    dependencies: ['org.example:other:jar:1.0.0'],
    dev: false,
    direct: true,
    id: 'org.example:lib:jar:1.2.3',
    name: 'lib',
    namespace: 'org.example',
    qualifiers: { ext: 'jar' },
    sources: [],
    targets: ['/repo/lib.jar'],
    type: 'maven',
    version: '1.2.3',
    ...overrides,
  }
}

function project(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    dependencies: ['org.example:lib:jar:1.2.3'],
    name: 'app',
    namespace: 'org.example',
    qualifiers: {},
    resolvedAs: [],
    sources: ['/repo/app/src/main/java'],
    subprojectDir: 'app',
    targets: ['/repo/app/target/classes'],
    type: 'maven',
    version: '1.0.0',
    ...overrides,
  }
}

function sidecar(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    [FACTS_FILE]: {
      components: [component()],
      projects: [project()],
      ...overrides,
    },
  }
}

describe('validateResolvedPathsSidecar', () => {
  it('accepts a well-formed sidecar keyed by facts file', () => {
    expect(validateResolvedPathsSidecar(sidecar()).ok).toBe(true)
  })

  it('accepts the empty sidecar', () => {
    expect(validateResolvedPathsSidecar({}).ok).toBe(true)
  })

  it('accepts an entry with targets and sources absent, the no-coordinate case', () => {
    const degenerate = component()
    delete degenerate['targets']
    delete degenerate['sources']

    expect(
      validateResolvedPathsSidecar({
        [FACTS_FILE]: { components: [degenerate], projects: [] },
      }).ok,
    ).toBe(true)
  })

  it('rejects a bare array, the shape the keyed record replaced', () => {
    const result = validateResolvedPathsSidecar([component()])

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.violations[0]?.path).toBe('(root)')
  })

  it('rejects a reactor entry whose components is not an array', () => {
    const result = validateResolvedPathsSidecar({
      [FACTS_FILE]: { components: {}, projects: [] },
    })

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.violations[0]?.path).toBe(
      `${FACTS_FILE}.components`,
    )
  })

  it('rejects an unknown component field the way the strict consumer would', () => {
    const result = validateResolvedPathsSidecar({
      [FACTS_FILE]: {
        components: [component({ ecosystem: 'maven' })],
        projects: [],
      },
    })

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.violations[0]?.path).toBe(
      `${FACTS_FILE}.components[0].ecosystem`,
    )
  })

  it('rejects an unknown project field the way the strict consumer would', () => {
    const result = validateResolvedPathsSidecar({
      [FACTS_FILE]: {
        components: [],
        projects: [project({ id: 'org.example:app:1.0.0' })],
      },
    })

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.violations[0]?.path).toBe(
      `${FACTS_FILE}.projects[0].id`,
    )
  })

  it('rejects an unknown reactor-entry field', () => {
    const result = validateResolvedPathsSidecar({
      [FACTS_FILE]: { components: [], projects: [], metadata: {} },
    })

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.violations[0]?.path).toBe(
      `${FACTS_FILE}.metadata`,
    )
  })

  it('rejects a component missing its id', () => {
    const headless = component()
    delete headless['id']

    const result = validateResolvedPathsSidecar({
      [FACTS_FILE]: { components: [headless], projects: [] },
    })

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.violations[0]?.path).toBe(
      `${FACTS_FILE}.components[0].id`,
    )
  })

  it('reports every malformed field rather than the first', () => {
    const result = validateResolvedPathsSidecar({
      [FACTS_FILE]: {
        components: [component({ name: 7, targets: 'not an array' })],
        projects: [],
      },
    })

    expect(result.ok).toBe(false)
    expect(result.ok ? 0 : result.violations.length).toBeGreaterThan(1)
  })

  it('keeps the component field list in sync with the serialized shape', () => {
    expect([...SIDECAR_COMPONENT_FIELDS]).toEqual(
      Object.keys(component()).toSorted(),
    )
  })

  it('keeps the project field list in sync with the serialized shape', () => {
    expect([...SIDECAR_PROJECT_FIELDS]).toEqual(
      Object.keys(project()).toSorted(),
    )
  })
})

describe('assertResolvedPathsSidecar', () => {
  it('returns the payload when it conforms', () => {
    const payload = sidecar()
    expect(assertResolvedPathsSidecar(payload, 'a test')).toBe(payload)
  })

  it('throws with what, where, saw, and fix', () => {
    let message = ''
    try {
      assertResolvedPathsSidecar('not a sidecar', 'a test')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('does not match the wire contract')
    expect(message).toContain('Where: a test')
    expect(message).toContain('Saw:')
    expect(message).toContain('Fix:')
  })
})
