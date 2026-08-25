import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BuildTool } from './run/build-tool.mts'

// Every emitter path in this package is built from here. `src/assets.mts` and
// `dist/assets.js` are both one level below the package root, so the same
// relative step works whether a consumer imports the source or the bundle.
const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export const EMITTERS_DIR: string = path.join(PACKAGE_ROOT, 'emitters')

export const GRADLE_INIT_SCRIPT_FILENAME = 'socket-facts.init.gradle'

// Workspace enumeration is a second, cheaper emitter family: it reads the
// already-populated module list and builds no dependency graph. Same jar, same
// init-script mechanism, different task gate.
export const GRADLE_WORKSPACES_INIT_SCRIPT_FILENAME =
  'socket-workspaces.init.gradle'

export const SBT_PLUGIN_FILENAME = 'SocketFactsPlugin.scala'

export const SBT_PLUGIN_SOURCE_FILENAME = 'socket-facts.plugin.scala'

// The filename each plugin source is written as inside the run's `plugins/`
// dir; sbt loads by filename, so the two families must not collide.
export const SBT_WORKSPACES_PLUGIN_FILENAME = 'SocketWorkspacesPlugin.scala'

export const SBT_WORKSPACES_PLUGIN_SOURCE_FILENAME =
  'socket-workspaces.plugin.scala'

export const MAVEN_EXTENSION_JAR_FILENAME = 'socket-facts-maven-extension.jar'

export const MAVEN_EXTENSION_DIR: string = path.join(
  EMITTERS_DIR,
  'maven-extension',
)

export const DOTNET_TOOL_DIR: string = path.join(EMITTERS_DIR, 'dotnet-tool')

export const DOTNET_TOOL_DLL_FILENAME = 'socket-facts-dotnet.dll'

// `dotnet publish` emits a directory, not a single file: the tool assembly
// plus its deps.json/runtimeconfig.json and the compile-time reference
// assemblies. The whole directory ships; this is the entry point inside it.
export const DOTNET_TOOL_PUBLISH_DIR: string = path.join(
  DOTNET_TOOL_DIR,
  'publish',
)

// Fail closed, for the same reason as the Maven jar: a `dotnet` invocation
// pointed at a missing tool assembly is a launch error whose wording ("could
// not execute because the specified command or file was not found") reads like
// a missing SDK, which sends the operator down the wrong path entirely.
export function assertDotnetToolBuilt(): string {
  const dllPath = dotnetToolDllPath()
  if (existsSync(dllPath)) {
    return dllPath
  }
  throw new Error(
    `Socket facts dotnet tool is missing. ` +
      `Where: ${dllPath}. ` +
      `Saw no file, wanted the published tool assembly that ships with this package. ` +
      `Fix: in a published install this is a packaging defect — reinstall @socketsecurity/facts; ` +
      `in a local checkout run \`pnpm run build:dotnet-tool\` (needs a .NET 8+ SDK).`,
  )
}

// Fail closed. Maven with no extension on `-Dmaven.ext.class.path` runs to
// completion and emits nothing, which downstream reads as "this project has no
// dependencies" rather than as a failure — so an absent jar has to throw here,
// before the build runs.
export function assertMavenExtensionBuilt(): string {
  const jarPath = mavenExtensionJarPath()
  if (existsSync(jarPath)) {
    return jarPath
  }
  throw new Error(
    `Maven facts extension jar is missing. ` +
      `Where: ${jarPath}. ` +
      `Saw no file, wanted the built extension jar that ships with this package. ` +
      `Fix: in a published install this is a packaging defect — reinstall @socketsecurity/facts; ` +
      `in a local checkout run \`pnpm run build:maven-extension\` (needs a JDK).`,
  )
}

export function dotnetToolDllPath(): string {
  return path.join(DOTNET_TOOL_PUBLISH_DIR, DOTNET_TOOL_DLL_FILENAME)
}

export function emitterAssetPath(tool: BuildTool): string {
  switch (tool) {
    case 'dotnet':
      return dotnetToolDllPath()
    case 'gradle':
      return gradleInitScriptPath()
    case 'maven':
      return mavenExtensionJarPath()
    case 'sbt':
      return sbtPluginSourcePath()
    default:
      throw new Error(
        `Unsupported build tool. Where: emitterAssetPath. Saw ${String(tool)}, wanted dotnet, gradle, maven, or sbt. Fix: pass one of the supported BuildTool values.`,
      )
  }
}

export function gradleInitScriptPath(): string {
  return path.join(EMITTERS_DIR, GRADLE_INIT_SCRIPT_FILENAME)
}

export function gradleWorkspacesInitScriptPath(): string {
  return path.join(EMITTERS_DIR, GRADLE_WORKSPACES_INIT_SCRIPT_FILENAME)
}

export function mavenExtensionJarPath(): string {
  return path.join(MAVEN_EXTENSION_DIR, MAVEN_EXTENSION_JAR_FILENAME)
}

export function sbtPluginSourcePath(): string {
  return path.join(EMITTERS_DIR, SBT_PLUGIN_SOURCE_FILENAME)
}

export function sbtWorkspacesPluginSourcePath(): string {
  return path.join(EMITTERS_DIR, SBT_WORKSPACES_PLUGIN_SOURCE_FILENAME)
}
