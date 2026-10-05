/**
 * Zero-dependency static server for the DASH Wash Club console.
 *
 *   node server.mjs [--port 4173] [--host 0.0.0.0]
 *
 * It only serves files from ./public, binds to 0.0.0.0 by default so the
 * sandbox preview can reach it, and sends no restrictive headers, so the
 * app can be embedded in a preview window.
 */
import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function parseArgs(argv) {
  const options = { port: 4173, host: "0.0.0.0" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") options.port = Number(argv[++index]) || options.port;
    else if (arg === "--host") options.host = argv[++index] ?? options.host;
  }
  if (process.env.PORT) options.port = Number(process.env.PORT) || options.port;
  return options;
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const target = path.join(ROOT, path.normalize(decoded));
  if (!target.startsWith(ROOT)) return null;
  return target;
}

const server = http.createServer(async (request, response) => {
  const start = Date.now();
  let status = 200;

  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      status = 405;
      response.writeHead(status, { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }

    let filePath = safePath(request.url ?? "/");
    if (!filePath) {
      status = 403;
      response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    let details = await stat(filePath).catch(() => null);
    if (details?.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      details = await stat(filePath).catch(() => null);
    }
    if (!details?.isFile()) {
      status = 404;
      response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      response.end("<h1>404 — not found</h1><p><a href=\"/\">Back to DASH Wash Club</a></p>");
      return;
    }

    const type = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    response.writeHead(status, {
      "content-type": type,
      "content-length": details.size,
      "cache-control": "no-cache",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch (error) {
    status = 500;
    response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Server error: ${error.message}`);
  } finally {
    console.log(`${request.method} ${request.url} -> ${status} (${Date.now() - start}ms)`);
  }
});

const { port, host } = parseArgs(process.argv.slice(2));
server.listen(port, host, () => {
  console.log(`DASH Wash Club running at http://${host}:${port}`);
});
