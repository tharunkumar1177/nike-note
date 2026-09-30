/** Minimal HTTP health endpoint for process liveness checks. */

import { createServer, type Server } from "node:http";
import { parse as parseUrl } from "node:url";

const HEALTH_RESPONSE = JSON.stringify({ status: "ok", service: "worker" });
const NOT_FOUND_RESPONSE = JSON.stringify({ error: "Not Found" });

/**
 * Create an HTTP server exposing `GET /health` and JSON 404 responses elsewhere.
 */
export function createHealthServer(): Server {
  return createServer((req, res) => {
    const pathname = parseUrl(req.url ?? "", false).pathname;

    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(HEALTH_RESPONSE);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(NOT_FOUND_RESPONSE);
  });
}
