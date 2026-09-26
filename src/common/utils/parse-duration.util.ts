/**
 * Parses simple duration strings ("30m", "1h", "7d") into milliseconds.
 * Used for non-JWT token lifetimes (refresh tokens, password reset tokens).
 */
export function parseDurationToMs(value: string, fallbackMs = 7 * 24 * 60 * 60 * 1000): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * unitMs[unit];
}
