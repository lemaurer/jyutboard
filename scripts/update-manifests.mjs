import { readFile, writeFile, readdir, stat, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
const directory = process.argv[2] || "release";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const files = await readdir(directory);
for (let file of files) {
  const match = /^JyutBoard-[\d.]+(?:-(arm64|x64))?-mac\.zip$/.exec(file);
  if (
    (!match || !file.startsWith(`JyutBoard-${version}-`)) &&
    file !== "JyutBoard-Setup.exe"
  )
    continue;
  const platform = match ? "darwin" : "win32",
    arch = match ? match[1] || "x64" : "x64";
  if (match && !match[1]) {
    const explicit = `JyutBoard-${version}-x64-mac.zip`;
    await copyFile(join(directory, file), join(directory, explicit));
    file = explicit;
  }
  const bytes = await readFile(join(directory, file));
  const manifest = {
    version,
    platform,
    arch,
    url: `https://github.com/lemaurer/jyutboard/releases/download/v${version}/${file}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: (await stat(join(directory, file))).size,
  };
  await writeFile(
    join(directory, `update-${match ? "mac" : "win"}-${arch}.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  if (match) {
    const dmg = files.find(
      (name) =>
        name === `JyutBoard-${version}-${arch}.dmg` ||
        (arch === "x64" && name === `JyutBoard-${version}.dmg`),
    );
    if (dmg)
      await copyFile(
        join(directory, dmg),
        join(
          directory,
          arch === "arm64"
            ? "JyutBoard-Mac-Apple-Silicon.dmg"
            : "JyutBoard-Mac-Intel.dmg",
        ),
      );
    if (dmg)
      await writeFile(
        join(directory, `download-mac-${arch}.html`),
        `<meta http-equiv="refresh" content="0;url=https://github.com/lemaurer/jyutboard/releases/download/v${version}/${dmg}">`,
      );
  }
}
