// Local editor server for the config editor at /edit.html.
//
// A plain static file server (or Cloudflare Pages) cannot write to disk,
// so the editor's Save button needs this: it serves the site from
// public/ and accepts POST /__save-config to overwrite public/config.json
// in the working tree. Nothing here is deployed; it exists only so you
// can edit defaults and locations locally, then commit and push.
//
//   node tools/edit-server.mjs          (then open http://localhost:8790/edit.html)
//   PORT=9000 node tools/edit-server.mjs
//
// Binds to localhost only. Zero dependencies.

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../public/", import.meta.url));
const CONFIG_PATH = join(ROOT, "config.json");
const PORT = Number(process.env.PORT) || 8790;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "cache-control": "no-store", ...headers });
  res.end(body);
}

async function saveConfig(req, res) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      send(res, 413, "config too large");
      req.destroy();
      return;
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    send(res, 400, `invalid JSON: ${err.message}`);
    return;
  }
  // Re-serialize so the file is always canonically formatted regardless
  // of what the client sent.
  const text = JSON.stringify(parsed, null, 2) + "\n";
  try {
    await writeFile(CONFIG_PATH, text, "utf8");
  } catch (err) {
    send(res, 500, `could not write config.json: ${err.message}`);
    return;
  }
  console.log(`saved config.json (${parsed.locations?.length ?? 0} locations)`);
  send(res, 200, JSON.stringify({ ok: true }), {
    "content-type": "application/json",
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  // Contain the resolved path inside ROOT to block path traversal.
  const filePath = normalize(join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    send(res, 200, body, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
  } catch {
    send(res, 404, "not found");
  }
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__save-config") {
    saveConfig(req, res).catch((err) => send(res, 500, err.message));
    return;
  }
  if (req.method !== "GET") {
    send(res, 405, "method not allowed");
    return;
  }
  serveStatic(req, res).catch((err) => send(res, 500, err.message));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PaddleCast config editor:  http://localhost:${PORT}/edit.html`);
  console.log(`Writing to ${CONFIG_PATH}`);
});
