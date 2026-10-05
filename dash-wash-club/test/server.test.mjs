/**
 * Integration test: boots server.mjs on a scratch port and checks that the app
 * files are served, that unknown paths 404 and that traversal is refused.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "..", "server.mjs");
const PORT = 4517;
const BASE = `http://127.0.0.1:${PORT}`;

function startServer() {
  const child = spawn(process.execPath, [serverPath, "--port", String(PORT), "--host", "127.0.0.1"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start within 5s")), 5000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("running at")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`server exited early with code ${code}`)));
  });

  return { child, ready };
}

test("server serves the app, rejects traversal and 404s unknown paths", async (t) => {
  const { child, ready } = startServer();
  t.after(() => child.kill("SIGTERM"));
  await ready;

  const index = await fetch(`${BASE}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get("content-type"), /text\/html/);
  const html = await index.text();
  assert.match(html, /DASH Wash Club/);

  const app = await fetch(`${BASE}/app.js`);
  assert.equal(app.status, 200);
  assert.match(app.headers.get("content-type"), /javascript/);

  const lib = await fetch(`${BASE}/lib/code39.js`);
  assert.equal(lib.status, 200);

  const missing = await fetch(`${BASE}/nope.js`);
  assert.equal(missing.status, 404);

  const encodedTraversal = await fetch(`${BASE}/%2e%2e%2fserver.mjs`);
  assert.ok([403, 404].includes(encodedTraversal.status), `traversal got ${encodedTraversal.status}`);

  const head = await fetch(`${BASE}/styles.css`, { method: "HEAD" });
  assert.equal(head.status, 200);
});
