import {
  test,
  expect,
  webkit,
  type Browser,
  type Page,
} from "@playwright/test";
import { startRelay } from "../electron/relay-server";
import { publishLesson } from "../server/lesson-publish";
import { newRoom } from "../src/model";
let relay: Awaited<ReturnType<typeof startRelay>>;
test.setTimeout(90000);
test.beforeAll(async () => {
  relay = await startRelay(0, "127.0.0.1");
});
test.afterAll(async () => {
  await relay.close();
});
async function fixture(
  browser: Browser,
  role = "teacher",
  room = newRoom(),
  ipad = false,
) {
  const context = await browser.newContext({
    viewport: ipad
      ? { width: 1024, height: 768 }
      : { width: 1440, height: 960 },
    hasTouch: ipad,
    isMobile: ipad,
  });
  await context.addInitScript(
    ({ role, room, port, ipad }) => {
      const relay = `ws://127.0.0.1:${port}`;
      localStorage.setItem("jyutboard:role", role);
      localStorage.setItem(
        "jyutboard:sessions:v1",
        JSON.stringify([
          { id: room, title: "Lesson test", created: Date.now(), relay },
        ]),
      );
      localStorage.setItem(
        "jyutboard:web-pair:v1",
        JSON.stringify({ room, relay, host: false }),
      );
      HTMLElement.prototype.setPointerCapture = function () {};
      (window as any).desktop = {
        web: ipad,
        pair: async () => ({ room, relay, host: false }),
        vocabulary: async () => ({
          known: ["我"],
          queued: ["飲水"],
          at: Date.now(),
        }),
        translate: async () => "I want to drink water.",
      };
    },
    { role, room, port: relay.port, ipad },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  await page.goto("/");
  await expect(page.getByLabel("Lesson tools")).toBeVisible();
  return { page, context, room };
}
async function menu(page: Page) {
  const details = page.locator(".lesson-tools-menu");
  if ((await details.getAttribute("open")) === null)
    await page.getByLabel("Lesson tools", { exact: true }).click();
}
async function closeMenu(page: Page) {
  const details = page.locator(".lesson-tools-menu");
  if ((await details.getAttribute("open")) !== null)
    await page.getByLabel("Lesson tools", { exact: true }).click();
}
async function add(page: Page, text: string) {
  await page.getByLabel("Cantonese phrase").fill(text);
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
}
test("toolbar tidies nearby spacing with shared sliding, preserves the camera and undoes exactly", async ({
  browser,
}) => {
  const teacher = await fixture(browser),
    learner = await fixture(browser, "learner", teacher.room);
  try {
    await publishLesson(
      {
        version: 1,
        title: "Spacing test",
        layout: { mode: "manual" },
        objects: [
          {
            id: "a",
            kind: "phrase",
            chinese: "你好",
            definition: "Hello",
            x: 2600,
            y: 1600,
          },
          {
            id: "b",
            kind: "phrase",
            chinese: "我想飲水",
            definition: "I want water",
            x: 2680,
            y: 1600,
          },
        ],
        connectors: [
          { id: "edge", from: "a", to: "b", color: "#3159e8", width: 2 },
        ],
      },
      teacher.room,
      `ws://127.0.0.1:${relay.port}`,
    );
    await teacher.page
      .locator(".canvas-viewport")
      .click({ position: { x: 25, y: 25 } });
    const cards = teacher.page.getByTestId("phrase-card");
    await expect(learner.page.getByTestId("phrase-card")).toHaveCount(2);
    const positions = () =>
      cards.evaluateAll((nodes) =>
        nodes.map((node) => ({
          x: parseFloat((node as HTMLElement).style.left),
          y: parseFloat((node as HTMLElement).style.top),
        })),
      );
    const before = await positions();
    const edge = teacher.page.locator("[data-connector-id] polyline").first();
    const arrowBefore = await edge.getAttribute("points");
    const learnerEdge = learner.page
      .locator("[data-connector-id] polyline")
      .first();
    const learnerArrowBefore = await learnerEdge.getAttribute("points");
    const camera = await teacher.page.locator(".canvas").getAttribute("style");
    for (const page of [teacher.page, learner.page])
      await page.evaluate(() => {
        (window as any).layoutSeen = false;
        (window as any).arrowFrames = 0;
        const observer = new MutationObserver((records) => {
          (window as any).arrowFrames += records.filter(
            (record) => record.attributeName === "points",
          ).length;
          if (
            records.some(
              (record) => (record.target as HTMLElement).dataset?.layoutMoving,
            )
          )
            (window as any).layoutSeen = true;
        });
        observer.observe(document.body, {
          subtree: true,
          attributes: true,
          attributeFilter: ["data-layout-moving", "points"],
        });
      });
    // The primary action is reachable without opening the secondary menu.
    await expect(
      teacher.page.getByRole("button", {
        name: "Private teaching notes",
        exact: true,
      }),
    ).toBeVisible();
    await teacher.page
      .getByRole("button", { name: "Arrange canvas", exact: true })
      .click();
    await expect
      .poll(() => teacher.page.evaluate(() => (window as any).layoutSeen))
      .toBe(true);
    await expect
      .poll(() => learner.page.evaluate(() => (window as any).layoutSeen))
      .toBe(true);
    await expect(teacher.page.locator("[data-layout-moving]")).toHaveCount(0);
    expect(
      await teacher.page.evaluate(() => (window as any).arrowFrames),
    ).toBeGreaterThan(3);
    expect(await edge.getAttribute("points")).not.toBe(arrowBefore);
    await expect(learner.page.locator("[data-layout-moving]")).toHaveCount(0);
    expect(await learnerEdge.getAttribute("points")).not.toBe(
      learnerArrowBefore,
    );
    const learnerBoxes = await learner.page
      .getByTestId("phrase-card")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          x: parseFloat((node as HTMLElement).style.left),
          width: (node as HTMLElement).offsetWidth,
        })),
      );
    expect(
      learnerBoxes[1].x - learnerBoxes[0].x - learnerBoxes[0].width,
    ).toBeGreaterThanOrEqual(31);
    expect(await teacher.page.locator(".canvas").getAttribute("style")).toBe(
      camera,
    );
    const after = await positions();
    expect(after).not.toEqual(before);
    after.forEach((position, index) =>
      expect(
        Math.hypot(position.x - before[index].x, position.y - before[index].y),
      ).toBeLessThan(500),
    );
    await teacher.page
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect.poll(positions).toEqual(before);
    await teacher.page.emulateMedia({ reducedMotion: "reduce" });
    await teacher.page.evaluate(() => {
      (window as any).layoutSeen = false;
    });
    await teacher.page
      .getByRole("button", { name: "Arrange canvas", exact: true })
      .click();
    await expect.poll(positions).not.toEqual(before);
    expect(await teacher.page.evaluate(() => (window as any).layoutSeen)).toBe(
      false,
    );
    await teacher.page.screenshot({
      path: "test-results/lesson-toolbar-spacing.png",
    });
  } finally {
    await teacher.context.close();
    await learner.context.close();
  }
});
test("live ink and selected drawing drags reach the partner before release, and ink-only auto-layout is available", async ({
  browser,
}) => {
  const teacher = await fixture(browser),
    learner = await fixture(browser, "learner", teacher.room);
  try {
    await teacher.page
      .getByRole("button", { name: "Draw", exact: true })
      .click();
    await teacher.page.mouse.move(450, 350);
    await teacher.page.mouse.down();
    await teacher.page.mouse.move(520, 390, { steps: 8 });
    await expect(learner.page.getByTestId("live-ink")).toHaveCount(1);
    await teacher.page.mouse.up();
    await expect(learner.page.getByTestId("drawing")).toHaveCount(1);
    await teacher.page
      .getByRole("button", { name: "Select and move", exact: true })
      .click();
    const hit = teacher.page.getByTestId("drawing-hit"),
      box = (await hit.boundingBox())!;
    await teacher.page.mouse.move(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    await teacher.page.mouse.down();
    await teacher.page.mouse.move(
      box.x + box.width / 2 + 100,
      box.y + box.height / 2 + 50,
      { steps: 10 },
    );
    await expect(
      learner.page.locator('[data-stroke-id][data-remote-moving="true"]'),
    ).toHaveCount(1);
    await teacher.page.mouse.up();
    await expect(
      learner.page.locator('[data-remote-moving="true"]'),
    ).toHaveCount(0);
    await menu(teacher.page);
    await expect(
      teacher.page.getByRole("button", {
        name: "Arrange selected",
        exact: true,
      }),
    ).toBeEnabled();
    await teacher.page
      .getByRole("button", { name: "Arrange selected", exact: true })
      .click();
    await expect(teacher.page.getByTestId("drawing")).toHaveCount(1);
  } finally {
    await teacher.context.close();
    await learner.context.close();
  }
});
test("teacher private notes, one-by-one reveals and row controls sync to a learner without exposing private text", async ({
  browser,
}) => {
  const teacher = await fixture(browser),
    learner = await fixture(browser, "learner", teacher.room);
  try {
    await add(teacher.page, "我想飲水");
    await expect(learner.page.getByTestId("phrase-card")).toHaveCount(1);
    await menu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Private teaching notes", exact: true })
      .click();
    await teacher.page
      .getByLabel("Private teaching note", { exact: true })
      .fill("SECRET teaching reminder");
    await expect(learner.page.locator("body")).not.toContainText(
      "SECRET teaching reminder",
    );
    await teacher.page.getByLabel("Close lesson panel").click();
    await teacher.page
      .getByRole("button", { name: "Hide selected from Leif", exact: true })
      .click();
    await expect(learner.page.getByTestId("phrase-card")).toHaveCount(0);
    await expect(teacher.page.getByTestId("phrase-card")).toHaveCSS(
      "opacity",
      "0.5",
    );
    await teacher.page
      .getByRole("button", { name: "Reveal next", exact: true })
      .click();
    await expect(learner.page.getByTestId("phrase-card")).toHaveCount(1);
    await closeMenu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Add conversation", exact: true })
      .click();
    const conversation = teacher.page.getByTestId("conversation-card");
    await menu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Prepare one-by-one reveal", exact: true })
      .click();
    await expect(learner.page.locator(".dialogue-turn")).toHaveCount(0);
    await teacher.page
      .getByRole("button", { name: "Reveal next", exact: true })
      .click();
    await teacher.page
      .getByRole("button", { name: "Reveal next", exact: true })
      .click();
    await expect(learner.page.locator(".dialogue-turn")).toHaveCount(1);
    await teacher.page
      .getByRole("button", { name: "Reveal next", exact: true })
      .click();
    await expect(learner.page.locator(".dialogue-turn")).toHaveCount(2);
    await closeMenu(teacher.page);
    await conversation.locator(".bubble-menu summary").first().click();
    await conversation
      .getByRole("button", { name: "Hide turn from Leif", exact: true })
      .first()
      .click();
    await expect(learner.page.locator(".dialogue-turn")).toHaveCount(1);
    await teacher.page.reload();
    await expect(teacher.page.getByTestId("phrase-card")).toHaveCount(1);
    await teacher.page
      .getByTestId("phrase-card")
      .click({ position: { x: 6, y: 6 } });
    await menu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Private teaching notes", exact: true })
      .click();
    await expect(
      teacher.page.getByLabel("Private teaching note", { exact: true }),
    ).toHaveValue("SECRET teaching reminder");
  } finally {
    await teacher.context.close();
    await learner.context.close();
  }
});
test("selected cards convert, undo, generate structure-preserving variants and live dragging paints before release", async ({
  browser,
}) => {
  const teacher = await fixture(browser),
    learner = await fixture(browser, "learner", teacher.room);
  try {
    await add(teacher.page, "我想飲水");
    await add(teacher.page, "你好");
    await menu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Arrange canvas", exact: true })
      .click();
    await closeMenu(teacher.page);
    const cards = teacher.page.getByTestId("phrase-card");
    await cards.first().click({ position: { x: 6, y: 6 } });
    await cards.nth(1).click({ modifiers: ["Shift"] });
    await menu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Turn into table", exact: true })
      .click();
    await expect(cards).toHaveCount(0);
    await expect(
      teacher.page.getByTestId("table-card").locator("tbody tr"),
    ).toHaveCount(2);
    await expect(
      learner.page.getByTestId("table-card").locator("tbody tr"),
    ).toHaveCount(2);
    await closeMenu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(cards).toHaveCount(2);
    await cards.first().click({ position: { x: 6, y: 6 } });
    await menu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Sentence variations", exact: true })
      .click();
    await teacher.page.getByLabel("Variation slot").fill("水");
    await teacher.page.getByLabel("Variation substitutions").fill("奶茶\n咖啡");
    await teacher.page
      .getByRole("button", { name: "Create variations", exact: true })
      .click();
    await expect(cards).toHaveCount(4);
    await closeMenu(teacher.page);
    await teacher.page
      .locator(".canvas-viewport")
      .click({ position: { x: 25, y: 25 } });
    const box = await cards.first().boundingBox();
    expect(box).toBeTruthy();
    await teacher.page.mouse.move(box!.x + 25, box!.y + 18);
    await teacher.page.mouse.down();
    await teacher.page.mouse.move(box!.x + 145, box!.y + 78, { steps: 10 });
    await expect(
      learner.page.locator('[data-remote-moving="true"]'),
    ).toHaveCount(1);
    await teacher.page.mouse.up();
    await expect(
      learner.page.locator('[data-remote-moving="true"]'),
    ).toHaveCount(0);
    await menu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Arrange canvas", exact: true })
      .click();
    await closeMenu(teacher.page);
    const positions = await cards.evaluateAll((nodes) =>
      nodes.map((node) => ({
        x: parseFloat((node as HTMLElement).style.left),
        y: parseFloat((node as HTMLElement).style.top),
      })),
    );
    expect(
      new Set(positions.map((position) => `${position.x}:${position.y}`)).size,
    ).toBe(4);
  } finally {
    await teacher.context.close();
    await learner.context.close();
  }
});
test("Safari iPad imports a complete AI lesson with local notes and can reveal table rows; protocol publication reaches the canvas", async () => {
  const safari = await webkit.launch();
  const teacher = await fixture(safari, "teacher", newRoom(), true);
  try {
    const input = {
      version: 1,
      title: "At the cafe",
      layout: { mode: "manual" },
      objects: [
        {
          id: "phrases",
          kind: "table",
          x: 2500,
          y: 1500,
          rows: [
            { id: "r1", chinese: "你好", definition: "Hello", concealed: true },
            {
              id: "r2",
              chinese: "我想飲水",
              definition: "I want water",
              concealed: true,
            },
          ],
        },
      ],
      teacherNotes: [{ objectId: "phrases", text: "Ask for a drink" }],
    };
    await menu(teacher.page);
    await teacher.page
      .getByLabel("Import AI lesson", { exact: true })
      .setInputFiles({
        name: "lesson.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(input)),
      });
    await expect(
      teacher.page.getByTestId("table-card").locator("tbody tr"),
    ).toHaveCount(2);
    await closeMenu(teacher.page);
    await teacher.page.getByLabel("Your lesson view").selectOption("learner");
    await expect(
      teacher.page.getByTestId("table-card").locator("tbody tr"),
    ).toHaveCount(0);
    await teacher.page.getByLabel("Your lesson view").selectOption("teacher");
    await menu(teacher.page);
    await teacher.page
      .getByRole("button", { name: "Reveal next", exact: true })
      .click();
    await closeMenu(teacher.page);
    await teacher.page.getByLabel("Your lesson view").selectOption("learner");
    await expect(
      teacher.page.getByTestId("table-card").locator("tbody tr"),
    ).toHaveCount(1);
    await publishLesson(
      {
        version: 1,
        title: "Added via MCP",
        objects: [
          {
            id: "mcp",
            kind: "phrase",
            chinese: "早晨",
            definition: "Good morning",
            x: 2600,
            y: 1600,
          },
        ],
      },
      teacher.room,
      `ws://127.0.0.1:${relay.port}`,
    );
    await expect(
      teacher.page.getByTestId("phrase-card").locator("h2"),
    ).toContainText("zou2");
    await teacher.page.screenshot({
      path: "test-results/lesson-tools-ipad.png",
    });
  } finally {
    await teacher.context.close();
    await safari.close();
  }
});
