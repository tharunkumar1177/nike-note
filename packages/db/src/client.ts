import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

/** Options for {@link createDb}. */
export type CreateDbOptions = {
  /** Maximum connections in the postgres.js pool. Defaults to 10. */
  poolSize?: number;
};

/** A Drizzle database handle with an explicit shutdown hook. */
export type DbHandle = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  close: () => Promise<void>;
};

/**
 * Creates a Drizzle client backed by postgres.js for the given connection URL.
 */
export function createDb(url: string, options: CreateDbOptions = {}): DbHandle {
  const client = postgres(url, {
    max: options.poolSize ?? 10,
  });

  const db = drizzle(client, { schema });

  return {
    db,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}
