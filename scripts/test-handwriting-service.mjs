import { _electron, chromium, expect } from "@playwright/test";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const directory = await mkdtemp(join(tmpdir(), "jyutboard-ocr-smoke-"));
let app, browser;
try {
  await copyFile(
    join(
      process.env.HOME,
      "Library/Application Support/JyutBoard/settings.enc",
    ),
    join(directory, "settings.enc"),
  );
  app = await _electron.launch({
    executablePath:
      process.argv[3] || "/Applications/JyutBoard.app/Contents/MacOS/JyutBoard",
    args: [`--user-data-dir=${directory}`],
  });
  const page = await app.firstWindow();
  const pair = await page.evaluate(() =>
    window.desktop.pair({ action: "get" }),
  );
  const room = pair?.room;
  if (!room)
    throw Error("No remembered Internet lesson for live recognition test");
  browser = await chromium.launch();
  const ink = await browser.newPage();
  const image = await ink.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 420;
    c.height = 400;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 420, 400);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    for (const points of [
      [
        [90, 155],
        [300, 148],
      ],
      [
        [210, 55],
        [207, 180],
        [170, 270],
        [90, 340],
      ],
      [
        [205, 178],
        [252, 265],
        [328, 330],
      ],
    ]) {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    return c.toDataURL("image/png");
  });
  const endpoint =
    process.argv[2] || "https://jyutboard-recognition.vercel.app/api/handwrite";
  if (await page.evaluate(() => Boolean(window.desktop.recognize))) {
    const result = await page.evaluate(
      (image) => window.desktop.recognize(image),
      image,
    );
    if (result.chinese !== "大")
      throw Error("Desktop recognition bridge failed");
    console.log(
      "PASS: packaged desktop recognition uses the paired lesson and same server service.",
    );
    await page.getByRole("button", { name: "Natasha", exact: true }).click();
    await page
      .getByRole("button", { name: "Handwrite → Card", exact: true })
      .click();
    const area = await page.locator(".canvas-viewport").boundingBox();
    const x = area.x + area.width / 2 - 75,
      y = area.y + area.height / 2 - 110;
    for (const points of [
      [
        [15, 85],
        [155, 80],
      ],
      [
        [90, 15],
        [88, 100],
        [63, 160],
        [15, 210],
      ],
      [
        [88, 100],
        [117, 160],
        [172, 210],
      ],
    ]) {
      await page.mouse.move(x + points[0][0], y + points[0][1]);
      await page.mouse.down();
      for (const [px, py] of points.slice(1))
        await page.mouse.move(x + px, y + py, { steps: 8 });
      await page.mouse.up();
    }
    await expect(page.getByTestId("handwrite-preview")).toContainText("大", {
      timeout: 90000,
    });
    await page.screenshot({
      path: join(tmpdir(), "jyutboard-handwriting-preview.png"),
    });
    await page
      .getByRole("button", { name: "Confirm handwriting card" })
      .click();
    await expect(page.getByTestId("phrase-card").locator("h2")).toHaveText(
      "大",
    );
    await page.getByRole("button", { name: "Leif", exact: true }).click();
    await expect(page.getByTestId("phrase-card").locator("h2")).toHaveText(
      "daai6",
    );
    await expect(page.getByTestId("handwrite-stroke")).toHaveCount(0);
    console.log(
      "PASS: real mouse handwriting → preview → confirmed Jyutping card in the packaged app.",
    );
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room, image }),
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(`Recognition ${response.status}: ${result.error}`);
  if (result.chinese !== "大")
    throw Error("Expected handwritten 大, got " + result.chinese);
  console.log(
    "PASS: live handwritten 大 recognized through authenticated shared lesson service.",
  );
  const noAuth = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  if (noAuth.status !== 401)
    throw Error("Recognition must require lesson access");
  console.log("PASS: unauthenticated recognition rejected.");
} finally {
  await browser?.close();
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
