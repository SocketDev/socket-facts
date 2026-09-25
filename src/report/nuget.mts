import { includesFailureTerm } from './utils.mts'

import type { FailureCategory, ResolutionDialect } from './render.mts'

// NuGet restore: failures come from the assets file's `logs` section, whose
// messages carry NU-prefixed codes, plus the emitter's own synthetic
// missing-assets-file failure. No variant ambiguity, so every kind blocks.
export function classifyNugetFailure(detail: string): FailureCategory {
  const t = (detail || '').toLowerCase()
  // Assembly-load/runtime failures inside the tool are environment problems,
  // not feed problems — check FIRST: NuGet wraps them in NU1301-style messages
  // whose wording would otherwise classify as repository-or-network and send
  // people chasing connectivity. `showReason` on config-problem surfaces the
  // real loader message in the summary.
  if (
    includesFailureTerm(t, [
      'could not load file or assembly',
      'missingmethodexception',
      '0x80131040',
    ])
  ) {
    return 'config-problem'
  }
  if (
    includesFailureTerm(t, [
      'nu1301',
      'nu1302',
      'nu1303',
      'nu1304',
      'unable to load the service index',
      '401',
      '403',
      'unauthorized',
      'forbidden',
      'connection refused',
      'timed out',
    ])
  ) {
    return 'repository-or-network'
  }
  if (
    includesFailureTerm(t, [
      'nu1101',
      'nu1102',
      'nu1103',
      'unable to find package',
    ])
  ) {
    return 'not-found'
  }
  // Project/framework incompatibilities and a restore that never produced an
  // assets file are project-configuration problems, not missing packages.
  if (
    includesFailureTerm(t, [
      'nu1105',
      'nu1201',
      'nu1202',
      'is not compatible with',
      'produced no project.assets.json',
      'stopped before it finished',
    ])
  ) {
    return 'config-problem'
  }
  return 'other'
}

export const NUGET_DIALECT: ResolutionDialect = {
  categories: [
    {
      key: 'not-found',
      header: () => `  Not found on any feed:`,
      blocking: true,
    },
    {
      key: 'repository-or-network',
      header: n =>
        `  Feed or network error — ${n} could not reach or authenticate to a package feed:`,
      blocking: true,
    },
    {
      key: 'config-problem',
      header: n => `  Project/restore problem (reason from ${n}):`,
      showReason: true,
      blocking: true,
    },
    {
      key: 'other',
      header: n => `  Other restore failures (reason from ${n}):`,
      showReason: true,
      blocking: true,
    },
  ],
  classify: classifyNugetFailure,
  configNoun: 'target framework',
  excludeConfigsOption: '--exclude-target-frameworks',
  label: 'NuGet',
}
