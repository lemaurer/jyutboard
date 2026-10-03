import { test, expect } from "@playwright/test";
import { startRelay } from "../electron/relay-server";
import type { Browser, BrowserContext } from "@playwright/test";
let relay: Awaited<ReturnType<typeof startRelay>>;
let contexts: BrowserContext[] = [];
test.beforeAll(async () => {
  relay = await startRelay(0, "127.0.0.1");
});
test.afterEach(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  contexts = [];
});
test.afterAll(async () => {
  await relay.close();
});
async function blankPage(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    permissions: ["microphone"],
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Share / Sync" }),
  ).toBeVisible();
  return page;
}
test("shared lesson keeps separate Chinese/Jyutping views, word edits and practice mode", async ({
  browser,
}) => {
  const leif = await blankPage(browser);
  await leif.getByRole("button", { name: "New lesson" }).click();
  await leif.getByRole("button", { name: "Share / Sync" }).click();
  await leif
    .getByLabel("Relay address (optional)")
    .fill(`ws://127.0.0.1:${relay.port}`);
  await leif.getByRole("button", { name: "Create invitation" }).click();
  const invite = await leif.getByLabel("Private invitation").inputValue();
  expect(invite).toContain("jyutboard://join#");
  await leif.getByRole("button", { name: "Close sharing" }).click();
  const natasha = await blankPage(browser);
  await natasha.getByRole("button", { name: "Natasha" }).click();
  await natasha.getByRole("button", { name: "Share / Sync" }).click();
  await natasha.getByLabel("Lesson invitation").fill(invite);
  await natasha.getByRole("button", { name: "Join lesson" }).click();
  await expect(leif.getByText("2 live")).toBeVisible();
  await natasha.getByLabel("Cantonese phrase").fill("我想飲水");
  await natasha
    .getByRole("button", { name: "Add phrase", exact: true })
    .click();
  const lCard = leif.getByTestId("phrase-card");
  const tCard = natasha.getByTestId("phrase-card");
  await expect(lCard.locator("h2")).toContainText("ngo5");
  await expect(tCard.locator("h2")).toContainText("我想飲水");
  await tCard.click();
  await expect(
    natasha.getByRole("heading", { name: "Card appearance" }),
  ).toBeVisible();
  await natasha.getByRole("button", { name: /Practice/ }).click();
  await expect(lCard.locator(".card-english")).toHaveCount(0);
  await lCard.click();
  await expect(leif.getByLabel("English meaning")).toHaveCount(0);
  await expect(
    leif.getByRole("heading", { name: "Card appearance" }),
  ).toHaveCount(0);
  await natasha.getByLabel("Piece 1 Chinese").fill("我想");
  await natasha.getByRole("button", { name: "Add piece" }).click();
  await natasha.getByLabel("Piece 4 Chinese").fill("水");
  await expect(leif.getByLabel("Piece 4 Chinese")).toHaveValue("水");
  await natasha
    .getByRole("button", { name: "Full Pronunciation + English" })
    .click();
  await expect(lCard.locator(".card-english")).toBeVisible();
  await expect(leif.getByLabel("English meaning")).toBeVisible();
  await lCard.getByRole("button", { name: "Save phrase" }).click();
  await expect(
    natasha.getByRole("heading", { name: "Session tray" }).locator(".."),
  ).toContainText("1");
  await leif
    .locator(".inspector input[type=file]")
    .setInputFiles({
      name: "natasha.webm",
      mimeType: "audio/webm",
      buffer: Buffer.from("lesson-test-audio"),
    });
  await expect(natasha.locator(".inspector audio")).toBeVisible();
  await leif.screenshot({ path: "docs/teaching-desk.png" });
});
test("tables translate locally, edit row notes, hide English and delete selected rows", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.getByRole("button", { name: "Natasha" }).click();
  await page.getByRole("button", { name: "Add phrase table" }).click();
  const table = page.getByTestId("table-card");
  await table.getByLabel("Chinese phrase").fill("我想飲水");
  await expect(table.getByLabel("English translation")).toHaveValue(
    "I would like some water.",
  );
  await table.getByLabel("English translation").fill("I want water.");
  await table.getByLabel("Row note").fill("At the cafe");
  await table.getByRole("button", { name: "Add row" }).click();
  await expect(table.getByLabel("Chinese phrase")).toHaveCount(2);
  await table.getByLabel("Chinese phrase").nth(1).fill("食飯");
  await page.getByRole("button", { name: "Leif" }).click();
  await expect(table.getByText("ngo5 soeng2 jam2 seoi2")).toBeVisible();
  await expect(table.getByLabel("English translation").first()).toHaveValue(
    "I want water.",
  );
  await page.getByRole("button", { name: "Natasha" }).click();
  await page.getByLabel("Hide English from Leif").check();
  await page.getByRole("button", { name: "Leif" }).click();
  await expect(table.getByLabel("English translation")).toHaveCount(0);
  await table
    .locator("tbody tr")
    .first()
    .click({ position: { x: 2, y: 2 } });
  await expect(page.locator(".inspector")).not.toContainText("I want water.");
  await page.keyboard.press("Delete");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Hide details" }).click();
  await expect(page.locator(".inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Hide pages" }).click();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await page.screenshot({ path: "docs/teaching-desk-table.png" });
});
test("touchpad zoom and card deletion work; backup restores as a new lesson", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.getByLabel("Cantonese phrase").fill("你好");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  await expect(page.getByTestId("phrase-card")).toHaveCount(1);
  const card = page.getByTestId("phrase-card");
  const before = await card.boundingBox();
  expect(before).toBeTruthy();
  await page.mouse.move(before!.x + 80, before!.y + 20);
  await page.mouse.down();
  await page.mouse.move(before!.x + 220, before!.y + 90, { steps: 5 });
  await page.mouse.up();
  const after = await card.boundingBox();
  expect(after!.x - before!.x).toBeGreaterThan(100);
  const viewport = page.locator(".canvas-viewport");
  await viewport.hover({ position: { x: 250, y: 200 } });
  await page.mouse.wheel(0, 100);
  await page
    .locator(".canvas-viewport")
    .evaluate((node) =>
      node.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 50,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  await expect(page.locator(".zoom-tools")).not.toContainText("100%");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export lesson backup" }).click();
  const path = await (await downloaded).path();
  await page.getByRole("button", { name: "Import lesson backup" }).click();
  await page.locator('input[type=file][accept=".json"]').setInputFiles(path!);
  await expect(page.getByTestId("phrase-card")).toHaveCount(1);
  await expect(page.locator(".history button")).toHaveCount(2);
  await page.getByTestId("phrase-card").click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("phrase-card")).toHaveCount(0);
});
