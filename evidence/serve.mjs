import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// Root = the library dir (evidence/..). Derived from this file's URL so it does
// not depend on the process cwd (the preview shell's cwd is unavailable).
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".map": "application/json",
  ".css": "text/css",
  ".json": "application/json",
};

http
  .createServer(async (req, res) => {
    try {
      // Persist a posted PNG into evidence/ (used to snapshot masking results).
      if (req.method === "POST" && (req.url ?? "").startsWith("/save/")) {
        const name = normalize(decodeURIComponent(req.url.slice("/save/".length)));
        const chunks = [];
        for await (const c of req) {
          chunks.push(c);
        }
        const file = normalize(join(root, "evidence", name));
        if (!(file.startsWith(join(root, "evidence")) && name.endsWith(".png"))) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        await writeFile(file, Buffer.concat(chunks));
        res.writeHead(200, { "access-control-allow-origin": "*" });
        res.end("saved");
        return;
      }
      let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
      if (path === "/") {
        path = "/evidence/mask-harness.html";
      }
      const file = normalize(join(root, path));
      if (!file.startsWith(root)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        "content-type": types[extname(file)] ?? "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  })
  .listen(5175, () => console.log("snaglist evidence server on http://localhost:5175"));
