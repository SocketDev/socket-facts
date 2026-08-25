import path from 'node:path'

import {
  assertDotnetToolBuilt,
  gradleInitScriptPath,
  SBT_PLUGIN_FILENAME,
  sbtPluginSourcePath,
} from '../assets.mts'
import { serializeConfigPatterns } from './config-glob.mts'
import { serializeExcludePathPatterns } from './exclude-paths-glob.mts'
import { assertFactsInvocation } from './invocation.mts'
import {
  invokeGradle,
  invokeMaven,
  invokeSbt,
  spawnConfigFor,
} from './invoke-build-tool.mts'
import {
  assembleFromRecords,
  runBuildToolNeverThrow,
  withTmpDir,
} from './spawn-build-tool.mts'

import type { FactsGenerationOptions } from './invocation.mts'
import type { FactsGenerationResult } from './result.mts'

const FACTS_TASK = 'socketFacts'

// Maven gates on the hyphenated form; gradle and sbt take the task name.
const MAVEN_FACTS_TASK = 'socket-facts'

// The bundled C# tool runs one MSBuild session — evaluate, then an in-process
// restore, then read each project.assets.json through NuGet's own APIs — under
// a single global-property bag, so the caller's `-p:` options apply to
// resolution and to the emitted graph alike. It writes the same records
// protocol as the JVM emitters.
export async function runDotnet(
  config: FactsGenerationOptions,
): Promise<FactsGenerationResult> {
  const cfg = { __proto__: null, ...config } as typeof config
  const toolDll = assertDotnetToolBuilt()
  return await withTmpDir('socket-dotnet-facts-', async tmp => {
    const recordsFile = path.join(tmp, 'records.tsv')
    const includePatterns = serializeConfigPatterns(cfg.includeConfigs)
    const excludePatterns = serializeConfigPatterns(cfg.excludeConfigs)
    const excludePathPatterns = serializeExcludePathPatterns(cfg.excludePaths)
    const args = [
      toolDll,
      // Caller options FIRST so ours win: ToolOptions.Parse assigns as it walks
      // argv, so a repeated `--records` or `--root` would take the last value.
      ...cfg.opts,
      '--records',
      recordsFile,
      '--root',
      cfg.cwd,
      ...(cfg.withFiles ? ['--with-files'] : []),
      ...(includePatterns ? ['--include-configs', includePatterns] : []),
      ...(excludePatterns ? ['--exclude-configs', excludePatterns] : []),
      ...(excludePathPatterns ? ['--exclude-paths', excludePathPatterns] : []),
      ...(cfg.stdio === 'inherit' ? ['--verbose'] : []),
    ]
    const out = await runBuildToolNeverThrow(
      cfg.bin,
      args,
      spawnConfigFor(config),
    )
    return await assembleFromRecords(out, recordsFile)
  })
}

// Runs one build tool's Socket facts emitter against an already-resolved,
// already-vetted invocation and assembles the records it emits. Writes no
// files: the caller persists the SBOM and consumes the artifact paths.
export async function runFactsGeneration(
  config: FactsGenerationOptions,
): Promise<FactsGenerationResult> {
  const cfg = { __proto__: null, ...config } as typeof config
  assertFactsInvocation(config)
  switch (cfg.tool) {
    case 'dotnet':
      return await runDotnet(config)
    case 'gradle':
      return await runGradle(config)
    case 'maven':
      return await runMaven(config)
    case 'sbt':
      return await runSbt(config)
    default:
      throw new Error(
        `Unsupported build tool. Where: runFactsGeneration. Saw ${String(cfg.tool)}, wanted dotnet, gradle, maven, or sbt. Fix: pass one of the supported BuildTool values.`,
      )
  }
}

export async function runGradle(
  config: FactsGenerationOptions,
): Promise<FactsGenerationResult> {
  return await invokeGradle(
    config,
    gradleInitScriptPath(),
    FACTS_TASK,
    'socket-gradle-facts-',
  )
}

export async function runMaven(
  config: FactsGenerationOptions,
): Promise<FactsGenerationResult> {
  return await invokeMaven(config, MAVEN_FACTS_TASK, 'socket-maven-facts-')
}

export async function runSbt(
  config: FactsGenerationOptions,
): Promise<FactsGenerationResult> {
  return await invokeSbt(
    config,
    sbtPluginSourcePath(),
    SBT_PLUGIN_FILENAME,
    FACTS_TASK,
    'socket-sbt-facts-',
  )
}
