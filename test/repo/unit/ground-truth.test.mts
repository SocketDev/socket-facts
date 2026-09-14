import { describe, expect, it } from 'vitest'

import {
  parseGradleDependencyRow,
  parseGradleDependencyTree,
} from '../../../src/conformance/ground-truth.mts'
import { parseMavenDependencyTreeJson } from '../../../src/conformance/maven-tree.mts'

// Captured from `gradle dependencies --configuration runtimeClasspath` against
// the dynamic-version fixture. The `-> x` suffixes are the whole point: they
// are the resolver telling us the declared selector and the resolved version
// are different things.
const GRADLE_REPORT = `
------------------------------------------------------------
Root project 'socket-facts-dynver'
------------------------------------------------------------

runtimeClasspath - Runtime classpath of source set 'main'.
+--- demo.dyn:widget:1.+ -> 1.7
+--- demo.dyn:gadget:[1.0,2.0) -> 1.9
|    \\--- org.example:transitive:2.0
\\--- demo.dyn:sprocket:1.0-SNAPSHOT

A web-based, searchable dependency report is available by adding the --scan option.
`

describe('parseGradleDependencyRow', () => {
  it('reads the resolved version out of a substitution', () => {
    expect(parseGradleDependencyRow('+--- demo.dyn:widget:1.+ -> 1.7')).toEqual(
      {
        depth: 0,
        elided: false,
        group: 'demo.dyn',
        name: 'widget',
        version: '1.7',
      },
    )
  })

  it('reads a literal version when there is no substitution', () => {
    expect(
      parseGradleDependencyRow('\\--- demo.dyn:sprocket:1.0-SNAPSHOT'),
    ).toMatchObject({ name: 'sprocket', version: '1.0-SNAPSHOT' })
  })

  it('follows a whole-coordinate substitution to its right-hand side', () => {
    expect(
      parseGradleDependencyRow(
        '+--- old.group:old-name:1.0 -> new.group:new-name:2.0',
      ),
    ).toMatchObject({ group: 'new.group', name: 'new-name', version: '2.0' })
  })

  it('flags Gradle’s already-shown elision', () => {
    expect(
      parseGradleDependencyRow('|    \\--- org.example:dup:1.0 (*)'),
    ).toMatchObject({ elided: true, name: 'dup' })
  })

  it.each(['(*)', '(c)', '(n)'])('recognizes the %s elision marker', marker => {
    expect(
      parseGradleDependencyRow(`+--- org.example:dup:1.0 ${marker}`),
    ).toMatchObject({ elided: true, version: '1.0' })
  })

  it('ignores prose lines', () => {
    expect(parseGradleDependencyRow('Root project ‘x’')).toBeUndefined()
    expect(parseGradleDependencyRow('')).toBeUndefined()
  })

  it('rejects large malformed rows without excessive backtracking', () => {
    const indent = '|    '.repeat(200_000)
    const whitespace = ' '.repeat(1_000_000)

    expect(
      parseGradleDependencyRow(`${indent}not a dependency`),
    ).toBeUndefined()
    expect(
      parseGradleDependencyRow(`${indent}+---${whitespace}`),
    ).toBeUndefined()
    const malformedElision = parseGradleDependencyRow(
      `+--- org.example:module:1.0${whitespace}(x)`,
    )
    expect(malformedElision).toMatchObject({ elided: false, name: 'module' })
    expect(malformedElision?.version.endsWith('(x)')).toBe(true)
  })
})

describe('parseGradleDependencyTree', () => {
  const truth = parseGradleDependencyTree(GRADLE_REPORT)

  it('records the resolved version, never the selector', () => {
    expect(truth.components.get('demo.dyn:widget')).toBe('1.7')
    expect(truth.components.get('demo.dyn:gadget')).toBe('1.9')
    expect(truth.components.get('demo.dyn:sprocket')).toBe('1.0-SNAPSHOT')
  })

  it('records the nesting as an edge', () => {
    expect([...(truth.dependencies.get('demo.dyn:gadget') ?? [])]).toEqual([
      'org.example:transitive',
    ])
  })

  it('gives a top-level entry no parent', () => {
    expect(truth.dependencies.has('demo.dyn:widget')).toBe(false)
  })
})

describe('parseMavenDependencyTreeJson', () => {
  const truth = parseMavenDependencyTreeJson(
    JSON.stringify({
      artifactId: 'app',
      children: [
        {
          artifactId: 'gadget',
          children: [
            {
              artifactId: 'transitive',
              groupId: 'org.example',
              version: '2.0',
            },
          ],
          groupId: 'demo.dyn',
          version: '1.9',
        },
      ],
      groupId: 'demo',
      version: '0.0.0-resolved-1',
    }),
  )

  it('records the root project as a component', () => {
    expect(truth.components.get('demo:app')).toBe('0.0.0-resolved-1')
  })

  it('records the resolved version of a ranged dependency', () => {
    expect(truth.components.get('demo.dyn:gadget')).toBe('1.9')
  })

  it('records the whole chain of edges', () => {
    expect([...(truth.dependencies.get('demo:app') ?? [])]).toEqual([
      'demo.dyn:gadget',
    ])
    expect([...(truth.dependencies.get('demo.dyn:gadget') ?? [])]).toEqual([
      'org.example:transitive',
    ])
  })

  it('fails loudly on output that is not the tree', () => {
    expect(() => parseMavenDependencyTreeJson('[INFO] building')).toThrow(
      /not valid JSON/,
    )
    expect(() => parseMavenDependencyTreeJson('[]')).toThrow(/no root node/)
  })
})
