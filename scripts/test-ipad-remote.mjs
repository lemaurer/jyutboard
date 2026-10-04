import { _electron, webkit, expect } from "@playwright/test";
import { mkdtemp, copyFile, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const [binary, encryptedSettings, syntheticAudio] = process.argv.slice(2);
if (!binary || !encryptedSettings || !syntheticAudio)
  throw Error(
    "Provide a packaged Mac executable, configured encrypted settings file, and synthetic Cantonese audio.",
  );
const directory = await mkdtemp(join(tmpdir(), "jyutboard-ipad-host-"));
let host, browser, previousClipboard;
try {
  // The settings remain OS-encrypted; no plaintext credential enters this script.
  await copyFile(encryptedSettings, join(directory, "settings.enc"));
  host = await _electron.launch({
    executablePath: binary,
    args: [`--user-data-dir=${directory}`],
    timeout: 30000,
  });
  previousClipboard = await host.evaluate(({ clipboard }) =>
    clipboard.readText(),
  );
  const teacher = await host.firstWindow();
  expect(
    (await teacher.evaluate(() => window.desktop.getSettings())).hasQueueToken,
  ).toBe(true);
  await teacher.getByRole("button", { name: "Natasha", exact: true }).click();
  await teacher.getByRole("button", { name: "Share / Sync" }).click();
  await teacher
    .getByRole("button", { name: "Start internet lesson", exact: true })
    .click();
  await expect(teacher.getByLabel("iPad invitation")).toBeVisible({
    timeout: 75000,
  });
  const invitation = await teacher.getByLabel("iPad invitation").inputValue();
  await teacher
    .getByRole("button", { name: "Copy iPad link", exact: true })
    .click();
  expect(await host.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    invitation,
  );
  const room = new URLSearchParams(new URL(invitation).hash.slice(1)).get(
    "room",
  );
  await writeFile(
    join(tmpdir(), "jyutboard-ipad-test-room-hash"),
    createHash("sha256").update(room).digest("hex"),
  );
  await teacher.getByRole("button", { name: "Close sharing" }).click();
  browser = await webkit.launch();
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    isMobile: true,
    hasTouch: true,
  });
  const ipad = await context.newPage();
  ipad.on("console", (message) => {
    if (message.type() === "error")
      console.log(
        "WebKit:",
        message.text().replace(/wss?:\/\/[^\s]+/g, "[relay]"),
      );
  });
  console.log("Checking public Internet relay…");
  await ipad.goto(invitation);
  await expect(ipad.getByText("2 live")).toBeVisible({ timeout: 90000 });
  await teacher.getByLabel("Cantonese phrase").fill("我想飲水");
  await teacher
    .getByRole("button", { name: "Add phrase", exact: true })
    .click();
  await expect(ipad.getByTestId("phrase-card").locator("h2")).toContainText(
    "ngo5",
    { timeout: 15000 },
  );
  await expect(
    ipad.getByTestId("phrase-card").locator(".card-secondary"),
  ).toHaveText("我想飲水");
  const vocabulary = await ipad.evaluate(() => window.desktop.vocabulary());
  expect(vocabulary.known.length).toBeGreaterThan(0);
  const audio =
    "data:audio/mp4;base64," +
    (await readFile(syntheticAudio)).toString("base64");
  const transcript = await ipad.evaluate(
    async (audio) => (await window.desktop.transcribe(audio)).transcript,
    audio,
  );
  expect(transcript).toMatch(/你好|飲水/);
  // A complete but deliberately inconsistent breakdown proves that the real
  // paired queue handler is reached, while validation prevents any queue write.
  const result = await ipad.evaluate(() =>
    window.desktop.send({
      requests: [
        {
          chinese: "你好",
          jyutping: "nei5 hou2",
          definition: "Hello",
          itemType: "sentence",
          breakdown: [
            { chinese: "再見", jyutping: "zoi3 gin3", definition: "Goodbye" },
          ],
          idempotencyKey: "jyutboard-ipad-no-write-validation-v1",
        },
      ],
    }),
  );
  expect(result.created).toBe(0);
  expect(result.results[0]).toMatchObject({
    status: "failed",
    code: "validation_failed",
  });
  await ipad.getByLabel("Your lesson view").selectOption("teacher");
  await ipad.getByTestId("phrase-card").locator("h2").dblclick();
  await ipad.getByLabel("Edit phrase in place").fill("你好");
  await ipad.getByLabel("Edit phrase in place").press("Enter");
  await expect(teacher.getByTestId("phrase-card").locator("h2")).toHaveText(
    "你好",
    { timeout: 10000 },
  );
  await ipad.reload();
  await expect(ipad.getByTestId("phrase-card").locator("h2")).toHaveText(
    "你好",
  );
  await ipad.getByRole("button", { name: "Share / Sync" }).click();
  await expect(
    ipad.getByRole("button", { name: "Join Leif", exact: true }),
  ).toBeVisible();
  console.log(
    "PASS: packaged desktop ↔ hosted iPad/WebKit through Internet relay; shared edits, small Chinese, remembered room, real vocabulary, real synthetic Cantonese transcription and authenticated no-write queue validation.",
  );
} finally {
  await browser?.close();
  if (host && previousClipboard !== undefined)
    await host
      .evaluate(
        ({ clipboard }, text) => clipboard.writeText(text),
        previousClipboard,
      )
      .catch(() => {});
  await host?.close();
  await rm(directory, { recursive: true, force: true });
}
