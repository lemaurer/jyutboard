import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("jyutboard:online", "false");
    localStorage.setItem("jyutboard:role", "teacher");
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Close sharing", exact: true })
    .click();
});
test("movement speeds apply immediately, persist on this device and reset without changing lesson contents", async ({
  page,
}) => {
  const pan = () =>
    page.locator(".canvas-viewport").evaluate(async (node) => {
      const canvas = node.querySelector<HTMLElement>(".canvas")!,
        before = canvas.getBoundingClientRect().left;
      node.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: 40,
        }),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return before - canvas.getBoundingClientRect().left;
    });
  expect(await pan()).toBeCloseTo(40, 0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Zoom speed", { exact: true })).toHaveValue(
    "1.5",
  );
  await page.getByLabel("Pan speed", { exact: true }).press("End");
  await page.getByLabel("Zoom speed", { exact: true }).press("End");
  await page.getByLabel("Close settings", { exact: true }).click();
  expect(await pan()).toBeCloseTo(120, 0);
  await page.reload();
  await page
    .getByRole("button", { name: "Close sharing", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Pan speed", { exact: true })).toHaveValue("3");
  await expect(page.getByLabel("Zoom speed", { exact: true })).toHaveValue("3");
  await page.getByRole("button", { name: "Reset movement speeds" }).click();
  await expect(page.getByLabel("Pan speed", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Zoom speed", { exact: true })).toHaveValue(
    "1.5",
  );
});
test("rapid desktop zoom-out keeps artwork visible without a giant promoted canvas texture", async ({
  page,
}) => {
  await page.getByLabel("Cantonese phrase").fill("我想飲水");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  let giantPaintLayers = 0;
  cdp.on("LayerTree.layerTreeDidChange", (event) => {
    giantPaintLayers = Math.max(
      giantPaintLayers,
      (event.layers || []).filter(
        (layer: any) =>
          layer.drawsContent && (layer.width > 2500 || layer.height > 2000),
      ).length,
    );
  });
  await cdp.send("LayerTree.enable");
  const result = await page
    .locator(".canvas-viewport")
    .evaluate(async (node) => {
      const canvas = node.querySelector<HTMLElement>(".canvas")!,
        card = canvas.querySelector<HTMLElement>(".phrase-card")!;
      const rect = card.getBoundingClientRect(),
        anchor = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      let missing = 0;
      for (let i = 0; i < 36; i++) {
        node.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            deltaY: 2,
            clientX: anchor.x,
            clientY: anchor.y,
          }),
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const box = card.getBoundingClientRect();
        if (
          !document
            .elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2)
            .includes(card)
        )
          missing++;
      }
      return {
        missing,
        scale: canvas.getBoundingClientRect().width / 5600,
        transform: canvas.style.transform,
        willChange: canvas.style.willChange,
        dotSize:
          parseFloat(canvas.style.getPropertyValue("--grid-dot-radius")) *
          (canvas.getBoundingClientRect().width / 5600),
      };
    });
  expect(result.missing).toBe(0);
  expect(result.scale).toBeLessThan(0.6);
  expect(result.transform).not.toContain("translate3d");
  expect(result.willChange).not.toBe("transform");
  expect(result.dotSize).toBeCloseTo(0.8, 4);
  expect(giantPaintLayers).toBe(0);
  await page.screenshot({ path: "test-results/desktop-zoom-out.png" });
});
test("sentence variations show a selectable source word and preview the exact new cards", async ({
  page,
}) => {
  await page.getByLabel("Cantonese phrase").fill("我想飲水");
  await page.getByRole("button", { name: "Add phrase", exact: true }).click();
  await page
    .getByRole("button", { name: "Sentence variations", exact: true })
    .click();
  await page
    .getByLabel("Choose the part to change")
    .getByRole("button", { name: "飲水", exact: true })
    .click();
  await page.getByLabel("Variation substitutions").fill("飲奶茶\n飲咖啡");
  await expect(page.getByLabel("Sentence variation preview")).toContainText(
    "我想飲奶茶",
  );
  await expect(page.getByLabel("Sentence variation preview")).toContainText(
    "我想飲咖啡",
  );
  await page
    .getByRole("button", { name: "Create variations", exact: true })
    .click();
  await expect(page.getByTestId("phrase-card")).toHaveCount(3);
  await expect(
    page.getByTestId("phrase-card").filter({ hasText: "我想飲奶茶" }),
  ).toHaveCount(1);
});
