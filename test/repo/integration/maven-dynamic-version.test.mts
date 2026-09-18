import { promises as fs } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  compareFactsToGroundTruth,
  conformanceViolations,
  renderConformanceReport,
} from '../../../src/conformance/compare.mts'
import { runFactsGeneration } from '../../../src/run/run-facts-generation.mts'
import { captureMavenGroundTruth } from '../compat/lib/capture-ground-truth.mts'
import {
  createMavenDynamicVersionWorkspace,
  MAVEN_DYNAMIC_VERSION_CASES,
  MAVEN_FIXTURE_SOURCE_DIR,
} from '../compat/lib/dynamic-version-workspace.mts'
import {
  compatEnv,
  enforceOrAnnounceSkip,
  findBuildToolBin,
  skipReasonFor,
} from '../compat/lib/toolchain.mts'

import type { GroundTruthCapture } from '../compat/lib/capture-ground-truth.mts'
import type { FactsGenerationResult } from '../../../src/run/result.mts'
import type { MavenDynamicVersionWorkspace } from '../compat/lib/dynamic-version-workspace.mts'

// The Maven leg of the #1385 regression test. It matters more than the others:
// the reachability consumer still falls back to `mvn dependency:get` plus an
// HTTP probe for coordinates the sidecar misses, so "what Maven resolved at
// scan time" is precisely the property that has to be observable rather than
// asserted.

describe('the maven dynamic-version fixture cannot be satisfied statically', () => {
  it('names no resolved version anywhere in the committed pom', async () => {
    const pom = await fs.readFile(
      path.join(MAVEN_FIXTURE_SOURCE_DIR, 'pom.xml'),
      'utf8',
    )
    for (const entry of MAVEN_DYNAMIC_VERSION_CASES) {
      expect(pom).toContain(`<version>${entry.selector}</version>`)
      if (entry.resolves !== entry.selector) {
        expect(pom).not.toContain(`<version>${entry.resolves}</version>`)
      }
    }
  })

  it('takes its own version from a property the harness supplies per run', async () => {
    const pom = await fs.readFile(
      path.join(MAVEN_FIXTURE_SOURCE_DIR, 'pom.xml'),
      'utf8',
    )
    expect(pom).toContain('<version>${revision}</version>')
  })
})

describe('maven resolves what the build resolves', () => {
  const skipReason = skipReasonFor('maven')
  let workspace: MavenDynamicVersionWorkspace | undefined
  let result: FactsGenerationResult | undefined
  let groundTruth: GroundTruthCapture | undefined

  beforeAll(async () => {
    if (skipReason) {
      enforceOrAnnounceSkip(skipReason)
      return
    }
    workspace = await createMavenDynamicVersionWorkspace()
    result = await runFactsGeneration({
      bin: findBuildToolBin('maven')!,
      cwd: workspace.projectDir,
      env: compatEnv(),
      // An isolated local repository plus the mirrored-away Central keeps the
      // run hermetic; `-Drevision` is the per-run project version.
      opts: [
        '-s',
        workspace.settingsFile,
        `-Dmaven.repo.local=${workspace.localRepositoryDir}`,
        `-Drevision=${workspace.computedProjectVersion}`,
      ],
      tool: 'maven',
      withFiles: true,
    })
    groundTruth = await captureMavenGroundTruth(
      findBuildToolBin('maven')!,
      workspace.projectDir,
      compatEnv(),
      [`-Drevision=${workspace.computedProjectVersion}`],
      path.join(workspace.projectDir, 'ground-truth.json'),
    )
  }, 300_000)

  afterAll(async () => {
    await workspace?.cleanup()
  })

  it('runs the build to completion', ctx => {
    if (skipReason) {
      ctx.skip()
      return
    }
    expect(result?.code).toBe(0)
    expect(result?.report.failures).toEqual([])
  })

  for (const entry of MAVEN_DYNAMIC_VERSION_CASES) {
    it(`resolves ${entry.name} ${entry.selector} to ${entry.resolves}`, ctx => {
      if (skipReason) {
        ctx.skip()
        return
      }
      const component = result?.facts.components.find(
        candidate =>
          candidate.namespace === entry.group && candidate.name === entry.name,
      )
      expect(component, `no component for ${entry.name}`).toBeDefined()
      expect(component?.version).toBe(entry.resolves)
    })
  }

  it('materializes an artifact path for every resolved coordinate', ctx => {
    if (skipReason) {
      ctx.skip()
      return
    }
    for (const entry of MAVEN_DYNAMIC_VERSION_CASES) {
      const coordKey = `${entry.group}:${entry.name}:jar:${entry.resolves}`
      expect(
        result?.artifactPaths.targetsByCoord.get(coordKey)?.length ?? 0,
      ).toBeGreaterThan(0)
    }
  })

  it('reports the project version the build computed for this run', ctx => {
    if (skipReason) {
      ctx.skip()
      return
    }
    expect(result?.facts.projects?.[0]?.version).toBe(
      workspace?.computedProjectVersion,
    )
  })

  // The oracle: diff what this package emitted against what Maven itself says
  // it resolved. Maven reports one scope tree while the facts cover every
  // scope, so an extra component in the facts is expected — a missing one, a
  // missing edge, or a version mismatch is the divergence.
  it('diverges from the build in no component and no edge', ctx => {
    if (skipReason) {
      ctx.skip()
      return
    }
    const comparison = compareFactsToGroundTruth(
      result!.facts,
      groundTruth!.truth,
    )
    const violations = conformanceViolations(comparison)
    expect(violations, renderConformanceReport(comparison)).toEqual([])
    expect(comparison.summary.matches).toBeGreaterThan(0)
  })

  it('has an oracle that names the resolved version, not the selector', ctx => {
    if (skipReason) {
      ctx.skip()
      return
    }
    for (const entry of MAVEN_DYNAMIC_VERSION_CASES) {
      expect(
        groundTruth!.truth.components.get(`${entry.group}:${entry.name}`),
      ).toBe(entry.resolves)
    }
  })
})
