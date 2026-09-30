import { parsePort } from "./config.js";
import { createServer } from "./server.js";

const port = parsePort();
const server = createServer();

server.on("error", (error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Realtime service listening on port ${port}`);
});

/**
 * Close the HTTP server gracefully when the process receives SIGTERM.
 */
function shutdown(): void {
  server.close((error) => {
    if (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
