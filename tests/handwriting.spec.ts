import {
  test,
  expect,
  webkit,
  type Page,
  type Browser,
} from "@playwright/test";
async function fixture(browser: Browser, ipad = false) {
  const context = await browser.newContext({
    viewport: ipad
      ? { width: 1024, height: 768 }
      : { width: 1440, height: 960 },
    hasTouch: ipad,
    isMobile: ipad,
  });
  await context.addInitScript(() => {
    localStorage.setItem("jyutboard:role", "teacher");
    HTMLElement.prototype.setPointerCapture = function () {};
    (window as any).desktop = {
      pair: async () => null,
      vocabulary: async () => ({ known: ["我"], queued: [], at: Date.now() }),
      recognize: async (image: string) => {
        if (!image.startsWith("data:image/png;base64,"))
          throw Error("Expected ink crop");
        return { chinese: "我想飲水" };
      },
      translate: async () => "I want to drink water.",
    };
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Handwrite → Card", exact: true }),
  ).toBeVisible();
  return { page, context };
}
async function stroke(
  page: Page,
  x: number,
  y: number,
  id = 1,
  type = "mouse",
) {
  const canvas = page.locator(".canvas");
  for (const [event, px, py, pressure] of [
    ["pointerdown", x, y, 0.3],
    ["pointermove", x + 30, y + 20, 0.8],
    ["pointermove", x + 60, y, 0.6],
    ["pointerup", x + 60, y, 0],
  ] as const)
    await canvas.dispatchEvent(event, {
      pointerId: id,
      pointerType: type,
      button: 0,
      buttons: event === "pointerup" ? 0 : 1,
      clientX: px,
      clientY: py,
      pressure,
      bubbles: true,
    });
}
test("Handwrite groups temporary strokes, confirms an enriched normal card in place and leaves Pen ink alone", async ({
  browser,
}) => {
  const { page, context } = await fixture(browser);
  try {
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    await stroke(page, 550, 360);
    await expect(page.getByTestId("drawing")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Handwrite → Card", exact: true })
      .click();
    await stroke(page, 650, 400);
    await stroke(page, 660, 430, 2);
    await expect(page.getByTestId("handwrite-stroke")).toHaveCount(2);
    await expect(page.getByTestId("phrase-card")).toHaveCount(0);
    const bounds = await page
      .getByTestId("handwrite-stroke")
      .first()
      .boundingBox();
    await expect(page.getByTestId("handwrite-preview")).toContainText(
      "我想飲水",
    );
    await page
      .getByRole("button", { name: "Confirm handwriting card" })
      .click();
    const card = page.getByTestId("phrase-card");
    await expect(card.locator("h2")).toHaveText("我想飲水");

    await expect(card).toContainText("I want to drink water.");
    const position = await card.boundingBox();
    expect(Math.abs(position!.x - bounds!.x)).toBeLessThan(10);
    expect(Math.abs(position!.y - bounds!.y)).toBeLessThan(10);
    await expect(page.getByTestId("handwrite-stroke")).toHaveCount(0);
    await expect(page.getByTestId("drawing")).toHaveCount(1);
    await page.getByRole("button", { name: "Leif", exact: true }).click();
    await expect(card.locator("h2")).toContainText("ngo5");
  } finally {
    await context.close();
  }
});
test("handwriting preview can edit, retry and cancel without ever changing permanent ink", async ({
  browser,
}) => {
  const { page, context } = await fixture(browser);
  try {
    await page
      .getByRole("button", { name: "Handwrite → Card", exact: true })
      .click();
    await stroke(page, 600, 360);
    await expect(page.getByTestId("handwrite-preview")).toContainText(
      "我想飲水",
    );
    await page.getByRole("button", { name: "Edit handwriting result" }).click();
    await page.getByLabel("Edit recognized Chinese").fill("你好");
    await expect(page.getByLabel("Edit recognized Chinese")).toHaveValue(
      "你好",
    );
    await page.getByLabel("Edit recognized Chinese").press("Enter");
    await page
      .getByRole("button", { name: "Retry handwriting recognition" })
      .click();
    await expect(page.getByTestId("handwrite-preview")).toContainText(
      "我想飲水",
    );
    await page.getByRole("button", { name: "Cancel handwriting" }).click();
    await expect(page.getByTestId("handwrite-stroke")).toHaveCount(0);
    await expect(page.getByTestId("phrase-card")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test("conversation fields activate on one click, wheel while hovering still navigates and dragging does not start editing", async ({
  browser,
}) => {
  const { page, context } = await fixture(browser);
  try {
    await page
      .getByRole("button", { name: "Add conversation", exact: true })
      .click();
    const field = page.getByLabel("Dialogue Cantonese").first();
    await field.hover();
    const before = await page
      .locator(".canvas")
      .evaluate((el) => el.getBoundingClientRect().x);
    await page.mouse.wheel(45, 0);
    await expect
      .poll(() =>
        page.locator(".canvas").evaluate((el) => el.getBoundingClientRect().x),
      )
      .not.toBe(before);
    await expect(page.locator(".canvas textarea")).toHaveCount(0);
    await field.click();
    await expect(field).toBeFocused();
    await field.fill("你好");
    await field.press("Enter");
    await expect(field).toHaveText("你好");
    const box = (await field.boundingBox())!;
    await page.mouse.move(box.x + 15, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + 65, box.y + 15, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator(".canvas textarea")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test("iPad Pencil makes temporary ink and panning commits a text edit before its caret can detach", async () => {
  const browser = await webkit.launch();
  const { page, context } = await fixture(browser, true);
  try {
    await page
      .getByRole("button", { name: "Add conversation", exact: true })
      .click();
    const field = page.getByLabel("Dialogue Cantonese").first();
    const box = (await field.boundingBox())!;
    for (const type of ["pointerdown", "pointerup"])
      await field.dispatchEvent(type, {
        pointerId: 8,
        pointerType: "touch",
        clientX: box.x + 8,
        clientY: box.y + 8,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        bubbles: true,
      });
    await expect(field).toBeFocused();
    await field.fill("飲水");
    const before = await page
      .locator(".canvas")
      .evaluate((el) => el.getBoundingClientRect().x);
    await field.evaluate((el) =>
      el.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 50,
        }),
      ),
    );
    await expect(page.locator(".canvas textarea")).toHaveCount(0);
    await expect(page.getByLabel("Dialogue Cantonese").first()).toHaveText(
      "飲水",
    );
    await expect
      .poll(() =>
        page.locator(".canvas").evaluate((el) => el.getBoundingClientRect().x),
      )
      .not.toBe(before);
    await page
      .getByRole("button", { name: "Handwrite → Card", exact: true })
      .click();
    await stroke(page, 550, 360, 20, "pen");
    await expect(page.getByTestId("handwrite-stroke")).toHaveCount(1);
    await expect(page.getByTestId("drawing")).toHaveCount(0);
    const view = await page
      .locator(".canvas")
      .evaluate((el) => el.getBoundingClientRect().x);
    for (const [type, x] of [
      ["pointerdown", 700],
      ["pointermove", 760],
      ["pointerup", 760],
    ] as const)
      await page
        .locator(".canvas")
        .dispatchEvent(type, {
          pointerId: 30,
          pointerType: "touch",
          clientX: x,
          clientY: 300,
          buttons: type === "pointerup" ? 0 : 1,
          bubbles: true,
        });
    await expect
      .poll(() =>
        page.locator(".canvas").evaluate((el) => el.getBoundingClientRect().x),
      )
      .not.toBe(view);
    await expect(page.getByTestId("handwrite-stroke")).toHaveCount(1);
    await expect(page.getByTestId("handwrite-preview")).toContainText(
      "我想飲水",
    );
    await page
      .getByRole("button", { name: "Confirm handwriting card" })
      .click();
    await expect(page.getByTestId("phrase-card")).toHaveCount(1);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("continuing to write invalidates an older recognition reply and new Pen marks never join the phrase", async ({
  browser,
}) => {
  const { page, context } = await fixture(browser);
  try {
    await page.evaluate(() => {
      (window as any).__reading = [];
      window.desktop!.recognize = () =>
        new Promise((resolve) => (window as any).__reading.push(resolve));
    });
    await page
      .getByRole("button", { name: "Handwrite → Card", exact: true })
      .click();
    await stroke(page, 600, 360);
    await expect
      .poll(() => page.evaluate(() => (window as any).__reading.length))
      .toBe(1);
    await stroke(page, 620, 385, 2);
    await page.evaluate(() => (window as any).__reading[0]({ chinese: "錯" }));
    await expect(page.getByTestId("handwrite-preview")).not.toContainText("錯");
    await expect
      .poll(() => page.evaluate(() => (window as any).__reading.length))
      .toBe(2);
    await page.evaluate(() =>
      (window as any).__reading[1]({ chinese: "你好" }),
    );
    await expect(page.getByTestId("handwrite-preview")).toContainText("你好");
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    await stroke(page, 760, 400, 3);
    await expect(page.getByTestId("drawing")).toHaveCount(1);
    await expect(page.getByTestId("handwrite-stroke")).toHaveCount(2);
    await expect(page.getByTestId("handwrite-preview")).toContainText("你好");
  } finally {
    await context.close();
  }
});
