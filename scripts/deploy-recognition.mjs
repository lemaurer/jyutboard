// Deploy this isolated function with the lesson project's existing server credential.
// --skip-domain preserves JyutDeck's current production application and aliases.
import { build } from "esbuild";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const directory = await mkdtemp(
  join(tmpdir(), "jyutboard-recognition-service-"),
);
const run = (args) => {
  const result = spawnSync("npx", ["vercel", ...args], {
    cwd: directory,
    encoding: "utf8",
  });
  if (result.status) throw Error(result.stderr || "Service deployment failed");
  return result.stdout + result.stderr;
};
try {
  await mkdir(join(directory, ".vercel"));
  await mkdir(join(directory, "api"));
  await mkdir(join(directory, "public"));
  await writeFile(
    join(directory, ".vercel/project.json"),
    JSON.stringify({
      projectId: "prj_aOFHZrK3Z6dFsvdBwYFqPDheGKgb",
      orgId: "team_lACUDtjKYnm6se05TFZRAj0X",
      projectName: "jyutdeck-live-jul08f",
    }),
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "jyutboard-handwriting-service",
      private: true,
      type: "module",
    }),
  );
  await writeFile(
    join(directory, "public/index.html"),
    "JyutBoard handwriting service",
  );
  await writeFile(
    join(directory, "vercel.json"),
    JSON.stringify({
      framework: null,
      installCommand: "",
      buildCommand: "",
      outputDirectory: "public",
      functions: { "api/handwrite.js": { maxDuration: 60 } },
    }),
  );
  await build({
    entryPoints: ["services/handwrite/handler.ts"],
    outfile: join(directory, "api/handwrite.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  });
  const project = run(["project", "inspect", "--non-interactive"]);
  if (!project.includes("jyutdeck-live-jul08f"))
    throw Error("Lesson project did not verify");
  const output = run(["deploy", "--prod", "--skip-domain", "--yes"]);
  const url = output.match(/https:\/\/[^\s]+\.vercel\.app/)?.[0];
  if (!url) throw Error("Deployment URL missing");
  run(["alias", "set", url, "jyutboard-recognition.vercel.app"]);
  const config = JSON.parse(await readFile("vercel.json", "utf8"));
  const rewrite = config.rewrites.find(
    (route) => route.source === "/api/handwrite",
  );
  if (!rewrite) throw Error("Handwriting rewrite missing");
  rewrite.destination = `${url}/api/handwrite`;
  await writeFile("vercel.json", JSON.stringify(config, null, 2) + "\n");
  console.log("Recognition service deployed:", url);
  console.log(
    "Board rewrite updated to the immutable service URL; deploy the web app next.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
