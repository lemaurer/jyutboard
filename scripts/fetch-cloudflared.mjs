import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const version = "2026.9.3";
const assets = {
  "darwin-arm64": [
    "cloudflared-darwin-arm64.tgz",
    "587c2cfb1c230fe36c7fa7727da78be459dae028cabe8c001291999350f07095",
  ],
  "darwin-x64": [
    "cloudflared-darwin-amd64.tgz",
    "d1155d0837487f261183b15c1eab6c4ebcad9dc49b94675f1524c3564cea3977",
  ],
  "win32-x64": [
    "cloudflared-windows-amd64.exe",
    "f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2",
  ],
};
const selected =
  assets[
    `${process.platform}-${process.env.JYUTBOARD_BUILD_ARCH || process.arch}`
  ];
if (!selected) {
  console.log(
    "No bundled cloudflared for this platform; remote hosting needs cloudflared on PATH.",
  );
  process.exit(0);
}
const [name, digest] = selected;
const directory = join(".vendor", "cloudflared");
await mkdir(directory, { recursive: true });
const license = await fetch(
  `https://raw.githubusercontent.com/cloudflare/cloudflared/${version}/LICENSE`,
  { signal: AbortSignal.timeout(30000) },
);
if (!license.ok) throw new Error("Could not download cloudflared license.");
await writeFile(join(directory, "LICENSE"), await license.text());
const executable = join(
  directory,
  process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
);
try {
  const existing = await readFile(executable);
  const marker = await readFile(join(directory, "version.txt"), "utf8");
  if (existing.length > 1_000_000 && marker === `${version}:${name}`) {
    console.log("cloudflared already prepared.");
    process.exit(0);
  }
} catch {}
const url = `https://github.com/cloudflare/cloudflared/releases/download/${version}/${name}`;
const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
if (!response.ok)
  throw new Error(`Could not download cloudflared (${response.status}).`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash("sha256").update(bytes).digest("hex") !== digest)
  throw new Error("cloudflared checksum did not match the pinned release.");
if (process.platform === "win32") await writeFile(executable, bytes);
else {
  const archive = join(directory, name);
  await writeFile(archive, bytes);
  execFileSync("tar", ["-xzf", archive, "-C", directory]);
  await rm(archive);
  await chmod(executable, 0o755);
}
await writeFile(join(directory, "version.txt"), `${version}:${name}`);
console.log(
  `Prepared cloudflared ${version} (${process.platform}-${process.arch}).`,
);
