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
async function blankPage(browser: Browser, details = true) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    permissions: ["microphone"],
  });
  contexts.push(context);
  await context.addInitScript(() => {
    (window as any).desktop = {
      pair: async () => null,
      saveBackup: async (text: string) => {
        const url = URL.createObjectURL(
          new Blob([text], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "lesson.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return true;
      },
      vocabulary: async () => {
        throw Error("No vocabulary in this fixture");
      },
      translate: async () => {
        throw Error("Offline fixture");
      },
    };
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Share / Sync" }),
  ).toBeVisible();
  if (details)
    await page
      .getByRole("button", { name: "Show details", exact: true })
      .click();
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
  ).toBeVisible();
  await natasha.locator(".word-piece summary").first().click();
  await natasha.getByLabel("Piece 1 Chinese").fill("我想");
  await natasha.getByRole("button", { name: "Add piece" }).click();
  await natasha.locator(".word-piece summary").nth(3).click();
  await natasha.getByLabel("Piece 4 Chinese").fill("水");
  await expect(leif.getByLabel("Piece 4 Chinese")).toHaveValue("水");
  await natasha
    .getByRole("button", { name: "Standard Language + English" })
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
  await page.getByRole("button", { name: "Leif", exact: true }).click();
  await expect(table.getByText("ngo5 soeng2 jam2 seoi2")).toBeVisible();
  await expect(table.getByLabel("English translation").first()).toHaveValue(
    "I want water.",
  );
  await page.getByRole("button", { name: "Natasha" }).click();
  await page.getByLabel("Selected card mode").selectOption("practice");
  await page.getByRole("button", { name: "Leif", exact: true }).click();
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
  await expect(page.locator(".history .lesson-open")).toHaveCount(2);
  await page.getByTestId("phrase-card").click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("phrase-card")).toHaveCount(0);
});

test("manual inspector, compact hover cards, clean split/merge editor and vocabulary notes", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page.getByLabel("Cantonese phrase").fill("圖書館");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const card = page.getByTestId("phrase-card");
  await card.click();
  await expect(page.locator(".inspector")).toHaveCount(0);
  await page.locator(".canvas-viewport").click({ position: { x: 15, y: 20 } });
  await expect(page.locator(".inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Show details" }).click();
  await card.click();
  await page.locator(".canvas-viewport").click({ position: { x: 15, y: 20 } });
  await expect(page.locator(".inspector")).toBeVisible();
  await card.click();
  await page
    .getByRole("button", { name: "Compact Meaning on hover or tap" })
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
    .getByRole("button", { name: "Standard Language + English" })
    .click();
  await expect(card.locator(".inline-vocabulary .state-known")).toHaveCount(1);
  await page.getByRole("button", { name: "Vocabulary colours" }).click();
  await expect(card.locator(".card-note")).toHaveText("Ask where it is.");
  await page.getByLabel("Selected card mode").selectOption("practice");
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
  await page.evaluate(() => {
    window.desktop!.analyze = async () => ({
      chinese: "我哋可唔可以飲啲茶？",
      jyutping: "ngo5 dei6 ho2 m4 ho2 ji5 jam2 di1 caa4?",
      definition: "Can we get some tea?",
      words: [],
    });
  });
  await page.getByLabel("Input language").selectOption("english");
  await page.getByLabel("Cantonese phrase").fill("Can we get some tea?");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  await expect(page.getByTestId("phrase-card").locator("h2")).toHaveText(
    "ngo5 dei6 ho2 m4 ho2 ji5 jam2 di1 caa4?",
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
  await expect(learner.locator(".remote-cursor strong")).toHaveText("🦝");
  await expect(teacher.locator(".remote-cursor strong")).toHaveText("🐻");
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
      (node.getBoundingClientRect().left -
        node.querySelector(".canvas")!.getBoundingClientRect().left +
        node.clientWidth / 2) /
        0.9,
      (node.getBoundingClientRect().top -
        node.querySelector(".canvas")!.getBoundingClientRect().top +
        node.clientHeight / 2) /
        0.9,
    ]);
  await expect
    .poll(() =>
      learner
        .locator(".canvas-viewport")
        .evaluate(
          (node) =>
            (node.getBoundingClientRect().left -
              node.querySelector(".canvas")!.getBoundingClientRect().left +
              node.clientWidth / 2) /
            0.9,
        ),
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
  const handle = (await page
    .getByTestId("phrase-card")
    .first()
    .getByRole("button", { name: "Drag connector", exact: true })
    .boundingBox())!;
  const destination = (await page
    .getByTestId("phrase-card")
    .nth(1)
    .boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(page.getByTestId("connector")).toHaveCount(1);
  const before = await page
    .getByTestId("connector")
    .locator("polyline")
    .first()
    .getAttribute("points");
  const movingBox = (await page
    .getByTestId("phrase-card")
    .nth(1)
    .boundingBox())!;
  await page.mouse.move(movingBox.x + 20, movingBox.y + 15);
  await page.mouse.down();
  await page.mouse.move(movingBox.x + 50, movingBox.y + 40, { steps: 4 });
  await expect
    .poll(() =>
      page
        .getByTestId("connector")
        .locator("polyline")
        .first()
        .getAttribute("points"),
    )
    .not.toBe(before);
  await page.mouse.up();
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
  await page.getByLabel("Group card mode").selectOption("peek");
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
  await expect(page.getByTestId("smooth-ink").first()).toHaveAttribute(
    "fill",
    "#3aa58b",
  );
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

test("conversation turns translate, preserve custom personas and show Jyutping on the other screen", async ({
  browser,
}) => {
  const teacher = await blankPage(browser),
    learner = await blankPage(browser);
  await teacher.getByRole("button", { name: "Natasha", exact: true }).click();
  await teacher.getByRole("button", { name: "Share / Sync" }).click();
  await teacher
    .getByLabel("Relay address")
    .fill(`ws://127.0.0.1:${relay.port}`);
  await teacher
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  const invite = await teacher.getByLabel("Private invitation").inputValue();
  await teacher.getByRole("button", { name: "Close sharing" }).click();
  await learner.getByRole("button", { name: "Share / Sync" }).click();
  await learner.getByLabel("Lesson invitation").fill(invite);
  await learner
    .getByRole("button", { name: "Join lesson", exact: true })
    .click();
  await teacher
    .getByRole("button", { name: "Add conversation", exact: true })
    .click();
  const conversation = teacher.getByTestId("conversation-card");
  await conversation.getByLabel("Dialogue Cantonese").first().dblclick();
  await conversation.getByLabel("Dialogue Cantonese").first().fill("你好");
  await conversation.getByLabel("Dialogue Cantonese").nth(1).dblclick();
  await conversation.getByLabel("Dialogue Cantonese").nth(1).fill("我想飲水");
  await conversation
    .getByLabel("Dialogue person")
    .nth(1)
    .selectOption("custom");
  await conversation.getByLabel("Custom person name").fill("Barista");
  await conversation
    .getByRole("button", { name: "Add turn", exact: true })
    .click();
  await expect(conversation.getByLabel("Dialogue Cantonese")).toHaveCount(3);
  await expect(learner.getByTestId("conversation-card")).toContainText("ngo5");
  await expect(learner.getByLabel("Dialogue person").nth(1)).toHaveValue(
    "custom",
  );
  await teacher.screenshot({ path: "docs/conversation.png" });
});

test("minimal question/answer tables derive both readings and support alternate canvas appearances", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page.getByLabel("Table template").selectOption("qa");
  await page
    .getByRole("button", { name: "Add phrase table", exact: true })
    .click();
  const table = page.getByTestId("table-card");
  await table.getByLabel("Chinese phrase", { exact: true }).fill("飲咩？");
  await table.getByLabel("Paired Chinese phrase").fill("飲水");
  await table.getByLabel("Paired English translation").fill("Drink water");
  await page.getByLabel("Table appearance").selectOption("ruled");
  await expect(table).toHaveClass(/table-style-ruled/);
  await page.getByRole("button", { name: "Leif", exact: true }).click();
  await expect(table.getByLabel("Paired Jyutping phrase")).toHaveValue(
    "jam2 seoi2",
  );
  await expect(table.getByLabel("Paired English translation")).toHaveValue(
    "Drink water",
  );
});

test("in-place phrase edits and optional inline vocabulary colours use the verified snapshot", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.evaluate(() => {
    (window as any).desktop = {
      pair: async () => null,
      vocabulary: async () => ({
        known: ["我"],
        queued: ["飲水"],
        at: Date.now(),
      }),
      translate: async () => "I want water",
    };
  });
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page.getByLabel("Cantonese phrase").fill("我想飲水");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const card = page.getByTestId("phrase-card");
  await card.locator("h2").dblclick();
  await card.getByLabel("Edit phrase in place").fill("我飲水");
  await card.getByLabel("Edit phrase in place").press("Enter");
  await expect(card.locator("h2")).toHaveText("我飲水");
  // Restart the lesson subscription to request the mock's verified vocabulary.
  await page.getByRole("button", { name: "New lesson", exact: true }).click();
  await page.getByLabel("Cantonese phrase").fill("我飲水");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  await expect(page.locator(".inline-vocabulary .state-known")).toHaveCount(1);
  await expect(page.locator(".inline-vocabulary .state-queued")).toHaveCount(1);
  await expect(page.locator(".card-handle")).toHaveCount(0);
  const colourBefore = await page
    .locator(".inline-vocabulary .state-known")
    .evaluate((el) => getComputedStyle(el).color);
  await page.getByTestId("phrase-card").hover();
  await expect(page.locator(".inline-vocabulary .state-known")).toHaveCSS(
    "color",
    colourBefore,
  );
});

test("laser lines appear live for the partner and fade without becoming saved ink", async ({
  browser,
}) => {
  const teacher = await blankPage(browser),
    learner = await blankPage(browser);
  await teacher.getByRole("button", { name: "Share / Sync" }).click();
  await teacher
    .getByLabel("Relay address")
    .fill(`ws://127.0.0.1:${relay.port}`);
  await teacher
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  const invite = await teacher.getByLabel("Private invitation").inputValue();
  await teacher.getByRole("button", { name: "Close sharing" }).click();
  await learner.getByRole("button", { name: "Share / Sync" }).click();
  await learner.getByLabel("Lesson invitation").fill(invite);
  await learner
    .getByRole("button", { name: "Join lesson", exact: true })
    .click();
  await teacher
    .getByRole("button", { name: "Laser pointer", exact: true })
    .click();
  const box = (await teacher.locator(".canvas-viewport").boundingBox())!;
  await teacher.mouse.move(box.x + 100, box.y + 100);
  await teacher.mouse.down();
  await teacher.mouse.move(box.x + 320, box.y + 160, { steps: 8 });
  await expect(learner.locator(".laser-layer polyline")).toHaveCount(1);
  await teacher.mouse.up();
  await expect(learner.locator(".laser-layer polyline")).toHaveCount(0, {
    timeout: 5000,
  });
  await expect(teacher.getByTestId("drawing")).toHaveCount(0);
});

test("push-to-talk creates a phrase and attaches the exact captured clip", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.addInitScript(() => {
    localStorage.setItem("jyutboard:online", "false");
    (window as any).desktop = {
      pair: async () => null,
      microphone: async () => true,
      saveBackup: async (text: string) => {
        (window as any).__backup = JSON.parse(text);
        return true;
      },
      vocabulary: async () => ({ known: [], queued: [], at: Date.now() }),
      transcribe: async (audio: string) => {
        (window as any).__capturedClip = audio;
        return { transcript: "你好我想飲水" };
      },
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => ({ getTracks: () => [{ stop() {} }] }),
    });
    class FakeRecorder {
      static isTypeSupported() {
        return true;
      }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: any;
      onstop: any;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob([new Uint8Array(256).fill(23)], {
            type: this.mimeType,
          }),
        });
        this.onstop?.();
      }
    }
    (window as any).MediaRecorder = FakeRecorder;
  });
  await page.reload();
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  const button = page.getByRole("button", {
    name: "Hold to speak Cantonese",
    exact: true,
  });
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(button).toContainText("Recording");
  await page.waitForTimeout(420);
  await page.mouse.up();
  await expect(page.getByTestId("phrase-card").locator("h2")).toHaveText(
    "你好我想飲水",
  );
  await expect(
    page.getByRole("button", { name: "Play Natasha recording", exact: true }),
  ).toHaveCount(1);
  // Releasing while microphone permission opens should latch recording, not discard it.
  await page.evaluate(() => {
    (window as any).desktop.microphone = async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return true;
    };
  });
  await button.click();
  await expect(button).toContainText("Recording");
  await button.click();
  await expect(page.getByTestId("phrase-card")).toHaveCount(2);
  // Failed transcription keeps the exact clip available for a manually typed card.
  await page.evaluate(() => {
    (window as any).desktop.transcribe = async () => {
      throw Error("Transcription temporarily unavailable");
    };
  });
  await button.click();
  await expect(button).toContainText("Recording");
  await button.click();
  await page
    .getByRole("button", { name: "Keep recording & type", exact: true })
    .click();
  await expect(page.getByTestId("phrase-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Export lesson backup", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__backup?.cards?.[0]?.audio),
    )
    .toBe(await page.evaluate(() => (window as any).__capturedClip));
});

test("conversation bubbles have saved queue receipts, display modes and a varied avatar picker", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.evaluate(() => {
    (window as any).desktop = {
      pair: async () => null,
      vocabulary: async () => ({ known: [], queued: [], at: Date.now() }),
      send: async (payload: any) => {
        (window as any).__queue = payload;
        return {
          results: payload.requests.map((_: any, index: number) => ({
            index,
            status: "created",
          })),
        };
      },
    };
  });
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page
    .getByRole("button", { name: "Add conversation", exact: true })
    .click();
  const conversation = page.getByTestId("conversation-card");
  await conversation.getByLabel("Dialogue Cantonese").first().dblclick();
  await conversation.getByLabel("Dialogue Cantonese").first().fill("飲水");
  await conversation.getByLabel("Dialogue translation").first().dblclick();
  await conversation
    .getByLabel("Dialogue translation")
    .first()
    .fill("Drink water");
  await expect(conversation.getByLabel("Dialogue note")).toHaveCount(0);
  await conversation
    .getByRole("button", { name: "Save bubble", exact: true })
    .first()
    .click();
  await expect(page.locator(".tray-item")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Send saved to JyutDeck", exact: true })
    .click();
  await expect(page.locator(".tray-item .receipt")).toHaveText("created");
  expect(
    await page.evaluate(() => (window as any).__queue.requests[0].chinese),
  ).toBe("飲水");
  await conversation.getByLabel("Choose avatar").first().click();
  await expect(
    conversation.locator(".avatar-grid").first().getByRole("button"),
  ).toHaveCount(12);
  await conversation
    .getByRole("button", { name: "Use Amira avatar", exact: true })
    .first()
    .click();
  await expect(conversation.locator(".avatar-picker[open]")).toHaveCount(0);
  await page.getByLabel("Conversation mode").selectOption("practice");
  await page.getByRole("button", { name: "Leif", exact: true }).click();
  await expect(conversation.getByLabel("Dialogue translation")).toHaveCount(0);
  await expect(conversation.getByLabel("Dialogue Jyutping").first()).toHaveText(
    "jam2 seoi2",
  );
});

test("notes edit directly and laser draws across cards without focusing or moving them", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page
    .getByRole("button", { name: "Place note on canvas", exact: true })
    .click();
  const canvas = page.locator(".canvas-viewport");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 300, box.y + 180);
  const note = page.locator(".note-card");
  await note.locator(".note-text").dblclick();
  await note
    .getByLabel("Edit note in place")
    .fill("A useful reminder\nfor our next lesson");
  await note.getByLabel("Edit note in place").press("Escape");
  await expect(note.locator(".note-text")).toHaveText(
    "A useful reminder\nfor our next lesson",
  );
  const bounds = (await note.boundingBox())!;
  await page
    .getByRole("button", { name: "Laser pointer", exact: true })
    .click();
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 20, bounds.y + 45, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(page.locator(".laser-layer polyline")).toHaveCount(1);
  await expect(note.getByLabel("Edit note in place")).toHaveCount(0);
  expect((await note.boundingBox())!.x).toBe(bounds.x);
  await expect(page.locator(".laser-layer polyline")).toHaveCount(0, {
    timeout: 4000,
  });
});

test("the three modes also govern table meanings and individual conversation-bubble details", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page
    .getByRole("button", { name: "Add phrase table", exact: true })
    .click();
  const table = page.getByTestId("table-card");
  await table.getByLabel("Chinese phrase", { exact: true }).fill("飲水");
  await page.getByLabel("Selected card mode").selectOption("peek");
  await expect(table.getByLabel("English translation")).toHaveCount(0);
  await table.locator("tbody tr").hover();
  await expect(table.getByRole("tooltip")).toContainText("water");
  await page.getByLabel("Selected card mode").selectOption("practice");
  await expect(table.getByRole("tooltip")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add conversation", exact: true })
    .click();
  const conversation = page.getByTestId("conversation-card");
  await conversation.getByLabel("Dialogue Cantonese").first().dblclick();
  await conversation.getByLabel("Dialogue Cantonese").first().fill("你好");
  await conversation.getByLabel("Bubble options").first().click();
  await conversation.getByLabel("Bubble mode").first().selectOption("practice");
  await conversation.getByLabel("Bubble options").first().click();
  await page.getByRole("button", { name: "Leif", exact: true }).click();
  await conversation.getByLabel("Dialogue Jyutping").first().click();
  await expect(page.locator(".row-detail")).not.toContainText("English");
  await expect(page.getByLabel("Piece 1 meaning")).toHaveCount(0);
});

test("card modes share typography, release unused height, and conversation favourites share the normal tray", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page.getByLabel("Cantonese phrase").fill("你好");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const phrase = page.getByTestId("phrase-card");
  await expect(page.locator(".inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await page.getByRole("button", { name: "Save phrase", exact: true }).click();
  await page.getByLabel("Selected card mode").selectOption("peek");
  const compact = await phrase.locator("h2").evaluate((el) => ({
    size: getComputedStyle(el).fontSize,
    weight: getComputedStyle(el).fontWeight,
    font: getComputedStyle(el).fontFamily,
  }));
  const compactHeight = (await phrase.boundingBox())!.height;
  await page.getByLabel("Selected card mode").selectOption("practice");
  expect(
    await phrase.locator("h2").evaluate((el) => ({
      size: getComputedStyle(el).fontSize,
      weight: getComputedStyle(el).fontWeight,
      font: getComputedStyle(el).fontFamily,
    })),
  ).toEqual(compact);
  expect((await phrase.boundingBox())!.height).toBeCloseTo(compactHeight, 0);
  await page.getByLabel("Selected card mode").selectOption("full");
  expect((await phrase.boundingBox())!.height).toBeGreaterThan(compactHeight);
  await page
    .getByRole("button", { name: "Add conversation", exact: true })
    .click();
  const conversation = page.getByTestId("conversation-card");
  await expect(conversation.locator(".dialogue-bubble").first()).toHaveCSS(
    "background-color",
    "rgb(225, 236, 250)",
  );
  await expect(conversation.locator(".dialogue-bubble").last()).toHaveCSS(
    "background-color",
    "rgb(249, 225, 235)",
  );
  await conversation.getByLabel("Dialogue Cantonese").first().dblclick();
  await conversation.getByLabel("Dialogue Cantonese").first().fill("飲水");
  await conversation
    .getByRole("button", { name: "Save bubble", exact: true })
    .first()
    .click();
  await expect(page.locator(".tray-item")).toHaveCount(2);
  await conversation.getByLabel("Bubble options").first().click();
  await expect(
    conversation.getByRole("button", { name: "Send to JyutDeck", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Send bubble to JyutDeck", exact: true }),
  ).toHaveCount(0);
});

test("touchpad saturation reverses immediately at all four canvas edges", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  const area = page.locator(".canvas-viewport");
  for (const axis of ["x", "y"] as const) {
    for (const direction of [-1, 1]) {
      const result = await area.evaluate(
        async (element, { axis, direction }) => {
          const node = element as HTMLElement,
            canvas = node.querySelector<HTMLElement>(".canvas")!;
          node.scrollLeft =
            axis === "x"
              ? direction < 0
                ? canvas.offsetLeft - 40
                : node.scrollWidth
              : canvas.offsetLeft + 600;
          node.scrollTop =
            axis === "y"
              ? direction < 0
                ? canvas.offsetTop - 40
                : node.scrollHeight
              : canvas.offsetTop + 500;
          const frame = () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
          const wheel = (delta: number) =>
            node.dispatchEvent(
              new WheelEvent("wheel", {
                bubbles: true,
                cancelable: true,
                deltaX: axis === "x" ? delta : 0,
                deltaY: axis === "y" ? delta : 0,
              }),
            );
          for (let i = 0; i < 80; i++) wheel(direction * 200);
          await frame();
          await frame();
          const before =
            axis === "x"
              ? canvas.getBoundingClientRect().left
              : canvas.getBoundingClientRect().top;
          wheel(-direction * 30);
          await frame();
          await frame();
          return {
            before,
            after:
              axis === "x"
                ? canvas.getBoundingClientRect().left
                : canvas.getBoundingClientRect().top,
          };
        },
        { axis, direction },
      );
      expect((result.before - result.after) * -direction).toBeGreaterThan(28);
      await page.waitForTimeout(700);
    }
  }
});

test("touchpad pinch paints scale and position together and holds its anchor through UI renders", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  // Test reciprocal gestures at baseline sensitivity without hitting the zoom
  // cap; default desktop sensitivity is now deliberately faster.
  await page.evaluate(() => localStorage.setItem("jyutboard:zoomSpeed", "1"));
  await page.reload();
  await page.getByLabel("Cantonese phrase").fill("飲水");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const result = await page
    .locator(".canvas-viewport")
    .evaluate(async (element) => {
      const node = element as HTMLElement,
        canvas = node.querySelector<HTMLElement>(".canvas")!;
      const card = canvas.querySelector<HTMLElement>(".board-card")!;
      const viewport = node.getBoundingClientRect();
      const anchor = {
        x: viewport.left + viewport.width / 2,
        y: viewport.top + viewport.height / 2,
      };
      const before = canvas.getBoundingClientRect();
      const world = { x: anchor.x - before.left, y: anchor.y - before.top };
      let error = 0,
        scaleError = 0;
      for (let i = 0; i < 36; i++) {
        // Multiple high-frequency events arrive before each display frame.
        for (let j = 0; j < 3; j++)
          node.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              ctrlKey: true,
              deltaY: i < 18 ? -1.5 : 1.5,
              clientX: anchor.x,
              clientY: anchor.y,
            }),
          );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        canvas.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            clientX: anchor.x,
            clientY: anchor.y,
          }),
        );
        const rect = canvas.getBoundingClientRect(),
          scale = rect.width / 5600;
        error = Math.max(
          error,
          Math.abs(rect.left + world.x * scale - anchor.x),
          Math.abs(rect.top + world.y * scale - anchor.y),
        );
        scaleError = Math.max(
          scaleError,
          Math.abs(
            card.getBoundingClientRect().width /
              parseFloat(getComputedStyle(card).width) -
              scale,
          ),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      return {
        error,
        scaleError,
        finalScale: canvas.getBoundingClientRect().width / 5600,
      };
    });
  expect(result.error).toBeLessThan(2);
  expect(result.scaleError).toBeLessThan(0.001);
  expect(result.finalScale).toBeGreaterThan(0.9);
  expect(result.finalScale).toBeLessThan(1);
});

test("favourite stars fit inside each phrase mode and right-hand dialogue stars sit on the left", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  await page.getByLabel("Cantonese phrase").fill("我想飲水");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const card = page.getByTestId("phrase-card");
  for (const mode of ["full", "peek", "practice"]) {
    await card.click();
    await page.getByLabel("Selected card mode").selectOption(mode);
    const box = (await card.boundingBox())!,
      star = (await card.locator(".card-star").boundingBox())!,
      text = (await card.locator("h2").boundingBox())!;
    expect(star.x).toBeGreaterThan(box.x);
    expect(star.x + star.width).toBeLessThan(box.x + box.width);
    expect(text.x + text.width).toBeLessThan(star.x);
  }
  await card.getByRole("button", { name: "Save phrase", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Unsave phrase", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add conversation", exact: true })
    .click();
  const conversation = page.getByTestId("conversation-card");
  for (const side of ["left", "right"]) {
    const turn = conversation.locator(`.turn-${side}`).first(),
      bubble = turn.locator(".dialogue-bubble"),
      star = turn.locator(".bubble-star"),
      text = turn.getByLabel(/Dialogue (Cantonese|Jyutping)/);
    const box = (await bubble.boundingBox())!,
      mark = (await star.boundingBox())!,
      content = (await text.boundingBox())!;
    expect(mark.x).toBeGreaterThan(box.x);
    expect(mark.x + mark.width).toBeLessThan(box.x + box.width);
    if (side === "right") expect(mark.x + mark.width).toBeLessThan(content.x);
    else expect(content.x + content.width).toBeLessThan(mark.x);
    await turn.hover();
    await star.click();
    await expect(star).toHaveAccessibleName("Unsave bubble");
  }
});

test("content sized cards, border editing and canonical in-place English work in both views", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page.getByLabel("Cantonese phrase").fill("drink water");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const card = page.getByTestId("phrase-card");
  await expect(card.locator("h2")).toHaveText("飲水");
  expect((await card.boundingBox())!.width).toBeLessThan(250);
  const appearance = page.locator(".appearance");
  await appearance.getByLabel("Card border width").selectOption("2");
  await appearance.getByLabel("Card border style").selectOption("dashed");
  await expect(card).toHaveCSS("border-width", "2px");
  await expect(card).toHaveCSS("border-style", "dashed");
  const original = (await card.boundingBox())!;
  await page.getByLabel("Selected card mode").selectOption("practice");
  expect((await card.boundingBox())!.height).toBeLessThan(original.height);
  for (const name of ["Leif", "Natasha"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await card.locator("h2").dblclick();
    await card.getByLabel("Edit phrase in place").fill("hello");
    await card.getByLabel("Edit phrase in place").press("Enter");
    await expect(card.locator("h2")).toHaveText(
      name === "Leif" ? "nei5 hou2" : "你好",
    );
  }
});

test("the simple lesson sidebar keeps all existing lessons and has no folder controls", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  await page.getByLabel("Cantonese phrase").fill("飲水");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const title = await page.locator(".lesson-open strong").first().innerText();
  await page.getByRole("button", { name: "New lesson", exact: true }).click();
  await expect(page.locator(".lesson-open")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "New folder", exact: true }),
  ).toHaveCount(0);
  await page.locator(".lesson-open").filter({ hasText: title }).click();
  await expect(page.getByTestId("phrase-card")).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("phrase-card")).toHaveCount(1);
});

test("dialogue English fills Cantonese in both views and dialogue recording remains a normal favourite", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  await page
    .getByRole("button", { name: "Add conversation", exact: true })
    .click();
  const turns = page.getByTestId("conversation-card").locator(".dialogue-turn");
  for (const [index, name] of ["Leif", "Natasha"].entries()) {
    await page.getByRole("button", { name, exact: true }).click();
    const turn = turns.nth(index);
    await turn.getByLabel("Dialogue translation").click();
    await turn.getByLabel("Dialogue translation").fill("drink water");
    await turn.getByLabel("Dialogue translation").press("Tab");
    await expect(turn.getByLabel(/Dialogue (Cantonese|Jyutping)/)).toHaveText(
      name === "Leif" ? "jam2 seoi2" : "飲水",
    );
  }
  await page.evaluate(() => {
    const w = window as any;
    w.desktop.microphone = async () => true;
    w.desktop.saveBackup = async (text: string) => {
      w.__dialogueBackup = JSON.parse(text);
      return true;
    };
    w.desktop.transcribe = async (audio: string) => {
      w.__dialogueClip = audio;
      return { transcript: "你好" };
    };
    navigator.mediaDevices.getUserMedia = async () =>
      ({ getTracks: () => [{ stop() {} }] }) as any;
    w.MediaRecorder = class {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: any;
      onstop: any;
      static isTypeSupported() {
        return true;
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob([new Uint8Array(256).fill(27)], {
            type: "audio/webm",
          }),
        });
        this.onstop?.();
      }
    };
  });
  const turn = turns.first();
  await turn.getByRole("button", { name: "Hold to speak Cantonese" }).click();
  await expect(
    turn.getByRole("button", { name: "Hold to speak Cantonese" }),
  ).toHaveAttribute("data-phase", "recording");
  await turn.getByRole("button", { name: "Hold to speak Cantonese" }).click();
  await expect(turn.getByLabel("Dialogue Cantonese")).toHaveText("你好");
  await expect(turn.getByLabel("Play bubble recording")).toBeVisible();
  await turn.getByRole("button", { name: "Save bubble", exact: true }).click();
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await expect(page.locator(".tray-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Export lesson backup" }).click();
  const recording = await page.evaluate(() => {
    const w = window as any;
    return {
      clip: w.__dialogueClip,
      saved: w.__dialogueBackup.cards[0].rows[0].audio,
    };
  });
  expect(recording.saved).toBe(recording.clip);
  expect(recording.saved).toContain("data:audio/");
});

test("unknown English uses the same analysis service in both views and late results preserve newer edits", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  await page.evaluate(() => {
    const w = window as any;
    w.__requests = [];
    w.desktop.analyze = async (text: string, language: string) => {
      w.__requests.push({ text, language });
      if (text === "an older custom phrase")
        await new Promise((resolve) => {
          w.__finishAnalysis = resolve;
        });
      return {
        chinese: "請畀個杯我",
        jyutping: "cing2 bei2 go3 bui1 ngo5",
        definition: text,
        words: [],
      };
    };
  });
  for (const name of ["Natasha", "Leif"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page
      .getByLabel("Cantonese phrase")
      .fill("please pass me the green cup");
    await page.getByRole("button", { name: "Add phrase", exact: true }).click();
    await expect(page.getByTestId("phrase-card")).toHaveCount(
      name === "Natasha" ? 1 : 2,
    );
  }
  expect(
    await page.evaluate(() =>
      (window as any).__requests.map((request: any) => request.language),
    ),
  ).toEqual(["english", "english"]);
  const card = page.getByTestId("phrase-card").last();
  await card.locator("h2").dblclick();
  await card.getByLabel("Edit phrase in place").fill("an older custom phrase");
  await card.getByLabel("Edit phrase in place").press("Enter");
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).__finishAnalysis)))
    .toBe(true);
  await card.locator("h2").dblclick();
  await card.getByLabel("Edit phrase in place").fill("hello");
  await card.getByLabel("Edit phrase in place").press("Enter");
  await expect(card.locator("h2")).toHaveText("nei5 hou2");
  await page.evaluate(() => (window as any).__finishAnalysis());
  await page.waitForTimeout(200);
  await expect(card.locator("h2")).toHaveText("nei5 hou2");
});

test("conversation vocabulary, avatar colours and Natasha-only inline audio stay consistent", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  await page.evaluate(() => {
    (window as any).desktop.getSettings = async () => ({
      queueUrl: "https://example.test/requests",
      hasQueueToken: false,
      hasGoogleKey: false,
    });
    (window as any).desktop.vocabulary = async () => ({
      known: ["我"],
      queued: ["飲水"],
      at: Date.now(),
    });
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page
    .getByRole("button", { name: "Add conversation", exact: true })
    .click();
  const conversation = page.getByTestId("conversation-card"),
    turn = conversation.locator(".dialogue-turn").first();
  await turn.getByLabel("Dialogue Cantonese").click();
  await turn.getByLabel("Dialogue Cantonese").fill("我想飲水");
  await turn.getByLabel("Dialogue Cantonese").press("Tab");
  await page
    .getByRole("button", { name: "Vocabulary colours", exact: true })
    .click();
  await expect(turn.locator(".highlight-enabled .state-known")).toHaveText(
    "我",
  );
  await expect(turn.locator(".highlight-enabled .state-queued")).toHaveText(
    "飲水",
  );
  const mic = (await turn
      .getByRole("button", { name: "Hold to speak Cantonese" })
      .boundingBox())!,
    text = (await turn.getByLabel("Dialogue Cantonese").boundingBox())!;
  expect(mic.x).toBeGreaterThanOrEqual(text.x + text.width);
  await turn.getByLabel("Choose avatar").click();
  await turn.getByRole("button", { name: "Use Maya avatar" }).click();
  await expect(turn.locator(".dialogue-bubble")).toHaveCSS(
    "background-color",
    "rgb(238, 230, 250)",
  );
  await page.getByRole("button", { name: "Leif", exact: true }).click();
  await expect(conversation.locator(".card-secondary")).toHaveCount(0);
  await expect(
    conversation.getByRole("button", { name: "Hold to speak Cantonese" }),
  ).toHaveCount(0);
  await expect(turn.getByLabel("Dialogue Jyutping")).toHaveText(
    "ngo5 soeng2 jam2 seoi2",
  );
  await expect(turn.locator(".highlight-enabled .state-known")).toHaveText(
    "ngo5",
  );
});

test("placement hints overlay a stable canvas, welcome closes and new notes contain no prefilled text", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  await page
    .getByRole("button", { name: "Close welcome", exact: true })
    .click();
  await expect(page.locator(".welcome")).toHaveCount(0);
  const viewport = page.locator(".canvas-viewport");
  const before = await viewport.boundingBox();
  await page
    .getByRole("button", { name: "Place sticker on canvas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sticker Apple", exact: true })
    .click();
  await expect(page.locator(".tool-hint")).toBeVisible();
  expect(await viewport.boundingBox()).toEqual(before);
  await page
    .getByRole("button", { name: "Place note on canvas", exact: true })
    .click();
  await viewport.click({ position: { x: 300, y: 200 } });
  await expect(page.getByLabel("Edit note in place")).toHaveValue("");
  await page.getByLabel("Edit note in place").fill("Remember this");
  await page.getByLabel("Edit note in place").press("Tab");
  await expect(page.getByTestId("phrase-card")).toContainText("Remember this");
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
});

test("table handles drag continuously and table fills and borders are editable", async ({
  browser,
}) => {
  const page = await blankPage(browser);
  await page.getByRole("button", { name: "Natasha", exact: true }).click();
  await page
    .getByRole("button", { name: "Add phrase table", exact: true })
    .click();
  const table = page.getByTestId("table-card");
  const before = (await table.boundingBox())!,
    handle = (await table
      .getByRole("button", { name: "Move table", exact: true })
      .boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle.x + 90, handle.y + 60, { steps: 8 });
  await expect
    .poll(async () => (await table.boundingBox())!.x)
    .toBeGreaterThan(before.x + 60);
  await page.mouse.up();
  const afterHandle = (await table.boundingBox())!;
  const heading = (await table.locator("th").first().boundingBox())!;
  await page.mouse.move(heading.x + 8, heading.y + 8);
  await page.mouse.down();
  await page.mouse.move(heading.x + 88, heading.y + 48, { steps: 8 });
  await expect
    .poll(async () => (await table.boundingBox())!.x)
    .toBeGreaterThan(afterHandle.x + 60);
  await page.mouse.up();
  const input = table.getByLabel("Chinese phrase").first();
  await input.fill("你好");
  await expect(input).toHaveValue("你好");
  const appearance = page.locator(".appearance");
  await appearance
    .getByRole("button", { name: "Lavender fill", exact: true })
    .click();
  await appearance.getByLabel("Card border width").selectOption("2");
  await appearance.getByLabel("Card border style").selectOption("dashed");
  await expect(table).toHaveCSS("background-color", "rgb(241, 238, 248)");
  await expect(table).toHaveCSS("border-width", "2px");
  await expect(table).toHaveCSS("border-style", "dashed");
});

test("in-place phrase editing preserves geometry and colours, with editable standard meanings", async ({
  browser,
}) => {
  const page = await blankPage(browser, false);
  await page.getByLabel("Cantonese phrase").fill("你好");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const card = page.getByTestId("phrase-card");
  await expect(card.locator(".card-secondary")).toHaveCount(0);
  const before = (await card.boundingBox())!,
    colour = await card
      .locator("h2")
      .evaluate((node) => getComputedStyle(node).color);
  await card.locator("h2").dblclick();
  expect(await card.boundingBox()).toEqual(before);
  expect(
    await card.locator("h2").evaluate((node) => getComputedStyle(node).color),
  ).toBe(colour);
  await card.getByLabel("Edit phrase in place").press("Enter");
  await expect(card.getByLabel("Phrase translation")).not.toBeEditable();
  await card.getByLabel("Phrase translation").click();
  await expect(card.getByLabel("Phrase translation")).not.toBeEditable();
  await card.getByLabel("Phrase translation").dblclick();
  await expect(card.getByLabel("Phrase translation")).toBeEditable();
  await card.getByLabel("Phrase translation").fill("drink water");
  await card.getByLabel("Phrase translation").press("Tab");
  await expect(card.locator("h2")).toHaveText("jam2 seoi2");
  await expect(card.getByLabel("Phrase translation")).toHaveText("drink water");
});

test("wheel and zoom over phrase meanings and speech text stay with the canvas until editing is requested", async ({
  browser,
}) => {
  test.setTimeout(45000);
  const page = await blankPage(browser, false);
  await page.getByLabel("Cantonese phrase").fill("飲水");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const initial = (await page
    .getByTestId("phrase-card")
    .locator("h2")
    .boundingBox())!;
  await page.mouse.move(initial.x + 10, initial.y + 10);
  await page.mouse.down();
  await page.mouse.move(initial.x - 230, initial.y - 90, { steps: 6 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Add conversation", exact: true })
    .click();
  const turn = page
    .getByTestId("conversation-card")
    .locator(".dialogue-turn")
    .first();
  const phrase = page.getByTestId("phrase-card");
  const targets = [
    phrase.getByLabel("Phrase translation"),
    turn.getByLabel("Dialogue Jyutping"),
    turn.getByLabel("Dialogue translation"),
  ];
  await expect(page.locator(".canvas textarea")).toHaveCount(0);
  for (const target of targets) {
    await target.hover();
    await expect(page.locator(".canvas textarea")).toHaveCount(0);
    const result = await target.evaluate(async (node) => {
      const viewport = node.closest(".canvas-viewport")!,
        canvas = viewport.querySelector<HTMLElement>(".canvas")!;
      const start = canvas.getBoundingClientRect().left;
      const rect = node.getBoundingClientRect();
      const pan = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 45,
        clientX: rect.x + 5,
        clientY: rect.y + 5,
      });
      node.dispatchEvent(pan);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const moved = start - canvas.getBoundingClientRect().left;
      const zoom = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -12,
        clientX: rect.x + 5,
        clientY: rect.y + 5,
      });
      node.dispatchEvent(zoom);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      return {
        panOwned: pan.defaultPrevented,
        zoomOwned: zoom.defaultPrevented,
        moved,
      };
    });
    expect(result.panOwned).toBe(true);
    expect(result.zoomOwned).toBe(true);
    expect(result.moved).toBeGreaterThan(30);
    await page.waitForTimeout(300);
  }
  await turn.getByLabel("Dialogue Jyutping").click();
  await expect(turn.locator("textarea")).toBeFocused();
  await turn.getByLabel("Dialogue Jyutping").fill("nei5 hou2");
  await turn.getByLabel("Dialogue Jyutping").press("Enter");
  await expect(turn.getByLabel("Dialogue Jyutping")).toHaveText("nei5 hou2");
  await expect(turn.locator("textarea")).toHaveCount(0);
});
