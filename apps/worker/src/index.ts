/** Background worker entrypoint: health server and graceful shutdown. */

import { getHealthPort } from "./config.js";
import { createHealthServer } from "./health.js";

const server = createHealthServer();
const port = getHealthPort();

server.on("error", (error) => {
  console.error("Health server failed:", error);
  process.exit(1);
});

server.listen(port, () => {
  console.info(`Worker health server listening on port ${port}`);
});

/**
 * Close the health server cleanly when the process receives SIGTERM.
 */
function handleSigterm(): void {
  server.close((error) => {
    if (error) {
      console.error("Error during graceful shutdown:", error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on("SIGTERM", handleSigterm);
