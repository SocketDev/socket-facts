export function includesFailureTerm(
  text: string,
  terms: readonly string[],
): boolean {
  for (let i = 0, { length } = terms; i < length; i += 1) {
    if (text.includes(terms[i]!)) {
      return true
    }
  }
  return false
}
