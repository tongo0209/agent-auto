import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sp-cov-"));
  const design = join(root, "design");
  mkdirSync(join(design, "EN/PSD"), { recursive: true });
  writeFileSync(join(design, "EN/PSD/main.psd"), "x".repeat(10));
  writeFileSync(join(design, "EN/shot.png"), "y".repeat(4));
  const manifest = join(root, "sp-manifest.json");
  writeFileSync(manifest, JSON.stringify({
    key: "GW-1", root: "/src", scannedAt: "2026-10-06T00:00:00Z", count: 4, totalBytes: 14,
    files: [
      { rel: "EN/PSD/main.psd", length: 10 },
      { rel: "EN/shot.png", length: 4 },
      { rel: "EN/.DS_Store", length: 6148 },
      { rel: "EN/main.psd", length: 0 },
    ],
  }));
  return { root, design, manifest };
}

const run = (script, args) => spawnSync("node", [join(HERE, script), ...args], { encoding: "utf8" });

test("coverage: .DS_Store và file 0 byte ở nguồn không làm FAIL", () => {
  const { design, manifest } = fixture();
  const r = run("sp-coverage.mjs", [manifest, design]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /0 byte.*EN\/main\.psd|EN\/main\.psd.*0 byte/s);
});

test("coverage: file thiếu thật vẫn FAIL", () => {
  const { design, manifest } = fixture();
  const man = JSON.parse(readFileSync(manifest, "utf8"));
  man.files.push({ rel: "EN/new.png", length: 3 });
  writeFileSync(manifest, JSON.stringify(man));
  assert.equal(run("sp-coverage.mjs", [manifest, design]).status, 1);
});

test("state: .DS_Store và file 0 byte không giữ status ở tải-một-phần", () => {
  const { root, design, manifest } = fixture();
  const statePath = join(root, "state.json");
  writeFileSync(statePath, JSON.stringify({ issues: { "GW-1": {} } }));
  const r = run("sp-state.mjs", ["GW-1", manifest, design, statePath]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const d = JSON.parse(readFileSync(statePath, "utf8")).issues["GW-1"].design;
  assert.equal(d.status, "đã-giao-đã-tải");
  assert.equal(d.missing, undefined);
});
