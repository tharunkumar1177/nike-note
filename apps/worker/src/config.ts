/** Worker process configuration read from the environment. */

const DEFAULT_HEALTH_PORT = 4002;
const MIN_PORT = 1;
const MAX_PORT = 65535;

/**
 * Parse and validate a TCP port from a raw environment string.
 *
 * @throws {Error} When the value is not an integer in the valid port range.
 */
function parsePort(raw: string, envName: string): number {
  const trimmed = raw.trim();

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `${envName} must be an integer between ${MIN_PORT} and ${MAX_PORT}, got "${raw}"`,
    );
  }

  const port = Number.parseInt(trimmed, 10);

  if (port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `${envName} must be an integer between ${MIN_PORT} and ${MAX_PORT}, got "${raw}"`,
    );
  }

  return port;
}

/**
 * Resolve the HTTP health-check listen port from `HEALTH_PORT`.
 * Defaults to 4002 when unset or empty.
 */
export function getHealthPort(): number {
  const raw = process.env.HEALTH_PORT;

  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_HEALTH_PORT;
  }

  return parsePort(raw, "HEALTH_PORT");
}
