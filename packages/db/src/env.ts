import { QUIRE_ERROR_CODES, QuireError } from "@quire/core";

const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//i;

/**
 * Reads and validates `DATABASE_URL` from the given environment map.
 * @throws {QuireError} When the variable is missing or not a PostgreSQL URL.
 */
export function readDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.DATABASE_URL;

  if (raw === undefined || raw.trim() === "") {
    throw new QuireError(
      QUIRE_ERROR_CODES.VALIDATION,
      "DATABASE_URL is required",
    );
  }

  const url = raw.trim();

  if (!POSTGRES_URL_PATTERN.test(url)) {
    throw new QuireError(
      QUIRE_ERROR_CODES.VALIDATION,
      "DATABASE_URL must be a PostgreSQL connection URL (postgres:// or postgresql://)",
    );
  }

  return url;
}
