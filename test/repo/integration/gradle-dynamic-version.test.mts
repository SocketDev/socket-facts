import { promises as fs } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  compareFactsToGroundTruth,
  conformanceViolations,
  renderConformanceReport,
} from '../../../src/conformance/compare.mts'
import { runFactsGeneration } from '../../../src/run/run-facts-generation.mts'
import { captureGradleGroundTruth } from '../compat/lib/capture-ground-truth.mts'
import {
  createDynamicVersionWorkspace,
  DYNAMIC_VERSION_CASES,
  FIXTURE_SOURCE_DIR,
} from '../compat/lib/dynamic-version-workspace.mts'
import {
  compatEnv,
  enforceOrAnnounceSkip,
  findBuildToolBin,
  skipReasonFor,
} from '../compat/lib/toolchain.mts'

import type { GroundTruthCapture } from '../compat/lib/capture-ground-truth.mts'
import type { FactsGenerationResult } from '../../../src/run/result.mts'
import type { DynamicVersionWorkspace } from '../compat/lib/dynamic-version-workspace.mts'

// #1385 reversed a delegation because the delegate re-resolved the build later,
// against a different resolution, and diverged on dynamically-versioned
// projects. The compat matrix could not have caught that: every fixture in it
// pins a literal version, so byte-equivalence on those fixtures is satisfiable
// by an implementation that never runs the developer's build. This suite is the
// missing regression test — it fails any resolver that does not resolve ONCE,
// at scan time, against the real build.

describe('the dynamic-version fixture cannot be satisfied statically', () => {
  // Runs with no JVM toolchain: it asserts a property of the fixture text
  // itself, which is what makes the build assertion below meaningful.
  it('names no resolved version anywhere in the committed build file', async () => {
    const buildFile = await fs.readFile(
      path.join(FIXTURE_SOURCE_DIR, 'build.gradle'),
      'utf8',
    )
    // Strip the header comment: it discusses the selectors by name, and the
    // point of the check is what the build LOGIC contains.
    const logic = buildFile
      .split('\n')
      .filter(line => !line.trimStart().startsWith('//'))
      .join('\n')
    for (const entry of DYNAMIC_VERSION_CASES) {
      expect(logic).toContain(`${entry.group}:${entry.name}:${entry.selector}`)
      if (entry.resolves !== entry.selector) {
        expect(logic).not.toContain(
          `${entry.group}:${entry.name}:${entry.resolves}`,
        )
      }
    }
  })

  it('reads its own version from a file the harness writes per run', async () => {
    const buildFile = await fs.readFile(
      path.join(FIXTURE_SOURCE_DIR, 'build.gradle'),
      'utf8',
    )
    expect(buildFile).toContain("new File(projectDir, 'computed-version.txt')")
  })
})

describe('gradle resolves what the build resolves', () => {
  const skipReason = skipReasonFor('gradle')
  let workspace: DynamicVersionWorkspace | undefined
  let result: FactsGenerationResult | undefined
  let groundTruth: GroundTruthCapture | undefined

  beforeAll(async () => {
    if (skipReason) {
      enforceOrAnnounceSkip(skipReason)
      return
    }
    workspace = await createDynamicVersionWorkspace()
    result = await runFactsGeneration({
      bin: findBuildToolBin('gradle')!,
      cwd: workspace.projectDir,
      env: compatEnv(),
      // Offline proves the resolution came from the generated repository, and
      // an isolated Gradle user home keeps a developer's global init scripts
      // out of the run.
      opts: ['--offline', '-g', workspace.gradleUserHome],
      tool: 'gradle',
      withFiles: true,
    })
    groundTruth = await captureGradleGroundTruth(
      findBuildToolBin('gradle')!,
      workspace.projectDir,
      compatEnv(),
      ['--offline', '-g', workspace.gradleUserHome],
      'runtimeClasspath',
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

  for (const entry of DYNAMIC_VERSION_CASES) {
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

  it('materializes the timestamped snapshot artifact, not the -SNAPSHOT name', ctx => {
    if (skipReason) {
      ctx.skip()
      return
    }
    const snapshot = DYNAMIC_VERSION_CASES.find(entry => entry.resolvesFile)!
    const coordKey = `${snapshot.group}:${snapshot.name}:jar:${snapshot.resolves}`
    const targets = result?.artifactPaths.targetsByCoord.get(coordKey) ?? []
    expect(targets.length).toBeGreaterThan(0)
    expect(
      targets.some(target => target.endsWith(snapshot.resolvesFile!)),
    ).toBe(true)
  })

  it('reports the project version the build computed for this run', ctx => {
    if (skipReason) {
      ctx.skip()
      return
    }
    const project = result?.facts.projects?.[0]
    expect(project?.version).toBe(workspace?.computedProjectVersion)
  })

  // The oracle: diff what this package emitted against what Gradle itself says
  // it resolved. A ground-truth report covers one configuration and the facts
  // cover every one, so an extra component in the facts is expected — a
  // missing one, a missing edge, or a version mismatch is the divergence.
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
    for (const entry of DYNAMIC_VERSION_CASES) {
      expect(
        groundTruth!.truth.components.get(`${entry.group}:${entry.name}`),
      ).toBe(entry.resolves)
    }
  })
})
