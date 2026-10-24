import { test, expect, webkit, type Browser } from "@playwright/test";
import { startRelay } from "../electron/relay-server";
import { publishLesson } from "../server/lesson-publish";
import { newRoom } from "../src/model";
let relay: Awaited<ReturnType<typeof startRelay>>;
test.beforeAll(async () => {
  relay = await startRelay(0, "127.0.0.1");
});
test.afterAll(async () => {
  await relay.close();
});
async function fixture(browser: Browser, role = "teacher", room = newRoom()) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(
    ({ role, room, port }) => {
      localStorage.setItem("jyutboard:role", role);
      const relay = `ws://127.0.0.1:${port}`;
      localStorage.setItem(
        "jyutboard:sessions:v1",
        JSON.stringify([
          { id: room, title: "Conversation", created: Date.now(), relay },
        ]),
      );
      (window as any).desktop = {
        pair: async () => null,
        vocabulary: async () => ({ known: ["我"], queued: [], at: Date.now() }),
        translate: async () => {
          throw Error("Offline fixture");
        },
      };
    },
    { role, room, port: relay.port },
  );
  const page = await context.newPage();
  await page.goto("/");
  return { page, context, room };
}
test("Jyutping live preview creates the displayed canonical card and ignores a stale remote preview", async ({
  browser,
}) => {
  const { page, context } = await fixture(browser);
  try {
    await page.getByLabel("Input language").selectOption("jyutping");
    await page.getByLabel("Cantonese phrase").fill("ngo5soeng2jam2seoi2");
    await expect(page.getByLabel("Phrase preview")).toContainText("我想飲水");
    await page.getByRole("button", { name: "Add phrase", exact: true }).click();
    await expect(page.getByTestId("phrase-card")).toContainText("我想飲水");
    await page.evaluate(() => {
      (window as any).__waiting = [];
      (window as any).desktop.analyze = () =>
        new Promise((resolve) => (window as any).__waiting.push(resolve));
    });
    await page.getByLabel("Input language").selectOption("english");
    await page
      .getByLabel("Cantonese phrase")
      .fill("Please bring the purple umbrella");
    await expect
      .poll(() => page.evaluate(() => (window as any).__waiting.length))
      .toBe(1);
    await page.getByLabel("Input language").selectOption("jyutping");
    await page.getByLabel("Cantonese phrase").fill("nei5hou2");
    await expect(page.getByLabel("Phrase preview")).toContainText("你好");
    await page.evaluate(() =>
      (window as any).__waiting[0]({
        chinese: "雨傘",
        jyutping: "jyu5 saan3",
        definition: "Umbrella",
        words: [],
      }),
    );
    await expect(page.getByLabel("Phrase preview")).toContainText("你好");
    await expect(page.getByLabel("Phrase preview")).not.toContainText(
      "Umbrella",
    );
  } finally {
    await context.close();
  }
});
test("split bubbles stay with their speaker, expressions synchronize, and next speaker has a one-turn override", async ({
  browser,
}) => {
  const teacher = await fixture(browser),
    learner = await fixture(browser, "learner", teacher.room);
  try {
    await publishLesson(
      {
        version: 1,
        title: "Speech",
        objects: [
          {
            id: "dialogue",
            kind: "conversation",
            x: 2550,
            y: 1550,
            width: 520,
            rows: [
              {
                id: "leif",
                persona: "Leif",
                avatar: "leif",
                chinese: "你好。",
                definition: "Hello.",
              },
              {
                id: "barista",
                persona: "Barista",
                avatar: "amira",
                chinese: "你好！我想飲水。",
                jyutping: "nei5 hou2! ngo5 soeng2 jam2 seoi2.",
                definition: "Hello! I want water.",
              },
            ],
          },
        ],
      },
      teacher.room,
      `ws://127.0.0.1:${relay.port}`,
    );
    const conversation = teacher.page.getByTestId("conversation-card"),
      other = learner.page.getByTestId("conversation-card");
    await expect(conversation.locator(".dialogue-turn")).toHaveCount(2);
    await conversation.getByLabel("Choose avatar").nth(1).click();
    await conversation
      .getByRole("button", { name: "Expression: surprised", exact: true })
      .click();
    await expect(
      other.getByRole("img", {
        name: "Barista avatar · surprised",
        exact: true,
      }),
    ).toBeVisible();
    await conversation.getByLabel("Choose avatar").nth(1).click();
    await conversation.getByLabel("Bubble options").nth(1).click();
    await conversation
      .getByRole("button", { name: "Split into sentences", exact: true })
      .click();
    await expect(conversation.locator(".dialogue-turn")).toHaveCount(3);
    await expect(other.locator(".dialogue-turn")).toHaveCount(3);
    await expect(conversation.locator(".dialogue-turn").nth(1)).toHaveClass(
      /turn-right/,
    );
    await expect(conversation.locator(".dialogue-turn").nth(2)).toHaveClass(
      /turn-right.*same-speaker/,
    );
    await expect(other.getByLabel("Dialogue Jyutping").nth(2)).toHaveText(
      "ngo5 soeng2 jam2 seoi2.",
    );
    await expect(conversation.getByLabel("Next speaker")).toContainText(
      "Auto · Leif",
    );
    await teacher.page
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(conversation.locator(".dialogue-turn")).toHaveCount(2);
    await expect(other.locator(".dialogue-turn")).toHaveCount(2);
    await conversation.getByLabel("Next speaker").selectOption("Barista");
    await conversation
      .getByRole("button", { name: "Add turn", exact: true })
      .click();
    await expect(
      conversation.getByRole("img", {
        name: "Barista avatar · neutral",
        exact: true,
      }),
    ).toBeVisible();
    await expect(conversation.getByLabel("Next speaker")).toHaveValue("");
    await expect(conversation.locator(".dialogue-turn").last()).toHaveClass(
      /turn-right.*same-speaker/,
    );
  } finally {
    await teacher.context.close();
    await learner.context.close();
  }
});
test("multi-sentence phrase splitting syncs as clean separate cards and undoes in one step", async ({
  browser,
}) => {
  const teacher = await fixture(browser),
    learner = await fixture(browser, "learner", teacher.room);
  try {
    await teacher.page.getByLabel("Cantonese phrase").fill("你好。多謝。");
    await teacher.page
      .getByRole("button", { name: "Add phrase", exact: true })
      .click();
    await teacher.page.getByLabel("Lesson tools", { exact: true }).click();
    await teacher.page
      .getByRole("button", { name: "Split into sentences", exact: true })
      .click();
    await expect(learner.page.getByTestId("phrase-card")).toHaveCount(2);
    const boxes = await teacher.page
      .getByTestId("phrase-card")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          x: parseFloat((n as HTMLElement).style.left),
          y: parseFloat((n as HTMLElement).style.top),
          h: n.getBoundingClientRect().height,
        })),
      );
    expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].h);
    await teacher.page
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(learner.page.getByTestId("phrase-card")).toHaveCount(1);
    await expect(teacher.page.getByTestId("phrase-card")).toContainText(
      "你好。多謝。",
    );
  } finally {
    await teacher.context.close();
    await learner.context.close();
  }
});
test("lesson-service check explains missing token without deleting lesson input", async ({
  browser,
}) => {
  const { page, context } = await fixture(browser);
  try {
    await page.evaluate(
      () =>
        ((window as any).desktop.vocabulary = async () => {
          throw Error("Missing Bearer Token");
        }),
    );
    await page.getByLabel("Cantonese phrase").fill("保留文字");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Check lesson services", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toContainText(
      "external request token",
    );
    await page.getByLabel("Close settings").click();
    await expect(page.getByLabel("Cantonese phrase")).toHaveValue("保留文字");
  } finally {
    await context.close();
  }
});
