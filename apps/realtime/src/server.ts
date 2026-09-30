import { createServer as createHttpServer, type Server } from "node:http";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/**
 * Create the HTTP server for health checks and future WebSocket upgrades.
 *
 * @returns A Node HTTP server that is not yet listening.
 */
export function createServer(): Server {
  return createHttpServer((req, res) => {
    const pathname = req.url?.split("?")[0] ?? "";

    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200, { "Content-Type": JSON_CONTENT_TYPE });
      res.end(JSON.stringify({ status: "ok", service: "realtime" }));
      return;
    }

    res.writeHead(404, { "Content-Type": JSON_CONTENT_TYPE });
    res.end(JSON.stringify({ error: "Not Found" }));
  });
}
