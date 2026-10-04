import { _electron, expect } from "@playwright/test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
const binary = process.argv[2];
if (!binary) throw Error("Pass the packaged JyutBoard executable path.");
const directories = [
  await mkdtemp(join(tmpdir(), "jyutboard-host-")),
  await mkdtemp(join(tmpdir(), "jyutboard-guest-")),
];
const apps = [];
try {
  for (const directory of directories)
    apps.push(
      await _electron.launch({
        executablePath: binary,
        args: [`--user-data-dir=${directory}`],
        timeout: 20000,
      }),
    );
  let teacher = await apps[0].firstWindow();
  const learner = await apps[1].firstWindow();
  const tokenFile = process.argv[3];
  if (tokenFile) {
    const queueToken = (await readFile(tokenFile, "utf8")).trim();
    await teacher.evaluate(
      (queueToken) =>
        window.desktop.saveSettings({
          queueUrl: "https://jyutdeck-live-jul08f.vercel.app/api/v1/requests",
          queueToken,
          googleKey: "",
        }),
      queueToken,
    );
  }
  await teacher.getByRole("button", { name: "Natasha", exact: true }).click();
  await teacher.getByRole("button", { name: "Share / Sync" }).click();
  await teacher
    .getByRole("button", { name: "Start internet lesson", exact: true })
    .click();
  await expect(teacher.getByLabel("Private invitation")).toBeVisible({
    timeout: 60000,
  });
  const invite = await teacher.getByLabel("Private invitation").inputValue();
  if (!invite.includes("jyutboard://join#")) throw Error("Missing invitation");
  await teacher.getByRole("button", { name: "Close sharing" }).click();
  await learner.getByRole("button", { name: "Share / Sync" }).click();
  await learner.getByLabel("Lesson invitation").fill(invite);
  await learner.getByRole("button", { name: "Join lesson" }).click();
  await expect(learner.getByText("2 live")).toBeVisible({ timeout: 20000 });
  await teacher.getByLabel("Cantonese phrase").fill("我想飲水");
  await teacher
    .getByRole("button", { name: "Add phrase", exact: true })
    .click();
  await expect(learner.getByTestId("phrase-card").locator("h2")).toContainText(
    "ngo5",
    { timeout: 10000 },
  );
  await teacher.getByRole("button", { name: "Guide Leif" }).click();
  await teacher.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(learner.locator(".zoom-tools")).toContainText("90%");
  if (tokenFile) {
    const pairing = await teacher.evaluate(() =>
      window.desktop.pair({ action: "get" }),
    );
    if (!pairing?.host) throw Error("Host pairing was not remembered");
    await writeFile(
      "/tmp/jyutboard-desktop-smoke-room-hash",
      createHash("sha256").update(pairing.room).digest("hex"),
    );
    const guestPair = await learner.evaluate(() =>
      window.desktop.pair({ action: "get" }),
    );
    if (guestPair?.room !== pairing.room || guestPair.host)
      throw Error("Guest pairing was not remembered");
    const vocab = await learner.evaluate(() => window.desktop.vocabulary());
    if (!vocab.known?.length)
      throw Error("Guest vocabulary bridge unavailable");
    if (process.argv[4]) {
      const audio =
        "data:audio/mp4;base64," +
        (await readFile(process.argv[4])).toString("base64");
      const result = await learner.evaluate(
        (audio) => window.desktop.transcribe(audio),
        audio,
      );
      if (!result.transcript?.includes("水"))
        throw Error("Guest transcription bridge failed");
    }
    await apps[0].close();
    apps[0] = await _electron.launch({
      executablePath: binary,
      args: [`--user-data-dir=${directories[0]}`],
      timeout: 20000,
    });
    teacher = await apps[0].firstWindow();
    await teacher
      .getByRole("button", { name: "Open our room", exact: true })
      .click();
    await expect(teacher.getByText("1 live")).toBeVisible({ timeout: 60000 });
    await learner
      .getByRole("button", { name: "Join Natasha", exact: true })
      .click();
    await expect(learner.getByText("2 live")).toBeVisible({ timeout: 30000 });
    console.log(
      "Remembered room passed after host restart; guest vocabulary and transcription passed without an API token.",
    );
  }
  console.log(
    "Packaged desktop internet lesson passed: one-click invitation, two apps, live phrase and guided zoom.",
  );
} finally {
  await Promise.allSettled(apps.map((app) => app.close()));
  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
}
