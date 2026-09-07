import process from 'node:process'

// Bound dependency resolution time so a stalled build cannot block the scan.

export const FACTS_GENERATION_TIMEOUT_ENV_VAR = 'SOCKET_FACTS_TIMEOUT_MS'

export const DEFAULT_FACTS_GENERATION_TIMEOUT_MS = 900_000

export function factsGenerationTimeoutMs(): number {
  return parseTimeoutMs(
    process.env[FACTS_GENERATION_TIMEOUT_ENV_VAR],
    DEFAULT_FACTS_GENERATION_TIMEOUT_MS,
  )
}

// `Number(raw) || fallback` would swallow an explicit 0, which is the way a
// caller asks for no ceiling at all.
export function parseTimeoutMs(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === '') {
    return fallback
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
