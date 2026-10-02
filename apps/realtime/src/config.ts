/** Default HTTP listen port for the realtime service. */
const DEFAULT_PORT = 4001;

/** Minimum valid TCP port number. */
const MIN_PORT = 1;

/** Maximum valid TCP port number. */
const MAX_PORT = 65535;

/**
 * Parse and validate a TCP port from an environment value.
 *
 * @param value Raw port string; defaults to {@link DEFAULT_PORT} when omitted.
 * @returns Validated port in the inclusive range 1–65535.
 * @throws When the value is missing, non-integer, or out of range.
 */
export function parsePort(value: string | undefined = process.env.PORT): number {
  const raw = value ?? String(DEFAULT_PORT);
  const trimmed = raw.trim();

  if (trimmed.length === 0 || !/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid PORT: must be an integer between ${MIN_PORT} and ${MAX_PORT}, got "${raw}"`,
    );
  }

  const port = Number.parseInt(trimmed, 10);

  if (port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `Invalid PORT: must be an integer between ${MIN_PORT} and ${MAX_PORT}, got ${port}`,
    );
  }

  return port;
}
