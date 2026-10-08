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
      .getByLabel("Private teaching note")
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
    await expect(teacher.page.getByLabel("Private teaching note")).toHaveValue(
      "SECRET teaching reminder",
    );
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
