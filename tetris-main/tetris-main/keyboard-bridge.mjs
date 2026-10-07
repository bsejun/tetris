import fs from "fs";
import http from "http";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.CURTRIS_PORT || 8787);
const clients = new Set();

function broadcast(obj) {
  const chunk = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) {
    try { res.write(chunk); } catch { clients.delete(res); }
  }
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/keys") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    res.write("\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    return;
  }
  const rel = url === "/" ? "/index.html" : url;
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

function startRaw() {
  const ps1 = path.join(root, "raw-keyboard.ps1");
  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy", "Bypass",
    "-File", ps1
  ], { windowsHide: true });
  let buf = "";
  const onData = (chunk) => {
    buf += chunk.toString("utf8");
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || "";
    for (const line of lines) {
      const text = line.trim();
      if (!text.startsWith("{")) continue;
      try { broadcast(JSON.parse(text)); } catch { /* ignore */ }
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", (chunk) => {
    const msg = chunk.toString("utf8").trim();
    if (msg) console.error(msg);
  });
  child.on("exit", (code) => {
    broadcast({ type: "dead", code });
    setTimeout(startRaw, 800);
  });
}

server.listen(port, "127.0.0.1", () => {
  console.log(`CURTRIS 키보드 연결 http://127.0.0.1:${port}/`);
  startRaw();
});
