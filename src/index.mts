export {
  assertDotnetToolBuilt,
  assertMavenExtensionBuilt,
  DOTNET_TOOL_DIR,
  DOTNET_TOOL_DLL_FILENAME,
  DOTNET_TOOL_PUBLISH_DIR,
  dotnetToolDllPath,
  EMITTERS_DIR,
  emitterAssetPath,
  GRADLE_INIT_SCRIPT_FILENAME,
  GRADLE_WORKSPACES_INIT_SCRIPT_FILENAME,
  gradleInitScriptPath,
  gradleWorkspacesInitScriptPath,
  MAVEN_EXTENSION_DIR,
  MAVEN_EXTENSION_JAR_FILENAME,
  mavenExtensionJarPath,
  SBT_PLUGIN_FILENAME,
  SBT_WORKSPACES_PLUGIN_FILENAME,
  SBT_PLUGIN_SOURCE_FILENAME,
  SBT_WORKSPACES_PLUGIN_SOURCE_FILENAME,
  sbtPluginSourcePath,
  sbtWorkspacesPluginSourcePath,
} from './assets.mts'
export { mavenCoordinateKey } from './contract/coordinate.mts'
export { SOCKET_FACTS_SBOM_FORMAT } from './contract/sbom.mts'
export type {
  AnyPURL,
  SocketFactsSbom,
  SocketFactsSbomComponent,
  SocketFactsSbomMetadata,
  SocketFactsSbomProject,
  SocketFactsTool,
} from './contract/sbom.mts'
export type {
  ResolvedArtifactPaths,
  ResolvedPathsSidecar,
  SidecarComponentEntry,
  SidecarProjectEntry,
} from './contract/sidecar.mts'
export {
  assertSocketFactsSbom,
  SOCKET_FACTS_TOOLS,
  validateSocketFactsSbom,
} from './contract/validate-sbom.mts'
export {
  assertResolvedPathsSidecar,
  REACTOR_ENTRY_FIELDS,
  SIDECAR_COMPONENT_FIELDS,
  SIDECAR_PROJECT_FIELDS,
  validateResolvedPathsSidecar,
} from './contract/validate-sidecar.mts'
export type {
  ContractValidation,
  ContractViolation,
} from './contract/violations.mts'
export {
  compareFactsToGroundTruth,
  conformanceViolations,
  renderConformanceReport,
} from './conformance/compare.mts'
export type {
  ComponentDiff,
  ComponentVerdict,
  ConformanceComparison,
  EdgeDiff,
} from './conformance/compare.mts'
export {
  createGroundTruth,
  groundTruthKey,
  parseGradleDependencyRow,
  parseGradleDependencyTree,
} from './conformance/ground-truth.mts'
export type { GradleRow, GroundTruth } from './conformance/ground-truth.mts'
export {
  isMavenTreeNode,
  parseMavenDependencyTreeJson,
} from './conformance/maven-tree.mts'
export type { MavenTreeNode } from './conformance/maven-tree.mts'
export {
  buildArtifactPaths,
  gav,
  unionInto,
} from './pipeline/artifact-paths.mts'
export {
  assembleFacts,
  buildConfigsByProject,
  namespaceEntry,
  purlTypeForTool,
} from './pipeline/assemble.mts'
export type { AssembleOptions, AssembleResult } from './pipeline/assemble.mts'
export { parseRecords, unescapeField } from './pipeline/records.mts'
export type {
  ParsedRecords,
  RawCoord,
  RawNode,
  RawProject,
  RawRoot,
} from './pipeline/records.mts'
export {
  accumulateSidecar,
  attachResolvedPaths,
  createSidecarAccumulator,
  hasResolvedPathsSidecarEntries,
  hasSidecarEntries,
  mergeResolvedPathsSidecars,
  purlSortKey,
  serializeSidecar,
  sortEntriesByPurl,
} from './pipeline/sidecar.mts'
export type { SidecarAccumulator } from './pipeline/sidecar.mts'
export { classifyGradleFailure, GRADLE_DIALECT } from './report/gradle.mts'
export { classifyIvyFailure, SBT_DIALECT } from './report/ivy.mts'
export { classifyMavenFailure, MAVEN_DIALECT } from './report/maven.mts'
export { classifyNugetFailure, NUGET_DIALECT } from './report/nuget.mts'
export {
  DEFAULT_CONFIG_NOUN,
  DEFAULT_EXCLUDE_CONFIGS_OPTION,
  renderResolutionErrorReport,
  renderResolutionReport,
} from './report/render.mts'
export type {
  FailureCategory,
  FailureCategorySpec,
  RenderedResolutionReport,
  ResolutionDialect,
} from './report/render.mts'
export type {
  ResolutionFailure,
  ResolutionReport,
  UnscannableConfig,
} from './report/report-types.mts'
export {
  BUILD_TOOLS,
  buildToolWrapperFilename,
  buildToolWrapperPath,
  conventionalBuildToolBin,
  isBuildTool,
} from './run/build-tool.mts'
export type { BuildTool } from './run/build-tool.mts'
export {
  compileConfigPatterns,
  createConfigGlobFilter,
  globToRegexSource,
  literalRegexSource,
  serializeConfigPatterns,
} from './run/config-glob.mts'
export type { ConfigGlobFilter } from './run/config-glob.mts'
export {
  applyBuildEnvPolicy,
  BUILD_TOOL_ARGUMENT_ENV_VARS,
  scrubBuildToolEnv,
} from './run/env.mts'
export type { BuildEnvPolicy } from './run/env.mts'
export {
  compileExcludePathPatterns,
  createExcludePathFilter,
  excludePathGlobToRegexSource,
  excludePathLiteralSource,
  serializeExcludePathPatterns,
  stripTrailingGlobstar,
  translateExcludePathSegment,
} from './run/exclude-paths-glob.mts'
export type { ExcludePathFilter } from './run/exclude-paths-glob.mts'
export { assertFactsInvocation } from './run/invocation.mts'
export type { FactsInvocation } from './run/invocation.mts'
export type { FactsGenerationResult } from './run/result.mts'
export {
  emitterProps,
  invokeGradle,
  invokeMaven,
  invokeSbt,
  spawnConfigFor,
  writeSbtPlugin,
} from './run/invoke-build-tool.mts'
export { runFactsGeneration } from './run/run-facts-generation.mts'
export {
  enumerateGradleWorkspaces,
  enumerateMavenWorkspaces,
  enumerateSbtWorkspaces,
  enumerateWorkspaces,
  workspaceEnumeratorFor,
} from './run/workspace-enumeration.mts'
export type { WorkspaceEnumerationResult } from './run/workspace-enumeration.mts'
export {
  DEFAULT_FACTS_GENERATION_TIMEOUT_MS,
  FACTS_GENERATION_TIMEOUT_ENV_VAR,
  factsGenerationTimeoutMs,
  parseTimeoutMs,
} from './run/timeouts.mts'
export type { FactsGenerationOptions } from './run/invocation.mts'
