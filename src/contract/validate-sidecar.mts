import { checkComponent, checkProject } from './validate-sbom.mts'
import {
  checkNoUnknownKeys,
  checkStringArray,
  contractError,
  describeType,
  isPlainObject,
} from './violations.mts'

import type { ResolvedPathsSidecar } from './sidecar.mts'
import type { ContractValidation, ContractViolation } from './violations.mts'

// Mirrors the consumer's strict schemas exactly, field for field. Sorted so a
// reader can diff each list against the consumer's own `.strict()` object at a
// glance — an entry here that the consumer does not list gets the whole payload
// rejected, not just that field.
export const SIDECAR_COMPONENT_FIELDS: readonly string[] = [
  'dependencies',
  'dev',
  'direct',
  'id',
  'name',
  'namespace',
  'qualifiers',
  'sources',
  'targets',
  'type',
  'version',
]

export const SIDECAR_PROJECT_FIELDS: readonly string[] = [
  'dependencies',
  'name',
  'namespace',
  'qualifiers',
  'resolvedAs',
  'sources',
  'subprojectDir',
  'targets',
  'type',
  'version',
]

export const REACTOR_ENTRY_FIELDS: readonly string[] = [
  'components',
  'projects',
]

export function assertResolvedPathsSidecar(
  input: unknown,
  where: string,
): ResolvedPathsSidecar {
  const result = validateResolvedPathsSidecar(input)
  if (result.ok) {
    return result.value
  }
  throw contractError(
    'Resolved-paths sidecar does not match the wire contract',
    where,
    result.violations,
  )
}

export function checkReactorEntry(
  value: unknown,
  path: string,
  violations: ContractViolation[],
): void {
  if (!isPlainObject(value)) {
    violations.push({
      path,
      message: `saw ${describeType(value)}, wanted an object of projects and components`,
    })
    return
  }
  for (const field of ['components', 'projects']) {
    if (!Array.isArray(value[field])) {
      violations.push({
        path: `${path}.${field}`,
        message: `saw ${describeType(value[field])}, wanted an array`,
      })
    }
  }
  const components = value['components']
  if (Array.isArray(components)) {
    for (let i = 0, { length } = components; i < length; i += 1) {
      checkSidecarComponent(
        components[i],
        `${path}.components[${i}]`,
        violations,
      )
    }
  }
  const projects = value['projects']
  if (Array.isArray(projects)) {
    for (let i = 0, { length } = projects; i < length; i += 1) {
      checkSidecarProject(projects[i], `${path}.projects[${i}]`, violations)
    }
  }
  checkNoUnknownKeys(value, REACTOR_ENTRY_FIELDS, path, violations)
}

// Both fields absent is valid: it means there was no computable coordinate to
// resolve against, and the consumer defaults each to `[]`.
export function checkResolvedPaths(
  container: Record<string, unknown>,
  path: string,
  violations: ContractViolation[],
): void {
  for (const field of ['sources', 'targets']) {
    if (container[field] !== undefined) {
      checkStringArray(container[field], `${path}.${field}`, violations)
    }
  }
}

export function checkSidecarComponent(
  value: unknown,
  path: string,
  violations: ContractViolation[],
): void {
  checkComponent(value, path, violations)
  if (!isPlainObject(value)) {
    return
  }
  checkResolvedPaths(value, path, violations)
  checkNoUnknownKeys(value, SIDECAR_COMPONENT_FIELDS, path, violations)
}

export function checkSidecarProject(
  value: unknown,
  path: string,
  violations: ContractViolation[],
): void {
  checkProject(value, path, violations)
  if (!isPlainObject(value)) {
    return
  }
  checkResolvedPaths(value, path, violations)
  checkNoUnknownKeys(value, SIDECAR_PROJECT_FIELDS, path, violations)
}

// Narrowing helper rather than a cast: the per-entry checks above already
// proved the shape, and an empty violation list is the proof.
export function isCheckedSidecar(
  value: unknown,
  violations: readonly ContractViolation[],
): value is ResolvedPathsSidecar {
  return isPlainObject(value) && violations.length === 0
}

export function validateResolvedPathsSidecar(
  input: unknown,
): ContractValidation<ResolvedPathsSidecar> {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      violations: [
        {
          path: '(root)',
          message: `saw ${describeType(input)}, wanted an object keyed by absolute .socket.facts.json path`,
        },
      ],
    }
  }
  const violations: ContractViolation[] = []
  const factsFiles = Object.keys(input)
  for (let i = 0, { length } = factsFiles; i < length; i += 1) {
    const factsFile = factsFiles[i]!
    checkReactorEntry(input[factsFile], factsFile, violations)
  }
  return isCheckedSidecar(input, violations)
    ? { ok: true, value: input }
    : { ok: false, violations }
}
