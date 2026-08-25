import {
  gradleWorkspacesInitScriptPath,
  SBT_WORKSPACES_PLUGIN_FILENAME,
  sbtWorkspacesPluginSourcePath,
} from '../assets.mts'
import { assertFactsInvocation } from './invocation.mts'
import { invokeGradle, invokeMaven, invokeSbt } from './invoke-build-tool.mts'

import type { SocketFactsSbomProject } from '../contract/sbom.mts'
import type { FactsGenerationOptions } from './invocation.mts'
import type { FactsGenerationResult } from './result.mts'

const WORKSPACES_TASK = 'socketWorkspaces'

// Maven gates on the hyphenated form; gradle and sbt take the task name.
const MAVEN_WORKSPACES_TASK = 'socket-workspaces'

// Cheap subproject discovery: the emitters read the already-populated module
// list and build no dependency graph, so this answers "which subprojects exist"
// without paying for resolution. A full facts run gets the same list for free
// as a side effect, so reach for this only when the list is all you need.
export type WorkspaceEnumerationResult = {
  code: number
  projects: SocketFactsSbomProject[]
  stderr: string
  stdout: string
}

export async function enumerateGradleWorkspaces(
  config: FactsGenerationOptions,
): Promise<FactsGenerationResult> {
  return await invokeGradle(
    config,
    gradleWorkspacesInitScriptPath(),
    WORKSPACES_TASK,
    'socket-gradle-workspaces-',
  )
}

export async function enumerateMavenWorkspaces(
  config: FactsGenerationOptions,
): Promise<FactsGenerationResult> {
  return await invokeMaven(
    config,
    MAVEN_WORKSPACES_TASK,
    'socket-maven-workspaces-',
  )
}

export async function enumerateSbtWorkspaces(
  config: FactsGenerationOptions,
): Promise<FactsGenerationResult> {
  return await invokeSbt(
    config,
    sbtWorkspacesPluginSourcePath(),
    SBT_WORKSPACES_PLUGIN_FILENAME,
    WORKSPACES_TASK,
    'socket-sbt-workspaces-',
  )
}

export async function enumerateWorkspaces(
  config: FactsGenerationOptions,
): Promise<WorkspaceEnumerationResult> {
  const cfg = { __proto__: null, ...config } as typeof config
  assertFactsInvocation(config)
  const result = await workspaceEnumeratorFor(cfg.tool, config)
  return {
    code: result.code,
    projects: result.facts.projects ?? [],
    stderr: result.stderr,
    stdout: result.stdout,
  }
}

// dotnet is absent on purpose: the dotnet tool enumerates its projects as part
// of the one MSBuild session it already runs, so there is no cheaper pass to
// offer and no second emitter to gate.
export async function workspaceEnumeratorFor(
  tool: FactsGenerationOptions['tool'],
  config: FactsGenerationOptions,
): Promise<FactsGenerationResult> {
  switch (tool) {
    case 'gradle':
      return await enumerateGradleWorkspaces(config)
    case 'maven':
      return await enumerateMavenWorkspaces(config)
    case 'sbt':
      return await enumerateSbtWorkspaces(config)
    default:
      throw new Error(
        `Unsupported build tool for workspace enumeration. Where: enumerateWorkspaces. Saw ${tool}, wanted gradle, maven, or sbt. Fix: run full facts generation instead, which enumerates projects as part of its own pass.`,
      )
  }
}
