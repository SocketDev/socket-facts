/**
 * @file Vitiate coverage-guided fuzz target (Tier 2) for the records
 *   line-protocol parser and the SBOM assembler — this package's
 *   untrusted-input boundary.
 *   The bytes come from a build tool running inside a repository the scan does
 *   not control, so a records file can carry any content a Gradle script, an
 *   sbt plugin, or a Maven extension was made to emit. The failure that matters
 *   is not a crash: it is a parse that silently drops a dependency, or an
 *   assembler that emits an SBOM the wire contract rejects, because either one
 *   ships a half-empty graph that reads as "this project is clean".
 *   Run via `pnpm run test:fuzz`.
 */

import { fuzz } from '@vitiate/core'

import { validateSocketFactsSbom } from '../../src/contract/validate-sbom.mts'
import { validateResolvedPathsSidecar } from '../../src/contract/validate-sidecar.mts'
import { assembleFacts } from '../../src/pipeline/assemble.mts'
import { parseRecords, unescapeField } from '../../src/pipeline/records.mts'
import {
  accumulateSidecar,
  createSidecarAccumulator,
  serializeSidecar,
} from '../../src/pipeline/sidecar.mts'
import { renderResolutionErrorReport } from '../../src/report/render.mts'

fuzz('the records parser never throws on arbitrary bytes', data => {
  const parsed = parseRecords(data.toString('utf8'))
  for (const [rootId, root] of parsed.roots) {
    if (root.rootId !== rootId) {
      throw new Error(
        `records parser keyed root ${JSON.stringify(rootId)} under rootId ${JSON.stringify(root.rootId)}`,
      )
    }
  }
  for (const [key, project] of parsed.projects) {
    if (project.projectKey !== key) {
      throw new Error(
        `records parser keyed project ${JSON.stringify(key)} under projectKey ${JSON.stringify(project.projectKey)}`,
      )
    }
  }
})

fuzz('field unescaping is total', data => {
  const text = data.toString('utf8')
  // Framing depends on this never producing a tab or a newline from an escaped
  // field: either one would let a hostile value forge an extra record.
  const round = unescapeField(text.replaceAll('\\', '\\\\'))
  if (round !== text) {
    throw new Error('unescapeField did not round-trip a fully escaped field')
  }
})

fuzz('the assembler always emits a contract-valid SBOM', data => {
  const { facts } = assembleFacts(parseRecords(data.toString('utf8')))
  const result = validateSocketFactsSbom(facts)
  if (!result.ok) {
    throw new Error(
      `assembler emitted an SBOM the contract rejects: ${result.violations
        .map(violation => `${violation.path}: ${violation.message}`)
        .join('; ')}`,
    )
  }
})

fuzz('the sidecar accumulator always emits a contract-valid payload', data => {
  const { artifactPaths, facts } = assembleFacts(
    parseRecords(data.toString('utf8')),
  )
  const acc = createSidecarAccumulator()
  accumulateSidecar(acc, facts, artifactPaths)
  const result = validateResolvedPathsSidecar(serializeSidecar(acc))
  if (!result.ok) {
    throw new Error(
      `sidecar accumulator emitted a payload the strict consumer would reject: ${result.violations
        .map(violation => `${violation.path}: ${violation.message}`)
        .join('; ')}`,
    )
  }
})

fuzz('the resolution report never throws on arbitrary failure text', data => {
  const { report } = assembleFacts(parseRecords(data.toString('utf8')))
  for (const tool of ['gradle', 'maven', 'sbt'] as const) {
    renderResolutionErrorReport(report.failures, report.scannedConfigs, tool, {
      unscannable: report.unscannable,
    })
  }
})
