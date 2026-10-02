/**
 * A short buzz on devices that support it (Android Chrome; iOS Safari has no
 * Vibration API, so this is a silent no-op there). Purely a garnish: nothing
 * in the game depends on it being felt.
 */
export function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported or blocked before the first user gesture */
  }
}
