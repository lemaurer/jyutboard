import {
  test,
  expect,
  webkit,
  type Browser,
  type Page,
} from "@playwright/test";
import { startRelay } from "../electron/relay-server";
let safari: Browser, relay: Awaited<ReturnType<typeof startRelay>>;
const room = "c".repeat(48);
test.setTimeout(60000);
test.beforeAll(async () => {
  safari = await webkit.launch();
  relay = await startRelay(0, "127.0.0.1");
});
test.afterAll(async () => {
  await safari?.close();
  await relay?.close();
});
async function tablet() {
  const context = await safari.newContext({
    viewport: { width: 1024, height: 768 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => {
    HTMLElement.prototype.setPointerCapture = function () {};
  });
  const page = await context.newPage();
  await page.route("**/api/board", async (route) => {
    const body = route.request().postDataJSON();
    expect(route.request().headers()["authorization"]).toBeUndefined();
    await route.fulfill({
      json:
        body.action === "resolve"
          ? { relay: `ws://127.0.0.1:${relay.port}` }
          : body.action === "vocabulary"
            ? { known: ["我"], queued: ["飲水"], at: Date.now() }
            : body.action === "transcribe"
              ? { transcript: "我想飲水" }
              : {
                  results: [{ index: 0, status: "created", id: "web-fixture" }],
                },
    });
  });
  return { context, page };
}
async function pointer(
  page: Page,
  type: string,
  id: number,
  x: number,
  y: number,
  pointerType = "touch",
  pressure = 0.5,
) {
  await page.locator(".canvas").dispatchEvent(type, {
    pointerId: id,
    pointerType,
    clientX: x,
    clientY: y,
    pressure,
    bubbles: true,
    buttons: type === "pointerup" ? 0 : 1,
    isPrimary: id === 1,
  });
}
test("iPad first join has no hosting or credentials; invitation remembers a shared role-specific lesson", async () => {
  const { page, context } = await tablet();
  try {
    await page.goto("/");
    await expect(
      page.getByRole("dialog", { name: "Share lesson" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start internet lesson" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Natasha · 中文", exact: true })
      .click();
    await page
      .getByLabel("Lesson invitation")
      .fill(
        `jyutboard://join#room=${room}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
      );
    await page
      .getByRole("button", { name: "Join lesson", exact: true })
      .click();
    await expect(page.getByLabel("Your lesson view")).toHaveValue("teacher");
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await expect(page.locator(".tablet-join")).toHaveCount(0);
    await expect(page.locator(".composer-controls")).not.toBeVisible();
    await page.getByLabel("Cantonese phrase").fill("我想飲水");
    await page.getByRole("button", { name: "Add phrase", exact: true }).click();
    const card = page.getByTestId("phrase-card");
    await expect(card.locator("h2")).toHaveText("我想飲水");
    await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.getByRole("button", { name: "Vocabulary colours" }).click();
    await expect(card.locator(".state-known")).toHaveCSS(
      "color",
      "rgb(85, 129, 117)",
    );
    await card.click();
    await page.getByLabel("Selected card mode").selectOption("peek");
    await expect(card.locator(".hover-translation")).toBeVisible();
    await page.getByLabel("Selected card mode").selectOption("practice");
    await expect(card.locator(".hover-translation")).toHaveCount(0);
    await page.getByLabel("Your lesson view").selectOption("learner");
    await expect(card.locator("h2")).toContainText("ngo5");
    await page.reload();
    await expect(page.getByTestId("phrase-card").locator("h2")).toContainText(
      "ngo5",
    );
    await page.getByRole("button", { name: "Show pages", exact: true }).click();
    await page
      .getByRole("button", { name: "Lesson connection", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Join Natasha", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Add to Home Screen", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close sharing" }).click();
    await page.screenshot({ path: "docs/ipad.png" });
  } finally {
    await context.close();
  }
});
test("Pencil draws pressure-sensitive ink, a resting finger makes no marks and finger navigation preserves ink", async () => {
  const { page, context } = await tablet();
  try {
    await page.goto(
      `/#room=${room}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
    );
    await expect(
      page.getByRole("button", { name: "Draw", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    const box = (await page.locator(".canvas-viewport").boundingBox())!;
    const x = box.x + 200,
      y = box.y + 180;
    await pointer(page, "pointerdown", 1, x, y, "pen", 0.2);
    await pointer(page, "pointermove", 1, x + 40, y + 20, "pen", 0.8);
    await pointer(page, "pointerdown", 2, x + 170, y + 100);
    await pointer(page, "pointermove", 2, x + 190, y + 100);
    await pointer(page, "pointerup", 2, x + 190, y + 100);
    await pointer(page, "pointermove", 1, x + 80, y + 45, "pen", 0.5);
    await pointer(page, "pointerup", 1, x + 80, y + 45, "pen", 0);
    await expect(page.getByTestId("smooth-ink")).toHaveCount(1);
    const drawing = await page.getByTestId("smooth-ink").getAttribute("d");
    expect(drawing?.length).toBeGreaterThan(50);
    const before = await page
      .locator(".canvas-viewport")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().left -
          el.querySelector(".canvas")!.getBoundingClientRect().left,
      );
    await pointer(page, "pointerdown", 3, x, y);
    await pointer(page, "pointermove", 3, x + 60, y + 30);
    await pointer(page, "pointerup", 3, x + 60, y + 30);
    await expect
      .poll(() =>
        page
          .locator(".canvas-viewport")
          .evaluate(
            (el) =>
              el.getBoundingClientRect().left -
              el.querySelector(".canvas")!.getBoundingClientRect().left,
          ),
      )
      .toBeLessThan(before);
    await expect(page.getByTestId("smooth-ink")).toHaveCount(1);
    const initialZoom = await page
      .locator(".canvas")
      .evaluate((el) => getComputedStyle(el).transform);
    await page
      .getByRole("button", { name: "Lasso selection", exact: true })
      .click();
    await pointer(page, "pointerdown", 4, x, y);
    await pointer(page, "pointerdown", 5, x + 100, y);
    await pointer(page, "pointermove", 5, x + 170, y);
    await pointer(page, "pointerup", 5, x + 170, y);
    await pointer(page, "pointerup", 4, x, y);
    await expect
      .poll(() =>
        page
          .locator(".canvas")
          .evaluate((el) => getComputedStyle(el).transform),
      )
      .not.toBe(initialZoom);
    await expect(page.getByTestId("smooth-ink")).toHaveAttribute("d", drawing!);
  } finally {
    await context.close();
  }
});
test("browser participant shares edits, conversation bubbles and attached audio with desktop-compatible clients", async () => {
  const a = await tablet(),
    b = await tablet();
  try {
    const invite = `/#room=${"d".repeat(48)}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`;
    await a.page.goto(invite);
    await b.page.goto(invite);
    await a.page.getByLabel("Your lesson view").selectOption("teacher");
    await expect(a.page.getByText("2 live")).toBeVisible();
    await a.page
      .getByRole("button", { name: "Add conversation", exact: true })
      .click();
    await a.page.getByLabel("Dialogue Cantonese").first().dblclick();
    await a.page.getByLabel("Dialogue Cantonese").first().fill("你好");
    await expect(b.page.getByTestId("conversation-card")).toContainText(
      "nei5 hou2",
    );
    const audio = "data:audio/mp4;base64," + btoa("test audio ".repeat(20));
    const transcript = await a.page.evaluate(
      async (audio) => (await window.desktop!.transcribe(audio)).transcript,
      audio,
    );
    expect(transcript).toBe("我想飲水");
    await a.page
      .getByTestId("conversation-card")
      .getByRole("button", { name: "Save bubble" })
      .first()
      .click();
    await expect(
      b.page
        .getByTestId("conversation-card")
        .getByRole("button", { name: "Unsave bubble" })
        .first(),
    ).toBeVisible();
    const result = await a.page.evaluate(() =>
      window.desktop!.send({
        requests: [{ chinese: "你好", idempotencyKey: "ipad-test" }],
      }),
    );
    expect(result).toMatchObject({ results: [{ status: "created" }] });
    // Return to the app without changing the room capability stored on the device.
    await b.page.reload();
    await expect(b.page.getByTestId("conversation-card")).toContainText(
      "nei5 hou2",
    );
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test("iPad lasso selects a group and drags it without scrolling or opening details; pinch still works", async () => {
  const { page, context } = await tablet();
  try {
    await page.goto(
      `/#room=${"f".repeat(48)}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
    );
    await page.getByLabel("Your lesson view").selectOption("teacher");
    for (const text of ["你好", "飲水"]) {
      await page.getByLabel("Cantonese phrase").fill(text);
      await page
        .getByRole("button", { name: "Add phrase", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Lasso selection", exact: true })
      .click();
    const cards = page.getByTestId("phrase-card");
    const boxes = await cards.evaluateAll((nodes) =>
      nodes.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    const x = Math.min(...boxes.map((b) => b.x)) - 8,
      y = Math.min(...boxes.map((b) => b.y)) - 8;
    const right = Math.max(...boxes.map((b) => b.x + b.w)) + 8,
      bottom = Math.max(...boxes.map((b) => b.y + b.h)) + 8;
    await pointer(page, "pointerdown", 10, x, y);
    for (const [px, py] of [
      [right, y],
      [right, bottom],
      [x, bottom],
      [x, y],
    ])
      await pointer(page, "pointermove", 10, px, py);
    await pointer(page, "pointerup", 10, x, y);
    await expect(page.locator(".phrase-card.selected")).toHaveCount(2);
    await expect(page.locator(".inspector")).toHaveCount(0);
    const before = await cards.evaluateAll((nodes) =>
      nodes.map((el) => parseFloat((el as HTMLElement).style.left)),
    );
    const scroll = await page.locator(".canvas-viewport").evaluate((el) => ({
      x:
        el.scrollLeft -
        (el.querySelector<HTMLElement>(".canvas")?.offsetLeft || 0),
      y:
        el.scrollTop -
        (el.querySelector<HTMLElement>(".canvas")?.offsetTop || 0),
    }));
    const box = (await cards.first().boundingBox())!;
    // Drag a selected object without changing away from the Pencil tool.
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    await cards.first().dispatchEvent("pointerdown", {
      pointerId: 11,
      pointerType: "touch",
      clientX: box.x + 30,
      clientY: box.y + 25,
      bubbles: true,
      buttons: 1,
    });
    await pointer(page, "pointermove", 11, box.x + 70, box.y + 45);
    await pointer(page, "pointerup", 11, box.x + 70, box.y + 45);
    const after = await cards.evaluateAll((nodes) =>
      nodes.map((el) => parseFloat((el as HTMLElement).style.left)),
    );
    expect(after[0] - before[0]).toBeCloseTo(40, 0);
    expect(after[1] - before[1]).toBeCloseTo(40, 0);
    expect(
      await page.locator(".canvas-viewport").evaluate((el) => ({
        x:
          el.scrollLeft -
          (el.querySelector<HTMLElement>(".canvas")?.offsetLeft || 0),
        y:
          el.scrollTop -
          (el.querySelector<HTMLElement>(".canvas")?.offsetTop || 0),
      })),
    ).toEqual(scroll);
    await expect(page.getByTestId("drawing")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect(
      await cards.evaluateAll((nodes) =>
        nodes.map((el) => parseFloat((el as HTMLElement).style.left)),
      ),
    ).toEqual(before);
    const selectedBox = (await cards.first().boundingBox())!;
    await cards.first().dispatchEvent("pointerdown", {
      pointerId: 20,
      pointerType: "pen",
      clientX: selectedBox.x + 20,
      clientY: selectedBox.y + 15,
      bubbles: true,
      buttons: 1,
      pressure: 0.3,
    });
    await pointer(
      page,
      "pointermove",
      20,
      selectedBox.x + 70,
      selectedBox.y + 20,
      "pen",
      0.8,
    );
    await pointer(
      page,
      "pointerup",
      20,
      selectedBox.x + 70,
      selectedBox.y + 20,
      "pen",
    );
    await expect(page.getByTestId("drawing")).toHaveCount(1);
    const initial = await page
      .locator(".canvas")
      .evaluate((el) => getComputedStyle(el).transform);
    await pointer(page, "pointerdown", 12, 400, 350);
    await pointer(page, "pointerdown", 13, 500, 350);
    await pointer(page, "pointermove", 13, 560, 350);
    await pointer(page, "pointerup", 13, 560, 350);
    await pointer(page, "pointerup", 12, 400, 350);
    await expect
      .poll(() =>
        page
          .locator(".canvas")
          .evaluate((el) => getComputedStyle(el).transform),
      )
      .not.toBe(initial);
  } finally {
    await context.close();
  }
});

test("Safari keyboard resize and offset keep the composer and modal in the visible viewport", async () => {
  const { page, context } = await tablet();
  try {
    await page.addInitScript(() => {
      const viewport = new EventTarget();
      Object.assign(viewport, {
        height: 768,
        width: 1024,
        offsetTop: 0,
        offsetLeft: 0,
      });
      Object.defineProperty(window, "visualViewport", {
        value: viewport,
        configurable: true,
      });
      (window as any).__viewport = viewport;
    });
    await page.goto(
      `/#room=${"e".repeat(48)}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
    );
    await page.getByLabel("Your lesson view").selectOption("teacher");
    await page.getByLabel("Cantonese phrase").fill("你好");
    await page.getByRole("button", { name: "Add phrase", exact: true }).click();
    await page
      .getByRole("button", { name: "Edit text in place", exact: true })
      .click();
    await expect(page.getByLabel("Edit phrase in place")).toBeFocused();
    await page.evaluate(() => {
      const v = (window as any).__viewport;
      v.height = 410;
      v.offsetTop = 84;
      v.dispatchEvent(new Event("resize"));
      v.dispatchEvent(new Event("scroll"));
    });
    await expect(page.locator(".app")).toHaveCSS("height", "410px");
    await expect(page.locator(".app")).toHaveCSS("top", "84px");
    await expect
      .poll(async () => {
        const field = (await page
          .getByLabel("Edit phrase in place")
          .boundingBox())!;
        const canvas = (await page.locator(".canvas-viewport").boundingBox())!;
        return (
          field.y >= canvas.y &&
          field.y + field.height <= canvas.y + canvas.height
        );
      })
      .toBe(true);
    await page.getByLabel("Cantonese phrase").focus();
    const composer = (await page.locator(".composer").boundingBox())!;
    expect(composer.y + composer.height).toBeLessThanOrEqual(494);
    await expect(page.locator(".composer-controls")).not.toBeVisible();
    await expect(page.locator(".canvas-viewport")).toBeVisible();
    await page.getByRole("button", { name: "Show pages", exact: true }).click();
    await page
      .getByRole("button", { name: "Lesson connection", exact: true })
      .click();
    await page.getByLabel("Lesson invitation").focus();
    const modal = (await page
      .getByRole("dialog", { name: "Share lesson" })
      .boundingBox())!;
    expect(modal.y).toBeGreaterThanOrEqual(84);
    expect(modal.y + modal.height).toBeLessThanOrEqual(494);
    await page.evaluate(() => {
      const v = (window as any).__viewport;
      v.height = 768;
      v.offsetTop = 84;
      v.dispatchEvent(new Event("resize"));
    });
    await expect(page.locator(".app")).toHaveCSS("height", "768px");
    // Safari may keep the old offset after Done even while the field stays focused.
    await expect(page.locator(".app")).toHaveCSS("top", "0px");
    expect((await page.locator(".app").boundingBox())!.y).toBe(0);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  } finally {
    await context.close();
  }
});

test("iPad touch selects, drags through captured viewport events, double-taps to edit and taps canvas to deselect", async () => {
  const { page, context } = await tablet();
  try {
    await page.goto(
      `/#room=${"9".repeat(48)}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
    );
    await page.getByLabel("Your lesson view").selectOption("teacher");
    await page.getByLabel("Cantonese phrase").fill("你好");
    await page.getByRole("button", { name: "Add phrase", exact: true }).click();
    const card = page.getByTestId("phrase-card");
    const area = page.locator(".canvas-viewport");
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    const blank = (await area.boundingBox())!;
    await page.touchscreen.tap(blank.x + 25, blank.y + 150);
    await expect(card).not.toHaveClass(/selected/);
    let box = (await card.boundingBox())!;
    await page.touchscreen.tap(box.x + 30, box.y + 25);
    await expect(card).toHaveClass(/selected/);
    await expect(page.getByLabel("Edit phrase in place")).toHaveCount(0);
    const scroll = await area.evaluate((el) => ({
      x: el.scrollLeft - el.querySelector<HTMLElement>(".canvas")!.offsetLeft,
      y: el.scrollTop - el.querySelector<HTMLElement>(".canvas")!.offsetTop,
    }));
    const left = await card.evaluate((el) =>
      parseFloat((el as HTMLElement).style.left),
    );
    // Actual pointer capture targets the viewport rather than a card or canvas.
    await card.dispatchEvent("pointerdown", {
      pointerId: 91,
      pointerType: "touch",
      clientX: box.x + 30,
      clientY: box.y + 25,
      bubbles: true,
      buttons: 1,
      isPrimary: true,
    });
    await area.dispatchEvent("pointermove", {
      pointerId: 91,
      pointerType: "touch",
      clientX: box.x + 90,
      clientY: box.y + 45,
      bubbles: true,
      buttons: 1,
    });
    await area.dispatchEvent("pointerup", {
      pointerId: 91,
      pointerType: "touch",
      clientX: box.x + 90,
      clientY: box.y + 45,
      bubbles: true,
      buttons: 0,
    });
    expect(
      await card.evaluate((el) => parseFloat((el as HTMLElement).style.left)),
    ).toBeCloseTo(left + 60, 0);
    expect(
      await area.evaluate((el) => ({
        x:
          el.scrollLeft -
          (el.querySelector<HTMLElement>(".canvas")?.offsetLeft || 0),
        y:
          el.scrollTop -
          (el.querySelector<HTMLElement>(".canvas")?.offsetTop || 0),
      })),
    ).toEqual(scroll);
    await expect(page.getByTestId("drawing")).toHaveCount(0);
    box = (await card.boundingBox())!;
    await page.touchscreen.tap(box.x + 30, box.y + 25);
    await page.touchscreen.tap(box.x + 30, box.y + 25);
    await expect(page.getByLabel("Edit phrase in place")).toBeFocused();
    await page.getByLabel("Edit phrase in place").fill("飲水");
    const empty = (await area.boundingBox())!;
    await page.touchscreen.tap(empty.x + 25, empty.y + 150);
    await expect(card).not.toHaveClass(/selected/);
    await expect(page.getByLabel("Edit phrase in place")).toHaveCount(0);
    await expect(card.locator("h2")).toHaveText("飲水");
    await page
      .getByRole("button", { name: "Place note on canvas", exact: true })
      .click();
    const spot = (await area.boundingBox())!;
    await page.touchscreen.tap(spot.x + 140, spot.y + 240);
    const placedNote = (await page.locator(".note-card").boundingBox())!;
    await page.touchscreen.tap(placedNote.x + 30, placedNote.y + 25);
    await page.touchscreen.tap(placedNote.x + 30, placedNote.y + 25);
    await page.getByLabel("Edit note in place").fill("Remember the tone");
    await page.getByLabel("Edit note in place").press("Escape");
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    const note = page.locator(".note-card");
    const noteBox = (await note.boundingBox())!;
    await page.touchscreen.tap(noteBox.x + 30, noteBox.y + 25);
    await page.touchscreen.tap(noteBox.x + 30, noteBox.y + 25);
    await expect(page.getByLabel("Edit note in place")).toBeFocused();
    await expect(page.getByLabel("Edit note in place")).toHaveValue(
      "Remember the tone",
    );
    await expect(page.locator(".inspector")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("iPad pan glides after release and a new touch stops the glide", async () => {
  const { page, context } = await tablet();
  try {
    await page.goto(
      `/#room=${"8".repeat(48)}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
    );
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    const area = page.locator(".canvas-viewport"),
      box = (await area.boundingBox())!;
    const x = box.x + 400,
      y = box.y + 200;
    await pointer(page, "pointerdown", 1, x, y);
    await page.waitForTimeout(20);
    await pointer(page, "pointermove", 1, x - 30, y);
    await page.waitForTimeout(20);
    await pointer(page, "pointermove", 1, x - 65, y);
    await pointer(page, "pointerup", 1, x - 65, y);
    const released = await area.evaluate(
      (el) =>
        el.getBoundingClientRect().left -
        el.querySelector(".canvas")!.getBoundingClientRect().left,
    );
    await expect
      .poll(() =>
        area.evaluate(
          (el) =>
            el.getBoundingClientRect().left -
            el.querySelector(".canvas")!.getBoundingClientRect().left,
        ),
      )
      .toBeGreaterThan(released + 12);
    await pointer(page, "pointerdown", 1, x - 65, y);
    await page.waitForTimeout(32);
    const stopped = await area.evaluate(
      (el) =>
        el.getBoundingClientRect().left -
        el.querySelector(".canvas")!.getBoundingClientRect().left,
    );
    await page.waitForTimeout(120);
    expect(
      await area.evaluate(
        (el) =>
          el.getBoundingClientRect().left -
          el.querySelector(".canvas")!.getBoundingClientRect().left,
      ),
    ).toBe(stopped);
    await pointer(page, "pointerup", 1, x - 65, y);
  } finally {
    await context.close();
  }
});

test("iPad elastic edges show the surrounding desk, resist long pulls and settle after release", async () => {
  const { page, context } = await tablet();
  try {
    await page.goto(
      `/#room=${"7".repeat(48)}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
    );
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    const area = page.locator(".canvas-viewport");
    await area.evaluate((el) => {
      const canvas = el.querySelector<HTMLElement>(".canvas")!;
      el.scrollLeft = canvas.offsetLeft;
      el.scrollTop = canvas.offsetTop;
    });
    const box = (await area.boundingBox())!,
      x = box.x + 160,
      y = box.y + 170;
    await pointer(page, "pointerdown", 1, x, y);
    await pointer(page, "pointermove", 1, x + 100, y);
    await expect
      .poll(
        async () => (await page.locator(".canvas").boundingBox())!.x - box.x,
      )
      .toBeGreaterThan(20);
    const first = (await page.locator(".canvas").boundingBox())!.x - box.x;
    await pointer(page, "pointermove", 1, x + 700, y);
    await page.waitForTimeout(40);
    const farther = (await page.locator(".canvas").boundingBox())!.x - box.x;
    expect(farther).toBeGreaterThan(first);
    expect(farther - first).toBeLessThan(150);
    expect(farther).toBeLessThan(box.width * 0.31);
    await pointer(page, "pointerup", 1, x + 700, y);
    await expect
      .poll(
        async () => (await page.locator(".canvas").boundingBox())!.x - box.x,
      )
      .toBeCloseTo(40, 0);
    await expect(area).toHaveCSS("background-color", "rgb(233, 237, 243)");
  } finally {
    await context.close();
  }
});

test("iPad language choice sits beside the field and produces complete role-specific cards", async () => {
  const { page, context } = await tablet();
  try {
    await page.goto(
      `/#room=${"6".repeat(48)}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
    );
    await page.getByLabel("Your lesson view").selectOption("teacher");
    const selector = page.getByLabel("Input language"),
      input = page.getByLabel("Cantonese phrase");
    const left = (await selector.boundingBox())!,
      field = (await input.boundingBox())!;
    expect(left.x + left.width).toBeLessThan(field.x);
    expect(Math.abs(left.y - field.y)).toBeLessThan(8);
    for (const [language, text] of [
      ["english", "Hello"],
      ["jyutping", "nei5 hou2"],
    ]) {
      await selector.selectOption(language);
      await input.fill(text);
      await page
        .getByRole("button", { name: "Add phrase", exact: true })
        .click();
    }
    const cards = page.getByTestId("phrase-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().locator("h2")).toHaveText("你好");
    await expect(cards.first().locator(".card-english")).toHaveValue("Hello");
    await page.getByLabel("Your lesson view").selectOption("learner");
    await expect(cards.first().locator("h2")).toHaveText("nei5 hou2");
    await expect(cards.first().locator(".card-secondary")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("WebKit shows every canvas edge and moves away immediately after a long overscroll", async () => {
  const { page, context } = await tablet();
  try {
    await page.goto(
      `/#room=${"5".repeat(48)}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
    );
    const area = page.locator(".canvas-viewport");
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    for (const side of ["left", "right", "top", "bottom"]) {
      const result = await area.evaluate(async (element, side) => {
        const node = element as HTMLElement,
          canvas = node.querySelector<HTMLElement>(".canvas")!;
        const horizontal = side === "left" || side === "right",
          positive = side === "right" || side === "bottom";
        node.scrollLeft = horizontal
          ? positive
            ? node.scrollWidth
            : canvas.offsetLeft - 40
          : canvas.offsetLeft + 600;
        node.scrollTop = !horizontal
          ? positive
            ? node.scrollHeight
            : canvas.offsetTop - 40
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
              deltaX: horizontal ? delta : 0,
              deltaY: horizontal ? 0 : delta,
            }),
          );
        for (let i = 0; i < 60; i++) wheel((positive ? 1 : -1) * 200);
        await frame();
        await frame();
        const rect = canvas.getBoundingClientRect(),
          bounds = node.getBoundingClientRect();
        const visibleMargin =
          side === "left"
            ? rect.left - bounds.left
            : side === "right"
              ? bounds.right - rect.right
              : side === "top"
                ? rect.top - bounds.top
                : bounds.bottom - rect.bottom;
        const before = horizontal
          ? canvas.getBoundingClientRect().left
          : canvas.getBoundingClientRect().top;
        wheel((positive ? -1 : 1) * 30);
        await frame();
        await frame();
        return {
          visibleMargin,
          travel:
            (before -
              (horizontal
                ? canvas.getBoundingClientRect().left
                : canvas.getBoundingClientRect().top)) *
            (positive ? -1 : 1),
        };
      }, side);
      expect(result.visibleMargin).toBeGreaterThan(40);
      expect(result.travel).toBeGreaterThan(28);
      await page.waitForTimeout(700);
    }
  } finally {
    await context.close();
  }
});

test("iPad navigation paints without resizing the scroll surface and settles without shifting artwork", async () => {
  const { page, context } = await tablet();
  try {
    await page.goto(
      `/#room=${"4".repeat(48)}&relay=${encodeURIComponent(`ws://127.0.0.1:${relay.port}`)}`,
    );
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    const result = await page
      .locator(".canvas-viewport")
      .evaluate(async (node) => {
        const canvas = node.querySelector<HTMLElement>(".canvas")!,
          space = canvas.parentElement!;
        let geometryWrites = 0;
        const observer = new MutationObserver(
          (records) => (geometryWrites += records.length),
        );
        observer.observe(space, {
          attributes: true,
          attributeFilter: ["style"],
        });
        const r = node.getBoundingClientRect(),
          x = r.left + 400,
          y = r.top + 220;
        const event = (type: string, id: number, x: number, y: number) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerType: "touch",
              pointerId: id,
              clientX: x,
              clientY: y,
              buttons: type === "pointerup" ? 0 : 1,
            }),
          );
        event("pointerdown", 1, x, y);
        event("pointerdown", 2, x + 150, y);
        for (let i = 0; i < 30; i++) {
          event("pointermove", 2, x + 150 + i * 4.35, y - i * 1.7);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        // An older device or a held gesture may pause longer than the normal
        // idle timeout without ending the pinch.
        await new Promise((resolve) => setTimeout(resolve, 240));
        const writesDuringNavigation = geometryWrites;
        event("pointerup", 2, x + 276.15, y - 49.3);
        event("pointerup", 1, x, y);
        const before = canvas.getBoundingClientRect();
        await new Promise((resolve) => setTimeout(resolve, 300));
        const after = canvas.getBoundingClientRect();
        observer.disconnect();
        return {
          writesDuringNavigation,
          writesAfter: geometryWrites,
          shift: Math.max(
            Math.abs(before.left - after.left),
            Math.abs(before.top - after.top),
          ),
        };
      });
    expect(result.writesDuringNavigation).toBe(0);
    expect(result.writesAfter).toBeLessThanOrEqual(2);
    expect(result.shift).toBeLessThan(0.02);
  } finally {
    await context.close();
  }
});
