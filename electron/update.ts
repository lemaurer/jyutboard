import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { UpdateState } from "../src/updateState";
const run = promisify(execFile);
export const manifestSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    platform: z.enum(["darwin", "win32"]),
    arch: z.enum(["arm64", "x64"]),
    url: z.string().url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().min(1000).max(600_000_000),
  })
  .strict();
export type Manifest = z.infer<typeof manifestSchema>;
export function newerVersion(candidate: string, current: string) {
  const a = candidate.split(".").map(Number),
    b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function validateManifest(
  input: unknown,
  platform: string,
  arch: string,
) {
  const value = manifestSchema.parse(input),
    url = new URL(value.url);
  const asset =
    platform === "darwin"
      ? `JyutBoard-${value.version}-${arch}-mac.zip`
      : "JyutBoard-Setup.exe";
  if (
    value.platform !== platform ||
    value.arch !== arch ||
    url.origin !== "https://github.com" ||
    url.pathname !==
      `/lemaurer/jyutboard/releases/download/v${value.version}/${asset}` ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw Error("Invalid update package.");
  return value;
}
export async function verifyPackage(file: string, expected: Manifest) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    size += chunk.length;
  }
  if (size !== expected.size || hash.digest("hex") !== expected.sha256)
    throw Error("The update download was incomplete. Please retry.");
}
/** Paths are positional arguments, never interpolated into executable shell code. */
export const macInstallScript = `#!/bin/sh
set -eu
pid="$1"; target="$2"; staged="$3"; backup="$4"
while kill -0 "$pid" 2>/dev/null; do sleep 1; done
mv "$target" "$backup"
if ! mv "$staged" "$target"; then
  mv "$backup" "$target"
  /usr/bin/open "$target"
  exit 1
fi
/usr/bin/open "$target"
`;
export class DesktopUpdates {
  state: UpdateState;
  private manifest?: Manifest;
  private file?: string;
  private running?: Promise<UpdateState>;
  private timer?: ReturnType<typeof setInterval>;
  private quitting = false;
  constructor(
    private options: {
      version: string;
      platform: string;
      arch: string;
      packaged: boolean;
      executable: string;
      directory: string;
      fetch: typeof fetch;
      quit: () => void;
    },
  ) {
    this.state = { version: options.version, enabled: true, phase: "idle" };
  }
  async start() {
    await mkdir(this.options.directory, { recursive: true });
    try {
      const prefs = JSON.parse(
        await readFile(
          join(this.options.directory, "preferences.json"),
          "utf8",
        ),
      );
      this.state.enabled = prefs.enabled !== false;
    } catch {}
    if (
      !this.options.packaged ||
      !["darwin", "win32"].includes(this.options.platform)
    ) {
      this.state.phase = "development";
      return;
    }
    if (this.state.enabled) setTimeout(() => void this.check(), 15000).unref();
    this.timer = setInterval(
      () => {
        if (this.state.enabled) void this.check();
      },
      6 * 60 * 60 * 1000,
    );
    this.timer.unref();
  }
  async setEnabled(enabled: boolean) {
    this.state.enabled = enabled;
    await writeFile(
      join(this.options.directory, "preferences.json"),
      JSON.stringify({ enabled }),
    );
    if (enabled) void this.check();
    return this.state;
  }
  check() {
    if (this.running) return this.running;
    if (this.state.phase === "ready" || !this.options.packaged)
      return Promise.resolve(this.state);
    this.running = this.checkAndDownload().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async checkAndDownload() {
    try {
      this.state = { ...this.state, phase: "checking", error: undefined };
      const label = this.options.platform === "darwin" ? "mac" : "win";
      const response = await this.options.fetch(
        `https://github.com/lemaurer/jyutboard/releases/latest/download/update-${label}-${this.options.arch}.json`,
        { signal: AbortSignal.timeout(20000) },
      );
      if (response.status === 404) {
        this.state.phase = "current";
        return this.state;
      }
      if (!response.ok)
        throw Error("Could not check for updates. Retry when online.");
      const manifest = validateManifest(
        await response.json(),
        this.options.platform,
        this.options.arch,
      );
      if (!newerVersion(manifest.version, this.options.version)) {
        this.state.phase = "current";
        return this.state;
      }
      this.manifest = manifest;
      const file = join(
        this.options.directory,
        `JyutBoard-${manifest.version}.${this.options.platform === "darwin" ? "zip" : "exe"}`,
      );
      this.state = {
        ...this.state,
        phase: "downloading",
        available: manifest.version,
        progress: 0,
      };
      let cached = false;
      try {
        await verifyPackage(file, manifest);
        cached = true;
      } catch {}
      if (!cached) {
        const download = await this.options.fetch(manifest.url, {
          signal: AbortSignal.timeout(10 * 60 * 1000),
        });
        if (!download.ok || !download.body)
          throw Error("Update download failed. Retry when online.");
        let received = 0;
        const meter = new Transform({
          transform: (chunk, _encoding, done) => {
            received += chunk.length;
            if (received > manifest.size)
              return done(Error("Invalid update size."));
            this.state.progress = Math.round((received / manifest.size) * 100);
            done(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(download.body as never),
          meter,
          createWriteStream(file + ".partial", { mode: 0o600 }),
        );
        await verifyPackage(file + ".partial", manifest);
        await rename(file + ".partial", file);
      }
      this.file = file;
      this.state = { ...this.state, phase: "ready", progress: 100 };
    } catch (e) {
      this.state = {
        ...this.state,
        phase: "error",
        error:
          e instanceof Error ? e.message : "Update unavailable; retry shortly.",
      };
    }
    return this.state;
  }
  get canInstall() {
    return this.state.phase === "ready" && !this.quitting;
  }
  async install(relaunch = true) {
    if (!this.manifest || !this.file || !this.canInstall) return false;
    this.quitting = true;
    this.state.phase = "installing";
    try {
      await verifyPackage(this.file, this.manifest);
      if (this.options.platform === "darwin") {
        const target = this.options.executable.replace(
          /\/Contents\/MacOS\/JyutBoard$/,
          "",
        );
        if (
          !target.endsWith("/JyutBoard.app") ||
          target === this.options.executable
        )
          throw Error("Move JyutBoard into Applications to enable updates.");
        await access(dirname(target), constants.W_OK);
        const extracted = join(this.options.directory, "extracted");
        await rm(extracted, { recursive: true, force: true });
        await mkdir(extracted, { recursive: true });
        await run("/usr/bin/ditto", ["-x", "-k", this.file, extracted]);
        const source = join(extracted, "JyutBoard.app");
        const plist = join(source, "Contents", "Info.plist");
        const id = (
          await run("/usr/libexec/PlistBuddy", [
            "-c",
            "Print :CFBundleIdentifier",
            plist,
          ])
        ).stdout.trim();
        const version = (
          await run("/usr/libexec/PlistBuddy", [
            "-c",
            "Print :CFBundleShortVersionString",
            plist,
          ])
        ).stdout.trim();
        if (
          id !== "app.jyutdeck.jyutboard" ||
          version !== this.manifest.version
        )
          throw Error("Update identity did not match.");
        const staged = join(
            dirname(target),
            `.JyutBoard-update-${process.pid}.app`,
          ),
          backup = join(
            dirname(target),
            `.JyutBoard-before-${this.options.version}-${Date.now()}.app`,
          );
        await run("/usr/bin/ditto", [source, staged]);
        const script = join(this.options.directory, "install.sh");
        await writeFile(
          script,
          relaunch
            ? macInstallScript
            : macInstallScript
                .replaceAll('  /usr/bin/open "$target"', "  :")
                .replaceAll('/usr/bin/open "$target"', ":"),
          { mode: 0o700 },
        );
        const child = spawn(
          "/bin/sh",
          [script, String(process.pid), target, staged, backup],
          { detached: true, stdio: "ignore" },
        );
        child.unref();
      } else {
        // NSIS recognises the existing installation; no uninstall or data removal.
        const script = join(this.options.directory, "install.ps1");
        await writeFile(
          script,
          `param([int]$ParentPid,[string]$Installer)\nWait-Process -Id $ParentPid -ErrorAction SilentlyContinue\nStart-Process -FilePath $Installer -ArgumentList @('/S','--updated'${relaunch ? ",'--force-run'" : ""})\n`,
        );
        const child = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            script,
            String(process.pid),
            this.file,
          ],
          { detached: true, stdio: "ignore", windowsHide: true },
        );
        child.unref();
      }
      return true;
    } catch (e) {
      this.quitting = false;
      this.state = {
        ...this.state,
        phase: "error",
        error:
          e instanceof Error ? e.message : "Update could not be installed.",
      };
      throw e;
    }
  }
  async restart() {
    if (await this.install()) this.options.quit();
    return true;
  }
}
