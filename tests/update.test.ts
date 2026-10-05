import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  DesktopUpdates,
  validateManifest,
  newerVersion,
  macInstallScript,
} from "../electron/update";
const bytes = Buffer.alloc(2048, 7);
const manifest = {
  version: "0.7.0",
  platform: "darwin",
  arch: "arm64",
  url: "https://github.com/lemaurer/jyutboard/releases/download/v0.7.0/JyutBoard-0.7.0-arm64-mac.zip",
  size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
test("updates reject foreign repositories, wrong architecture, downgrade and malformed manifests", () => {
  assert.ok(newerVersion("0.7.0", "0.6.4"));
  assert.ok(!newerVersion("0.6.2", "0.6.4"));
  assert.ok(newerVersion("0.10.0", "0.9.9"));
  for (const bad of [
    { ...manifest, url: manifest.url.replace("lemaurer", "someone") },
    { ...manifest, arch: "x64" },
    { ...manifest, url: manifest.url + "?redirect=evil" },
    { ...manifest, sha256: "bad" },
  ])
    assert.throws(() => validateManifest(bad, "darwin", "arm64"));
});
test("verified updates download once, reuse a complete cache, and never quit a running lesson", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jyutboard-update-test-"));
  let downloads = 0,
    quits = 0;
  const fetcher = (async (url: string) =>
    url.endsWith(".json")
      ? Response.json(manifest)
      : (downloads++, new Response(bytes))) as typeof fetch;
  const options = {
    version: "0.6.4",
    platform: "darwin",
    arch: "arm64",
    packaged: true,
    executable: "/Applications/JyutBoard.app/Contents/MacOS/JyutBoard",
    directory,
    fetch: fetcher,
    quit: () => quits++,
  };
  try {
    const updater = new DesktopUpdates(options);
    await updater.start();
    await updater.check();
    assert.equal(updater.state.phase, "ready");
    assert.equal(downloads, 1);
    assert.equal(quits, 0);
    const next = new DesktopUpdates(options);
    await next.check();
    assert.equal(next.state.phase, "ready");
    assert.equal(downloads, 1);
    await next.setEnabled(false);
    assert.equal(
      JSON.parse(await readFile(join(directory, "preferences.json"), "utf8"))
        .enabled,
      false,
    );
    await writeFile(join(directory, "JyutBoard-0.7.0.zip"), "damaged");
    const broken = new DesktopUpdates({
      ...options,
      fetch: (async (url: string) =>
        url.endsWith(".json")
          ? Response.json(manifest)
          : new Response(Buffer.alloc(2048, 8))) as typeof fetch,
    });
    await broken.check();
    assert.equal(broken.state.phase, "error");
    assert.equal(broken.canInstall, false);
    assert.equal(quits, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test(
  "Mac install swaps the app atomically, keeps a backup, and rolls back if the staged app is missing",
  { skip: process.platform !== "darwin" },
  async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "JyutBoard update spaces & "),
    );
    const target = join(directory, "JyutBoard.app"),
      staged = join(directory, "staged.app"),
      backup = join(directory, "backup.app"),
      script = join(directory, "install.sh");
    try {
      await mkdir(target);
      await mkdir(staged);
      await writeFile(join(target, "version"), "old");
      await writeFile(join(staged, "version"), "new");
      await writeFile(
        script,
        macInstallScript.replaceAll('/usr/bin/open "$target"', ":"),
      );
      await promisify(execFile)("/bin/sh", [
        script,
        "999999",
        target,
        staged,
        backup,
      ]);
      assert.equal(await readFile(join(target, "version"), "utf8"), "new");
      assert.equal(await readFile(join(backup, "version"), "utf8"), "old");
      await assert.rejects(
        promisify(execFile)("/bin/sh", [
          script,
          "999999",
          target,
          join(directory, "missing"),
          join(directory, "backup2.app"),
        ]),
      );
      assert.equal(await readFile(join(target, "version"), "utf8"), "new");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
