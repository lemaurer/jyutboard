import { DesktopUpdates } from "../electron/update.ts";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const run = promisify(execFile);
if (process.argv[2] === "--apply") {
  const directory = process.argv[3],
    manifest = JSON.parse(
      await readFile("release/update-mac-arm64.json", "utf8"),
    );
  const packageBytes = await readFile(
    `release/JyutBoard-${manifest.version}-arm64-mac.zip`,
  );
  const updater = new DesktopUpdates({
    version: "0.6.3",
    platform: "darwin",
    arch: "arm64",
    packaged: true,
    executable: join(directory, "JyutBoard.app/Contents/MacOS/JyutBoard"),
    directory: join(directory, "userData/updates"),
    fetch: async (url) =>
      url.endsWith(".json")
        ? Response.json(manifest)
        : new Response(packageBytes),
    quit: () => {},
  });
  await updater.start();
  await updater.check();
  assert.equal(updater.state.phase, "ready");
  assert.equal(await updater.install(false), true);
} else {
  const directory = await mkdtemp(join(tmpdir(), "JyutBoard full update "));
  try {
    const target = join(directory, "JyutBoard.app");
    await mkdir(join(target, "Contents"), { recursive: true });
    await mkdir(join(directory, "userData"));
    await writeFile(join(target, "old-app-marker"), "old app");
    await writeFile(join(directory, "userData/lesson"), "saved lesson");
    const child = spawn(
      process.execPath,
      ["--import", "tsx", import.meta.filename, "--apply", directory],
      { stdio: "inherit" },
    );
    const code = await new Promise((resolve) => child.on("exit", resolve));
    assert.equal(code, 0);
    const manifest = JSON.parse(
      await readFile("release/update-mac-arm64.json", "utf8"),
    );
    let version = "";
    for (let i = 0; i < 50; i++) {
      try {
        version = (
          await run("/usr/libexec/PlistBuddy", [
            "-c",
            "Print :CFBundleShortVersionString",
            join(target, "Contents/Info.plist"),
          ])
        ).stdout.trim();
      } catch {}
      if (version === manifest.version) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(version, manifest.version);
    assert.equal(
      await readFile(join(directory, "userData/lesson"), "utf8"),
      "saved lesson",
    );
    const backup = (await readdir(directory)).find((name) =>
      name.startsWith(".JyutBoard-before-"),
    );
    assert.equal(
      await readFile(join(directory, backup, "old-app-marker"), "utf8"),
      "old app",
    );
    console.log(
      "PASS: full Mac updater downloaded and verified a real release ZIP, checked bundle identity, staged, replaced in place after quit and kept lessons plus rollback backup.",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
