// Menjalankan worker dari hasil build API (dist/main.worker.js) dan memulainya ulang saat build berubah.
// Hanya satu pengompilasi (nest start --watch di proses API): dua pengompilasi ke folder dist yang sama
// saling menghapus berkas satu sama lain.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const dist = path.resolve(__dirname, "../dist");
const entry = path.join(dist, "main.worker.js");

/** Waktu ubah terbaru di seluruh dist (berkas .js saja). */
function newestMtime(dir) {
  let newest = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) newest = Math.max(newest, newestMtime(p));
    else if (e.name.endsWith(".js")) newest = Math.max(newest, fs.statSync(p).mtimeMs);
  }
  return newest;
}

let child = null;
let seen = 0;
let stopping = false;

function start() {
  child = spawn(process.execPath, ["--enable-source-maps", entry], { stdio: "inherit" });
  child.on("exit", () => {
    child = null;
  });
}

function check() {
  if (stopping || !fs.existsSync(entry)) return;
  const m = newestMtime(dist);
  if (m === seen) return;
  seen = m;
  if (child) {
    const old = child;
    old.once("exit", () => setTimeout(start, 300));
    old.kill();
  } else {
    setTimeout(start, 300);
  }
}

setInterval(check, 1500);
check();

const stop = () => {
  stopping = true;
  if (child) child.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
