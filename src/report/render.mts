import { GRADLE_DIALECT } from './gradle.mts'
import { SBT_DIALECT } from './ivy.mts'
import { MAVEN_DIALECT } from './maven.mts'
import { NUGET_DIALECT } from './nuget.mts'

import type { BuildTool } from '../run/build-tool.mts'
import type { ResolutionFailure, UnscannableConfig } from './report-types.mts'

// Recognized from the build tool's message; drives wording AND whether the kind
// is blocking. An unrecognized message degrades to 'other' (blocking) — safe.
export type FailureCategory =
  | 'not-found'
  | 'no-matching-variant'
  | 'capability-conflict'
  | 'variant-ambiguity'
  | 'repository-or-network'
  | 'config-problem'
  | 'other'

export type FailureCategorySpec = {
  key: FailureCategory
  // Whether failures of this kind fail the run (fail-closed unless
  // --ignore-unresolved). A non-blocking kind never affects the exit code and
  // is surfaced only as a one-line `notice`.
  blocking: boolean
  header?: ((toolLabel: string) => string) | undefined
  showReason?: boolean | undefined
  notice?:
    | ((toolLabel: string, depCount: number, configCount: number) => string)
    | undefined
}

// Per-resolver classify + render/score policy.
export type ResolutionDialect = {
  label: string
  classify: (detail: string) => FailureCategory
  categories: FailureCategorySpec[]
  // What this ecosystem calls a "config", and the caller-facing option name
  // that narrows the set. NuGet resolves per target framework, so the JVM
  // wording would tell a .NET user to pass an option that does not exist.
  configNoun?: string | undefined
  excludeConfigsOption?: string | undefined
}

export const DEFAULT_CONFIG_NOUN = 'configuration'

export const DEFAULT_EXCLUDE_CONFIGS_OPTION = '--exclude-configs'

export type RenderedResolutionReport = {
  // Failure report for blocking kinds; empty when nothing blocks.
  summary: string
  // Build tool's own full messages for all kinds; surfaced at --verbose.
  details: string
  // Caller fails the run iff this is true and not --ignore-unresolved.
  hasBlockingFailures: boolean
  // One-liner(s) for non-blocking kinds; empty when none.
  nonBlockingNotice: string
}

const RESOLUTION_REPORT_ARTIFACT_LIMIT = 15
const RESOLUTION_REPORT_CONFIG_LIMIT = 20

// Drop a bare "group:name" when a versioned "group:name:v" of the same module
// is also present: the lenient resolver reports both forms for one failure.
export function dedupCoords(coords: Iterable<string>): string[] {
  const set = new Set(coords)
  const versioned = new Set<string>()
  for (const c of set) {
    const p = c.split(':')
    if (p.length >= 3) {
      versioned.add(`${p[0]}:${p[1]}`)
    }
  }
  return [...set]
    .filter(c => c.split(':').length >= 3 || !versioned.has(c))
    .toSorted()
}

export function dialectFor(tool: BuildTool): ResolutionDialect {
  switch (tool) {
    case 'dotnet':
      return NUGET_DIALECT
    case 'sbt':
      return SBT_DIALECT
    case 'maven':
      return MAVEN_DIALECT
    case 'gradle':
    default:
      return GRADLE_DIALECT
  }
}

export function firstLine(s: string): string {
  return (
    (s || '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(Boolean) ?? ''
  )
}

export function fmtList(list: string[], limit: number): string {
  const shown = list.slice(0, limit).join(', ')
  return list.length > limit ? `${shown} (+${list.length - limit} more)` : shown
}

export function renderResolutionErrorReport(
  failures: ResolutionFailure[],
  scannedConfigs: string[],
  tool: BuildTool,
  opts: {
    ignoreUnresolved?: boolean | undefined
    unscannable?: UnscannableConfig[] | undefined
  } = {},
): RenderedResolutionReport {
  return renderResolutionReport(
    failures,
    scannedConfigs,
    dialectFor(tool),
    opts,
  )
}

// Severity is per-kind; the exit-code decision lives in the caller. We do NOT
// cross-reference what resolved elsewhere: the failed selector carries no
// classifier/type, so relating a failed and a succeeded dep is unsound.
// oxlint-disable-next-line complexity -- category aggregation and rendering.
export function renderResolutionReport(
  failures: ResolutionFailure[],
  scannedConfigs: string[],
  dialect: ResolutionDialect,
  opts: {
    ignoreUnresolved?: boolean | undefined
    unscannable?: UnscannableConfig[] | undefined
  } = {},
): RenderedResolutionReport {
  const name = dialect.label
  const noun = dialect.configNoun ?? DEFAULT_CONFIG_NOUN
  const excludeOption =
    dialect.excludeConfigsOption ?? DEFAULT_EXCLUDE_CONFIGS_OPTION
  const unscannable = opts.unscannable ?? []
  const unscannableConfigs = new Set(unscannable.map(u => u.config))
  const specOf = new Map(dialect.categories.map(c => [c.key, c]))
  const isBlocking = (cat: FailureCategory): boolean =>
    specOf.get(cat)?.blocking ?? true

  // Aggregate by (coord, category): one module can fail with different causes
  // across configs. Keep first-seen detail, union the configs.
  type CoordInfo = {
    coord: string
    category: FailureCategory
    detail: string
    configs: Set<string>
  }
  const byKey = new Map<string, CoordInfo>()
  const keyOf = (coord: string, category: FailureCategory): string =>
    `${coord} ${category}`
  for (let i = 0, { length } = failures; i < length; i += 1) {
    const f = failures[i]!
    const category = dialect.classify(f.detail)
    const key = keyOf(f.coord, category)
    let info = byKey.get(key)
    if (!info) {
      info = { coord: f.coord, category, detail: f.detail, configs: new Set() }
      byKey.set(key, info)
    }
    if (f.config) {
      info.configs.add(f.config)
    }
  }
  const allInfos = [...byKey.values()]

  // A whole-config throw is classified by the same cause rules as a per-dep
  // failure: ambiguity stays lenient, every other cause is fail-closed.
  const unscannableInfos = unscannable.map(u => {
    const category = dialect.classify(u.detail)
    return { __proto__: null, ...u, category, blocking: isBlocking(category) }
  })
  const blockingUnscannable = unscannableInfos.filter(u => u.blocking)
  const nonBlockingUnscannable = unscannableInfos.filter(u => !u.blocking)

  const perDepBlockingConfigs = new Set<string>()
  for (let i = 0, { length } = allInfos; i < length; i += 1) {
    const info = allInfos[i]!
    if (isBlocking(info.category)) {
      for (const c of info.configs) {
        perDepBlockingConfigs.add(c)
      }
    }
  }
  const blockingConfigs = new Set([
    ...perDepBlockingConfigs,
    ...blockingUnscannable.map(u => u.config),
  ])
  const blockingFailed = [...blockingConfigs].toSorted()
  // An un-scannable config was attempted but resolved nothing, so it didn't succeed.
  const succeeded = scannedConfigs
    .filter(c => !blockingConfigs.has(c) && !unscannableConfigs.has(c))
    .toSorted()

  const groups = dialect.categories
    .map(spec => ({
      __proto__: null,
      spec,
      infos: dedupCoords(
        allInfos.filter(i => i.category === spec.key).map(i => i.coord),
      ).map(c => byKey.get(keyOf(c, spec.key))!),
    }))
    .filter(g => g.infos.length)
  const blockingGroups = groups.filter(g => g.spec.blocking)
  const nonBlockingGroups = groups.filter(g => !g.spec.blocking)
  const blockingCount = blockingGroups.reduce((n, g) => n + g.infos.length, 0)
  const hasBlockingFailures =
    blockingCount > 0 || blockingUnscannable.length > 0
  const willFail = hasBlockingFailures && !opts.ignoreUnresolved

  const out: string[] = []
  if (hasBlockingFailures) {
    if (blockingCount > 0) {
      // A failure with no config attribution — a restore-level error, say —
      // would render as "in 0 …(s)". Drop the clause instead.
      const inConfigs = perDepBlockingConfigs.size
        ? ` in ${perDepBlockingConfigs.size} ${noun}(s)`
        : ''
      out.push(
        opts.ignoreUnresolved
          ? `Ignored ${blockingCount} unresolved dependency(ies)${inConfigs}:`
          : `Could not resolve ${blockingCount} dependency(ies)${inConfigs}:`,
      )
      for (const { infos, spec } of blockingGroups) {
        out.push('')
        out.push(spec.header ? spec.header(name) : '')
        const shownInfos = infos.slice(0, RESOLUTION_REPORT_ARTIFACT_LIMIT)
        for (let i = 0, { length } = shownInfos; i < length; i += 1) {
          const info = shownInfos[i]!
          const fl = firstLine(info.detail)
          const reasonSuffix = spec.showReason && fl ? `  [${fl}]` : ''
          out.push(`    - ${info.coord}${reasonSuffix}`)
        }
        if (infos.length > RESOLUTION_REPORT_ARTIFACT_LIMIT) {
          out.push(
            `    … and ${infos.length - RESOLUTION_REPORT_ARTIFACT_LIMIT} more`,
          )
        }
      }
    }
    if (blockingUnscannable.length) {
      // Separate from the per-dep block above, but only if there is one — otherwise
      // the summary would lead with a blank line (a dangling ✗ under logger.fail).
      if (out.length) {
        out.push('')
      }
      out.push(
        opts.ignoreUnresolved
          ? `Ignored ${blockingUnscannable.length} ${noun}(s) that could not be scanned:`
          : `Could not scan ${blockingUnscannable.length} ${noun}(s) (reason from ${name}):`,
      )
      const shownUnscannable = blockingUnscannable.slice(
        0,
        RESOLUTION_REPORT_CONFIG_LIMIT,
      )
      for (let i = 0, { length } = shownUnscannable; i < length; i += 1) {
        const u = shownUnscannable[i]!
        const fl = firstLine(u.detail)
        out.push(`    - ${u.config}${fl ? `  [${fl}]` : ''}`)
      }
      if (blockingUnscannable.length > RESOLUTION_REPORT_CONFIG_LIMIT) {
        out.push(
          `    … and ${blockingUnscannable.length - RESOLUTION_REPORT_CONFIG_LIMIT} more`,
        )
      }
    }
    out.push('')
    if (succeeded.length) {
      out.push(
        `Resolution succeeded in: ${fmtList(succeeded, RESOLUTION_REPORT_CONFIG_LIMIT)}`,
      )
    }
    if (blockingFailed.length) {
      out.push(
        `Resolution failed in: ${fmtList(blockingFailed, RESOLUTION_REPORT_CONFIG_LIMIT)}`,
      )
    }
    if (willFail) {
      out.push('')
      out.push(`To proceed, re-run with either:`)
      out.push(`    --ignore-unresolved`)
      if (blockingFailed.length) {
        out.push(`    ${excludeOption} '${blockingFailed.join(',')}'`)
      }
    }
    out.push('')
    out.push(`Re-run with --verbose for ${name}'s full messages.`)
  }

  const notices: string[] = []
  for (const { infos, spec } of nonBlockingGroups) {
    if (!spec.notice) {
      continue
    }
    const configCount = new Set(infos.flatMap(i => [...i.configs])).size
    notices.push(spec.notice(name, infos.length, configCount))
  }
  // A config-level throw whose cause classifies as variant ambiguity is surfaced, not failed —
  // matching the deliberately-lenient per-dep variant-ambiguity policy.
  if (nonBlockingUnscannable.length) {
    const n = new Set(nonBlockingUnscannable.map(u => u.config)).size
    notices.push(
      `Could not scan ${n} ${noun}(s) — re-run with --verbose for ${name}'s messages.`,
    )
  }

  const detailLines = [`${name}'s full message for each unresolved dependency:`]
  for (let i = 0, { length } = allInfos; i < length; i += 1) {
    const info = allInfos[i]!
    detailLines.push('')
    detailLines.push(`  ${info.coord}:`)
    const infoLines = (info.detail || '(no message)').split(/\r?\n/)
    for (let j = 0, { length: lineCount } = infoLines; j < lineCount; j += 1) {
      detailLines.push(`    ${infoLines[j]}`)
    }
  }
  if (unscannable.length) {
    detailLines.push('')
    detailLines.push(`${name} ${noun}s that could not be scanned:`)
    for (const u of unscannable) {
      detailLines.push('')
      detailLines.push(`  ${u.config}:`)
      const uLines = (u.detail || '(no message)').split(/\r?\n/)
      for (let j = 0, { length: lineCount } = uLines; j < lineCount; j += 1) {
        detailLines.push(`    ${uLines[j]}`)
      }
    }
  }

  const report = {
    __proto__: null,
    summary: out.join('\n'),
    details: detailLines.join('\n'),
    hasBlockingFailures,
    nonBlockingNotice: notices.join('\n'),
  }
  return report
}
