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
  await page
    .locator(".canvas")
    .dispatchEvent(type, {
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
    await expect(
      page.getByRole("button", { name: "Join Leif", exact: true }),
    ).toBeVisible();
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
    await expect(
      page.getByRole("button", { name: "Join Natasha", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Share / Sync" }).click();
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
      .evaluate((el) => el.scrollLeft);
    await pointer(page, "pointerdown", 3, x, y);
    await pointer(page, "pointermove", 3, x + 60, y + 30);
    await pointer(page, "pointerup", 3, x + 60, y + 30);
    await expect
      .poll(() =>
        page.locator(".canvas-viewport").evaluate((el) => el.scrollLeft),
      )
      .toBeLessThan(before);
    await expect(page.getByTestId("smooth-ink")).toHaveCount(1);
    const initialZoom = await page
      .locator(".canvas")
      .evaluate((el) => getComputedStyle(el).transform);
    await page
      .getByRole("button", { name: "Select and move", exact: true })
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
