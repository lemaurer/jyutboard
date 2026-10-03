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
  await natasha.locator(".word-piece summary").first().click();
  await natasha.getByLabel("Piece 1 Chinese").fill("我想");
  await natasha.getByRole("button", { name: "Add piece" }).click();
  await natasha.locator(".word-piece summary").nth(3).click();
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
  await leif.locator(".inspector input[type=file]").setInputFiles({
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
  await page.locator(".canvas-viewport").evaluate((node) =>
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

test("temporary inspector, compact hover cards, clean split/merge editor and vocabulary notes", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page.getByLabel("Cantonese phrase").fill("圖書館");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const card = page.getByTestId("phrase-card");
  await page.getByRole("button", { name: "Hide details" }).click();
  await card.click();
  await expect(page.locator(".inspector")).toBeVisible();
  await page.locator(".canvas-viewport").click({ position: { x: 15, y: 20 } });
  await expect(page.locator(".inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Show details" }).click();
  await card.click();
  await page.locator(".canvas-viewport").click({ position: { x: 15, y: 20 } });
  await expect(page.locator(".inspector")).toBeVisible();
  await card.click();
  await page
    .getByRole("button", { name: "Characters Plain text; hover for reading" })
    .click();
  await page.locator(".canvas-viewport").hover({ position: { x: 15, y: 20 } });
  await expect(card.locator(".hover-translation")).not.toBeVisible();
  await expect(card.locator("h2")).toHaveText("圖書館");
  await card.hover();
  await expect(card.locator(".hover-translation")).toContainText("library");
  await page.locator(".word-piece summary").first().click();
  await page
    .getByLabel("Split piece 1 after character 1", { exact: true })
    .click();
  await expect(page.locator(".word-piece")).toHaveCount(2);
  await page.getByRole("button", { name: "Merge with next" }).first().click();
  await expect(page.locator(".word-piece")).toHaveCount(1);
  await page.getByLabel("Piece 1 meaning").fill("the library");
  await page.getByLabel("Piece 1 vocabulary").selectOption("known");
  await page.getByLabel("Card note").fill("Ask where it is.");
  await page
    .getByRole("button", { name: "Vocabulary Coloured word pieces" })
    .click();
  await expect(card.locator(".card-word-chips .state-known")).toHaveCount(1);
  await card.getByRole("button", { name: "Expand card" }).click();
  await expect(card.locator(".card-note")).toHaveText("Ask where it is.");
  await page.getByLabel("Hide English from Leif").check();
  await page
    .getByRole("button", { name: "Characters Plain text; hover for reading" })
    .click();
  await page.getByRole("button", { name: "Leif", exact: true }).click();
  await card.hover();
  await expect(card.locator(".hover-translation")).toHaveCount(0);
  await expect(page.getByLabel("English meaning")).toHaveCount(0);
});

test("centered large canvas, in-place cards, English/Jyutping, stickers and keyboard undo", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await expect
    .poll(() =>
      page.locator(".canvas-viewport").evaluate((node) => node.scrollLeft),
    )
    .toBeGreaterThan(2000);
  await expect(page.locator(".canvas")).toHaveCSS("width", "5600px");
  await page.getByLabel("Input language").selectOption("english");
  await page.getByLabel("Cantonese phrase").fill("Can we get some tea?");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  await expect(page.getByTestId("phrase-card").locator("h2")).toHaveText(
    "Can we get some tea?",
  );
  await page.getByLabel("Input language").selectOption("jyutping");
  await page.getByLabel("Cantonese phrase").fill("nei5 hou2");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  await expect(page.getByTestId("phrase-card").last().locator("h2")).toHaveText(
    "nei5 hou2",
  );
  await page
    .getByRole("button", { name: "Place phrase card on canvas" })
    .click();
  await page.locator(".canvas-viewport").click({ position: { x: 70, y: 70 } });
  await expect(page.getByTestId("phrase-card")).toHaveCount(3);
  await page.getByLabel("Jyutping", { exact: true }).fill("jam2 caa4");
  await expect(page.getByTestId("phrase-card").last().locator("h2")).toHaveText(
    "jam2 caa4",
  );
  await page.getByRole("button", { name: "Place sticker on canvas" }).click();
  await page
    .getByRole("button", { name: "Sticker Noodle bowl", exact: true })
    .click();
  await page
    .locator(".canvas-viewport")
    .click({ position: { x: 160, y: 220 } });
  await expect(
    page.getByTestId("sticker-card").getByRole("img", { name: "Noodle bowl" }),
  ).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("sticker-card")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("sticker-card")).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("sticker-card")).toHaveCount(0);
  await page.locator(".canvas-viewport").evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
    node.scrollTop = node.scrollHeight;
  });
  await page
    .getByRole("button", { name: "Place phrase card on canvas" })
    .click();
  await page.locator(".canvas-viewport").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    node.querySelector(".canvas")!.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: rect.right - 10,
        clientY: rect.bottom - 10,
      }),
    );
  });
  await expect(page.getByTestId("phrase-card")).toHaveCount(4);
  expect(
    await page
      .getByTestId("phrase-card")
      .last()
      .evaluate((node) => parseInt((node as HTMLElement).style.left)),
  ).toBeLessThanOrEqual(5300);
});

test("partners see animal cursors, find each other and follow presenter zoom and camera", async ({
  browser,
}) => {
  const teacher = await blankPage(browser);
  const learner = await blankPage(browser);
  await teacher.getByRole("button", { name: "Natasha", exact: true }).click();
  await teacher.getByRole("button", { name: "Share / Sync" }).click();
  await teacher
    .getByLabel("Relay address (optional)")
    .fill(`ws://127.0.0.1:${relay.port}`);
  await teacher.getByRole("button", { name: "Create invitation" }).click();
  const invite = await teacher.getByLabel("Private invitation").inputValue();
  await teacher.getByRole("button", { name: "Close sharing" }).click();
  await learner.getByRole("button", { name: "Share / Sync" }).click();
  await learner.getByLabel("Lesson invitation").fill(invite);
  await learner.getByRole("button", { name: "Join lesson" }).click();
  await expect(teacher.getByText("2 live")).toBeVisible();
  await teacher
    .locator(".canvas-viewport")
    .hover({ position: { x: 70, y: 80 } });
  await learner
    .locator(".canvas-viewport")
    .hover({ position: { x: 90, y: 100 } });
  await expect(learner.locator(".remote-cursor strong")).toHaveText("🐻");
  await expect(teacher.locator(".remote-cursor strong")).toHaveText("🦝");
  await teacher.getByRole("button", { name: "Guide Leif" }).click();
  await expect(learner.locator(".follow-banner")).toContainText(
    "Following Natasha",
  );
  await teacher.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(learner.locator(".zoom-tools")).toContainText("90%");
  await teacher.locator(".canvas-viewport").evaluate((node) => {
    node.scrollLeft += 350;
    node.scrollTop += 250;
  });
  const expected = await teacher
    .locator(".canvas-viewport")
    .evaluate((node) => [
      (node.scrollLeft + node.clientWidth / 2) / 0.9,
      (node.scrollTop + node.clientHeight / 2) / 0.9,
    ]);
  await expect
    .poll(() =>
      learner
        .locator(".canvas-viewport")
        .evaluate((node) => (node.scrollLeft + node.clientWidth / 2) / 0.9),
    )
    .toBeCloseTo(expected[0], 0);
  await learner
    .getByRole("button", { name: "Stop following", exact: true })
    .click();
  await expect(learner.locator(".follow-banner")).toHaveCount(0);
  await teacher
    .locator(".canvas-viewport")
    .hover({ position: { x: 110, y: 130 } });
  await teacher.getByRole("button", { name: "Look here", exact: true }).click();
  await expect(learner.locator(".remote-cursor")).toHaveClass(/highlighted/);
});

test("attached connectors follow resized cards; marquee selection edits, moves and duplicates a group", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  const viewport = page.locator(".canvas-viewport");
  const bounds = (await viewport.boundingBox())!;
  async function moveCard(index: number, x: number, y: number) {
    const card = page.getByTestId("phrase-card").nth(index);
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(bounds.x + x + 30, bounds.y + y + 15, { steps: 8 });
    await page.mouse.up();
  }
  await page.getByLabel("Cantonese phrase").fill("你好");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  await moveCard(0, 100, 80);
  await page.getByLabel("Cantonese phrase").fill("飲水");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  await moveCard(1, 490, 200);
  await page.getByTestId("phrase-card").first().locator("h2").click();
  await page.getByRole("button", { name: "Connect to…", exact: true }).click();
  await page.getByTestId("phrase-card").nth(1).locator("h2").click();
  await expect(page.getByTestId("connector")).toHaveCount(1);
  const before = await page
    .getByTestId("connector")
    .locator("polyline")
    .first()
    .getAttribute("points");
  await moveCard(1, 520, 240);
  await expect
    .poll(() =>
      page
        .getByTestId("connector")
        .locator("polyline")
        .first()
        .getAttribute("points"),
    )
    .not.toBe(before);
  await viewport.click({ position: { x: 30, y: 30 } });
  await page.mouse.move(bounds.x + 30, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 840, bounds.y + 410, { steps: 10 });
  await page.mouse.up();
  await expect(
    page.getByRole("heading", { name: "2 elements", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Group card mode").selectOption("characters");
  for (const card of await page.getByTestId("phrase-card").all())
    await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const original = await page.getByTestId("phrase-card").first().boundingBox();
  await page.getByRole("button", { name: "Larger", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.getByTestId("phrase-card").first().boundingBox())!.width,
    )
    .toBeGreaterThan(original!.width);
  const locations = await page
    .getByTestId("phrase-card")
    .evaluateAll((nodes) =>
      nodes.map((node) => parseInt((node as HTMLElement).style.left)),
    );
  const box = (await page.getByTestId("phrase-card").first().boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 8 });
  await page.mouse.up();
  const moved = await page
    .getByTestId("phrase-card")
    .evaluateAll((nodes) =>
      nodes.map((node) => parseInt((node as HTMLElement).style.left)),
    );
  expect(moved[0] - locations[0]).toBeGreaterThan(50);
  expect(moved[1] - locations[1]).toBeGreaterThan(50);
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByTestId("phrase-card")).toHaveCount(4);
  await expect(page.getByTestId("connector")).toHaveCount(2);
  await page.getByRole("button", { name: "Delete all", exact: true }).click();
  await expect(page.getByTestId("phrase-card")).toHaveCount(2);
  await expect(page.getByTestId("connector")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("phrase-card")).toHaveCount(4);
  await expect(page.getByTestId("connector")).toHaveCount(2);
});

test("illustrated sticker hit area follows its silhouette and resize keeps proportions", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  const viewport = page.locator(".canvas-viewport");
  await page.getByRole("button", { name: "Place sticker on canvas" }).click();
  await expect(page.locator(".sticker-grid button")).toHaveCount(36);
  await page.getByLabel("Find stickers").fill("Plane");
  await page
    .getByRole("button", { name: "Sticker Plane", exact: true })
    .click();
  await viewport.click({ position: { x: 90, y: 100 } });
  const sticker = page.getByTestId("sticker-card");
  await expect(sticker.getByRole("img", { name: "Plane" })).toBeVisible();
  await expect(sticker).toHaveCSS("box-shadow", "none");
  const box = (await sticker.boundingBox())!;
  await page.mouse.click(box.x + 3, box.y + 3);
  await expect(sticker).not.toHaveClass(/selected/);
  await sticker
    .locator(".sticker-silhouette")
    .click({ position: { x: 45, y: 40 } });
  await expect(sticker).toHaveClass(/selected/);
  const handle = (await sticker
    .getByRole("button", { name: "Resize element" })
    .boundingBox())!;
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x + 95, handle.y + 70, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await sticker.boundingBox())!.width)
    .toBeGreaterThan(190);
  const resized = (await sticker.boundingBox())!;
  expect(Math.abs(resized.width - resized.height)).toBeLessThan(3);
  await page.screenshot({ path: "docs/illustrated-stickers.png" });
});

test("thin drawings and highlights can be selected, recoloured and erased with undo", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  const viewport = page.locator(".canvas-viewport");
  const pointOnStroke = async (index: number) =>
    page
      .getByTestId("drawing-hit")
      .nth(index)
      .evaluate((node) => {
        const line = node as SVGPolylineElement;
        const point = line.points.getItem(
          Math.floor(line.points.numberOfItems / 2),
        );
        const screen = new DOMPoint(point.x, point.y).matrixTransform(
          line.getScreenCTM()!,
        );
        return { x: screen.x, y: screen.y };
      });
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await page.getByRole("button", { name: "Ink #ec6b85", exact: true }).click();
  const range = page.getByLabel("Stroke thickness");
  await range.focus();
  await range.press("Home");
  await range.press("ArrowRight");
  await range.press("ArrowRight");
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 70, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 140, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByTestId("drawing")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Select and move", exact: true })
    .click();
  const hit = await pointOnStroke(0);
  await page.mouse.click(hit.x, hit.y);
  await expect(
    page.getByRole("heading", { name: "Drawing", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ink #3aa58b", exact: true }).click();
  await expect(
    page.getByTestId("drawing").locator("polyline").first(),
  ).toHaveAttribute("stroke", "#3aa58b");
  await page
    .getByRole("button", { name: "Erase drawings", exact: true })
    .click();
  const eraseHit = await pointOnStroke(0);
  await page.mouse.click(eraseHit.x, eraseHit.y);
  await expect(page.getByTestId("drawing")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("drawing")).toHaveCount(1);
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.mouse.move(box.x + 100, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + 200, { steps: 8 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Select and move", exact: true })
    .click();
  const markerHit = await pointOnStroke(1);
  await page.mouse.click(markerHit.x, markerHit.y);
  await expect(
    page.getByRole("heading", { name: "Drawing", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("drawing")).toHaveCount(1);
});
