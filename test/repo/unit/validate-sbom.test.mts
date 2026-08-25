import { describe, expect, it } from 'vitest'

import { assembleFacts } from '../../../src/pipeline/assemble.mts'
import { parseRecords } from '../../../src/pipeline/records.mts'
import {
  assertSocketFactsSbom,
  validateSocketFactsSbom,
} from '../../../src/contract/validate-sbom.mts'

const RECORDS = [
  'meta\tgradle\t8.14\t21',
  'project\t:app\torg.example\tapp\t1.0.0\t/repo/app',
  'root\tr1\t:app\truntimeClasspath\t1',
  'node\tr1\torg.example:lib:jar:2.0.0\torg.example\tlib\t2.0.0\tjar\t\t1',
].join('\n')

function minimalMetadata(): Record<string, unknown> {
  return {
    format: 'socket-facts-sbom',
    tool: 'gradle',
    toolVersion: '8.14',
  }
}

function minimalSbom(): Record<string, unknown> {
  return {
    components: [{ id: 'org.example:lib:2.0.0', name: 'lib', type: 'maven' }],
    metadata: minimalMetadata(),
  }
}

describe('validateSocketFactsSbom', () => {
  it('accepts what the assembler emits', () => {
    const { facts } = assembleFacts(parseRecords(RECORDS))
    const result = validateSocketFactsSbom(facts)
    expect(result.ok).toBe(true)
  })

  it('accepts a minimal SBOM', () => {
    expect(validateSocketFactsSbom(minimalSbom()).ok).toBe(true)
  })

  it('rejects a metadata format other than socket-facts-sbom', () => {
    const sbom = minimalSbom()
    sbom['metadata'] = { ...minimalMetadata(), format: 'cyclonedx' }
    const result = validateSocketFactsSbom(sbom)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.violations[0]?.path).toBe(
      'metadata.format',
    )
  })

  it('rejects a tool outside gradle, maven, and sbt', () => {
    const sbom = minimalSbom()
    sbom['metadata'] = { ...minimalMetadata(), tool: 'bazel' }
    const result = validateSocketFactsSbom(sbom)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.violations[0]?.path).toBe(
      'metadata.tool',
    )
  })

  it('rejects a component with no id', () => {
    const result = validateSocketFactsSbom({
      components: [{ name: 'lib', type: 'maven' }],
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.violations[0]?.path).toBe(
      'components[0].id',
    )
  })

  // The SBOM travels to a backend that tolerates additive fields, so unlike the
  // sidecar it is deliberately not strict about unknown keys.
  it('tolerates an unknown top-level field', () => {
    const sbom = minimalSbom()
    sbom['schemaVersion'] = 2
    expect(validateSocketFactsSbom(sbom).ok).toBe(true)
  })

  it('rejects a non-object payload', () => {
    expect(validateSocketFactsSbom([]).ok).toBe(false)
  })
})

describe('assertSocketFactsSbom', () => {
  it('throws with what, where, saw, and fix', () => {
    let message = ''
    try {
      assertSocketFactsSbom({ components: 'nope' }, 'a test')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('Socket facts SBOM does not match')
    expect(message).toContain('Where: a test')
    expect(message).toContain('Fix:')
  })
})
