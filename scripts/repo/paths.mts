/**
 * @file Repo-specific path constants. Inherits every fleet path by re-export
 *   (one path, one owner) and adds only the paths this package owns: the
 *   emitter assets and the source tree.
 */

import path from 'node:path'

import { REPO_ROOT } from '../fleet/paths.mts'

export * from '../fleet/paths.mts'

/**
 * The three build-tool emitters that ship as package data.
 */
export const EMITTERS_DIR = path.join(REPO_ROOT, 'emitters')

/**
 * Maven core-extension sources.
 */
export const MAVEN_EXTENSION_DIR = path.join(EMITTERS_DIR, 'maven-extension')

/**
 * The pinned Maven wrapper that builds the core extension. It lives at the repo
 * root rather than beside the pom because its `.mvn/` config directory is a
 * dot-path, and everything under `emitters/` reaches the published tarball.
 */
export const MAVEN_WRAPPER = path.join(REPO_ROOT, 'mvnw')

/**
 * Built jar, at the path `src/assets.mts` resolves at runtime.
 */
export const MAVEN_EXTENSION_JAR = path.join(
  MAVEN_EXTENSION_DIR,
  'socket-facts-maven-extension.jar',
)

/**
 * NuGet emitter sources: a self-contained C# tool run through `dotnet`.
 */
export const DOTNET_TOOL_DIR = path.join(EMITTERS_DIR, 'dotnet-tool')

/**
 * The C# project file `pnpm run build:dotnet-tool` publishes.
 */
export const DOTNET_TOOL_PROJECT = path.join(
  DOTNET_TOOL_DIR,
  'socket-facts-dotnet.csproj',
)

/**
 * Published tool directory, at the path `src/assets.mts` resolves at runtime.
 * `dotnet publish` emits an assembly plus its runtime config, so the unit that
 * ships is a directory rather than a single file.
 */
export const DOTNET_TOOL_PUBLISH_DIR = path.join(DOTNET_TOOL_DIR, 'publish')

/**
 * Entry assembly inside the published tool directory.
 */
export const DOTNET_TOOL_DLL = path.join(
  DOTNET_TOOL_PUBLISH_DIR,
  'socket-facts-dotnet.dll',
)

/**
 * The generation API and the wire contracts.
 */
export const SRC_DIR = path.join(REPO_ROOT, 'src')

export const PACKAGE_DIST_DIR = path.join(REPO_ROOT, 'dist')
