import path from 'node:path'

import { BUILD_TOOLS, isBuildTool } from './build-tool.mts'

import type { BuildEnvPolicy } from './env.mts'
import type { BuildTool } from './build-tool.mts'

export function assertFactsInvocation(
  invocation: FactsInvocation,
): FactsInvocation {
  const { bin, cwd, env, opts, tool } = invocation
  if (!isBuildTool(tool)) {
    throw underSpecified(
      'tool',
      describe(tool),
      `one of ${BUILD_TOOLS.join(', ')}`,
    )
  }
  if (typeof bin !== 'string' || !bin) {
    throw underSpecified(
      'bin',
      describe(bin),
      'an absolute path to the build-tool executable',
    )
  }
  if (!path.isAbsolute(bin)) {
    throw underSpecified(
      'bin',
      `the relative path ${JSON.stringify(bin)}`,
      'an absolute path, so the executable that runs does not depend on the working directory or on PATH',
    )
  }
  if (!Array.isArray(opts) || opts.some(opt => typeof opt !== 'string')) {
    throw underSpecified(
      'opts',
      describe(opts),
      'an array of strings (pass [] for no extra build-tool options)',
    )
  }
  if (typeof env !== 'object' || env === null || Array.isArray(env)) {
    throw underSpecified(
      'env',
      describe(env),
      'an environment object (pass {} for an empty environment)',
    )
  }
  if (typeof cwd !== 'string' || !cwd) {
    throw underSpecified(
      'cwd',
      describe(cwd),
      'an absolute path to the project directory',
    )
  }
  if (!path.isAbsolute(cwd)) {
    throw underSpecified(
      'cwd',
      `the relative path ${JSON.stringify(cwd)}`,
      'an absolute path, so the project that gets resolved does not depend on this process’s working directory',
    )
  }
  return invocation
}

export function describe(value: unknown): string {
  if (value === undefined) {
    return 'the field absent'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return value === '' ? 'an empty string' : JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return 'an array with a non-string entry'
  }
  return `a ${typeof value}`
}

// An invocation the CALLER has already resolved and already vetted. This
// package runs it; it never assembles one. Every field is required and none of
// them has a default, because every default would be this package silently
// deciding something the caller is responsible for:
//
//   bin   — which executable runs. A repo can point this at anything, so the
//           caller's trust policy, not a PATH lookup here, picks it.
//   opts  — which build-tool options are honored. Options like Gradle's
//           `--init-script` or Maven's `-Dmaven.ext.class.path` re-point the
//           build; the caller decides which ones a repo may supply.
//   env   — what the build inherits. See env.mts.
//   cwd   — which project is resolved.
export type FactsInvocation = {
  tool: BuildTool
  // Absolute path to the build-tool executable.
  bin: string
  // Build-tool options, already filtered by the caller's trust policy.
  opts: readonly string[]
  // The complete environment for the spawned build.
  env: NodeJS.ProcessEnv
  // Absolute path to the project directory to resolve.
  cwd: string
}

export type FactsGenerationOptions = FactsInvocation & {
  // Reachability only: also materialize resolved artifact paths.
  withFiles?: boolean | undefined
  // Path to a newline-delimited GAV file scoping `withFiles` materialization;
  // absent means materialize everything.
  populateFilesFor?: string | undefined
  includeConfigs?: string | undefined
  excludeConfigs?: string | undefined
  // Scan-root-relative paths whose subprojects are skipped wholesale. Source-
  // file-level exclusion belongs to the downstream reachability analysis.
  excludePaths?: readonly string[] | undefined
  // sbt provisions the project's Scala toolchain (compiler/library/reflect)
  // under `<global base>/boot`, and withFiles' artifactPaths point into it, so
  // that directory must OUTLIVE the call. Supply one and the caller owns
  // creating it and deleting it once those paths are consumed. Unset means an
  // ephemeral dir, created and removed before the call returns — correct
  // without withFiles, and the reason a withFiles sbt run needs this set.
  // Only sbt reads it: no other emitter's artifactPaths point at the tmp dir.
  tmpDir?: string | undefined
  // Default 'scrub'. See env.mts for what 'scrub' removes and why.
  envPolicy?: BuildEnvPolicy | undefined
  stdio?: 'inherit' | 'pipe' | undefined
  signal?: AbortSignal | undefined
  // Ceiling on the build tool's wall time; 0 disables it. Defaults to
  // SOCKET_FACTS_TIMEOUT_MS, then to DEFAULT_FACTS_GENERATION_TIMEOUT_MS.
  timeoutMs?: number | undefined
}

export type Field = 'bin' | 'cwd' | 'env' | 'opts' | 'tool'

export function underSpecified(
  field: Field,
  saw: string,
  wanted: string,
): Error {
  return new Error(
    `Facts generation is under-specified: \`${field}\` is not usable. ` +
      `Where: runFactsGeneration. ` +
      `Saw ${saw}, wanted ${wanted}. ` +
      `Fix: resolve and validate \`${field}\` in the caller and pass the decided value. ` +
      `This package refuses to guess it — see docs/agents.md/repo/trust-boundary.md.`,
  )
}
