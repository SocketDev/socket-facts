import { promises as fs } from 'node:fs'
import path from 'node:path'

import { assertMavenExtensionBuilt } from '../assets.mts'
import { serializeConfigPatterns } from './config-glob.mts'
import { applyBuildEnvPolicy } from './env.mts'
import { serializeExcludePathPatterns } from './exclude-paths-glob.mts'
import {
  assembleFromRecords,
  runBuildToolNeverThrow,
  withTmpDir,
} from './spawn-build-tool.mts'
import { factsGenerationTimeoutMs } from './timeouts.mts'

import type { FactsGenerationOptions } from './invocation.mts'
import type { FactsGenerationResult } from './result.mts'
import type { SpawnConfig } from './spawn-build-tool.mts'

// One invocation per build tool, parameterized by which emitter runs. Two
// emitter families ride these: facts generation, and the cheaper workspace
// enumeration that reads the module list without building a dependency graph.
// Keeping the invocation in one place is what stops the two families' property
// sets and argument order from drifting apart.

export function emitterProps(
  config: FactsGenerationOptions,
  prefix: '-D' | '-P',
): string[] {
  const cfg = { __proto__: null, ...config } as typeof config
  const props: string[] = []
  if (cfg.withFiles) {
    props.push(`${prefix}socket.withFiles=true`)
  }
  if (cfg.populateFilesFor) {
    props.push(`${prefix}socket.populateFilesFor=${cfg.populateFilesFor}`)
  }
  // Globs compile to anchored regex pattern sources HERE, because
  // config-glob.mts is the single glob implementation; each emitter only
  // compiles the patterns it is handed.
  const includePatterns = serializeConfigPatterns(cfg.includeConfigs)
  if (includePatterns) {
    props.push(`${prefix}socket.includeConfigs=${includePatterns}`)
  }
  const excludePatterns = serializeConfigPatterns(cfg.excludeConfigs)
  if (excludePatterns) {
    props.push(`${prefix}socket.excludeConfigs=${excludePatterns}`)
  }
  // Path globs compile to anchored regex sources HERE too
  // (exclude-paths-glob.mts is the single implementation); each emitter just
  // Pattern.compile()s what it receives.
  const excludePathPatterns = serializeExcludePathPatterns(cfg.excludePaths)
  if (excludePathPatterns) {
    props.push(`${prefix}socket.excludePaths=${excludePathPatterns}`)
  }
  return props
}

export async function invokeGradle(
  config: FactsGenerationOptions,
  initScriptPath: string,
  task: string,
  tmpDirPrefix: string,
): Promise<FactsGenerationResult> {
  const cfg = { __proto__: null, ...config } as typeof config
  return await withTmpDir(tmpDirPrefix, async tmp => {
    const recordsFile = path.join(tmp, 'records.tsv')
    // The configuration cache stays off: the init script's resolvedConfiguration
    // API and its shared accumulator are not cache-safe.
    const args = [
      // Caller options FIRST so ours win: every tool resolves a repeated
      // property last-one-wins, measured on maven `-D` and gradle `-P`. Going
      // last also covers alias forms a collision check cannot enumerate —
      // maven's `--define` is `-D` and matches no `-D` pattern.
      ...cfg.opts,
      '--init-script',
      initScriptPath,
      '-Dorg.gradle.configuration-cache=false',
      `-Psocket.recordsFile=${recordsFile}`,
      ...emitterProps(config, '-P'),
      task,
      '--no-daemon',
      '--console=plain',
    ]
    const out = await runBuildToolNeverThrow(
      cfg.bin,
      args,
      spawnConfigFor(config),
    )
    return await assembleFromRecords(out, recordsFile)
  })
}

export async function invokeMaven(
  config: FactsGenerationOptions,
  task: string,
  tmpDirPrefix: string,
): Promise<FactsGenerationResult> {
  const cfg = { __proto__: null, ...config } as typeof config
  const jarPath = assertMavenExtensionBuilt()
  return await withTmpDir(tmpDirPrefix, async tmp => {
    const recordsFile = path.join(tmp, 'records.tsv')
    // `validate` is the cheapest phase that reaches afterSessionEnd; no compile
    // is needed, because the analysis reads configured paths, not classes.
    const props = [
      `-Dmaven.ext.class.path=${jarPath}`,
      `-Dsocket.task=${task}`,
      `-Dsocket.recordsFile=${recordsFile}`,
      ...emitterProps(config, '-D'),
    ]
    const args = [...cfg.opts, ...props, '--batch-mode', 'validate']
    const out = await runBuildToolNeverThrow(
      cfg.bin,
      args,
      spawnConfigFor(config),
    )
    return await assembleFromRecords(out, recordsFile)
  })
}

export async function invokeSbt(
  config: FactsGenerationOptions,
  pluginSourcePath: string,
  pluginDestFilename: string,
  task: string,
  tmpDirPrefix: string,
): Promise<FactsGenerationResult> {
  const cfg = { __proto__: null, ...config } as typeof config
  const run = async (globalBase: string): Promise<FactsGenerationResult> => {
    await writeSbtPlugin(globalBase, pluginSourcePath, pluginDestFilename)
    const recordsFile = path.join(globalBase, 'records.tsv')
    // A fresh per-run global base rather than ~/.sbt: sbt executes everything
    // under plugins/, so a shared path is a code-injection surface. BSP is off
    // for this run.
    const props = [
      `-Dsbt.global.base=${globalBase}`,
      '-Dsbt.server.autostart=false',
      `-Dsocket.recordsFile=${recordsFile}`,
      ...emitterProps(config, '-D'),
    ]
    // sbt's launcher does not always honor JAVA_HOME, and never overrides a
    // caller-supplied --java-home.
    const javaHome = cfg.env['JAVA_HOME']
    const javaHomeOpt =
      javaHome && !cfg.opts.includes('--java-home')
        ? ['--java-home', javaHome]
        : []
    const args = [...javaHomeOpt, ...cfg.opts, ...props, '--batch', task]
    const out = await runBuildToolNeverThrow(
      cfg.bin,
      args,
      spawnConfigFor(config),
    )
    return await assembleFromRecords(out, recordsFile)
  }
  // A caller-supplied base is NOT cleaned up here: its lifetime is the reason
  // it was supplied.
  return cfg.tmpDir
    ? await run(cfg.tmpDir)
    : await withTmpDir(tmpDirPrefix, run)
}

export function spawnConfigFor(config: FactsGenerationOptions): SpawnConfig {
  const cfg = { __proto__: null, ...config } as typeof config
  return {
    cwd: cfg.cwd,
    env: applyBuildEnvPolicy(cfg.env, cfg.envPolicy ?? 'scrub'),
    stdio: cfg.stdio ?? 'pipe',
    timeoutMs: cfg.timeoutMs ?? factsGenerationTimeoutMs(),
    ...(cfg.signal ? { signal: cfg.signal } : {}),
  }
}

export async function writeSbtPlugin(
  globalBase: string,
  pluginSourcePath: string,
  pluginDestFilename: string,
): Promise<void> {
  const source = await fs.readFile(pluginSourcePath, 'utf8')
  const pluginsDir = path.join(globalBase, 'plugins')
  await fs.mkdir(pluginsDir, { recursive: true })
  await fs.writeFile(path.join(pluginsDir, pluginDestFilename), source)
}
