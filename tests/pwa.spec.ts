import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
let server: Server, url: string, workerOverride: string | undefined;
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      if (req.url?.startsWith("/api/")) {
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ error: "Offline fixture" }));
        return;
      }
      const path = new URL(req.url!, "http://localhost").pathname;
      const target = resolve(
        "dist",
        "." + (path === "/" ? "/index.html" : path),
      );
      if (!target.startsWith(resolve("dist") + "/"))
        throw Error("Invalid path");
      res.writeHead(200, {
        "Content-Type": mime[extname(target)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(
        path === "/sw.js" && workerOverride
          ? workerOverride
          : await readFile(target),
      );
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
});
test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});
test("installed web app reopens local lessons offline and keeps capabilities/API responses out of its cache", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(
      `${url}/#room=${"e".repeat(48)}&relay=wss%3A%2F%2Foffline.example.test`,
    );
    await page.getByLabel("Your lesson view").selectOption("teacher");
    await page.getByLabel("Cantonese phrase").fill("你好");
    await page.getByRole("button", { name: "Add phrase", exact: true }).click();
    await expect(page.getByTestId("phrase-card").locator("h2")).toHaveText(
      "你好",
    );
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await expect(page.getByTestId("phrase-card").locator("h2")).toHaveText(
      "你好",
    );
    expect(await page.evaluate(() => location.hash)).toBe("");
    const manifest = await (
      await page.request.get(`${url}/manifest.webmanifest`)
    ).json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toHaveLength(2);
    const keys = await page.evaluate(async () => {
      const cache = await caches.open((await caches.keys())[0]);
      return (await cache.keys()).map((r) => r.url);
    });
    expect(
      keys.some((key) => key.includes("/api/") || key.includes("room=")),
    ).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("phrase-card").locator("h2")).toHaveText(
      "你好",
    );
    await expect(page.locator(".tablet-join")).toBeVisible();
  } finally {
    await context.close();
  }
});
test("new PWA versions wait until the open lesson is closed, then update automatically", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext();
  let page = await context.newPage();
  try {
    await page.goto(url);
    await page.getByRole("button", { name: "Close sharing" }).click();
    await page.getByLabel("Cantonese phrase").fill("飲水");
    await page.getByRole("button", { name: "Add phrase", exact: true }).click();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.getByRole("button", { name: "Close sharing" }).click();
    const oldWorker = await readFile("dist/sw.js", "utf8");
    workerOverride = oldWorker.replace(
      /jyutboard-[a-f0-9]+/,
      "jyutboard-update-fixture",
    );
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration!.update();
    });
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.waiting,
        ),
      )
      .toBe(true);
    await expect(page.getByTestId("phrase-card")).toContainText("jam2");
    await page.close();
    page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Close sharing" }).click();
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await caches.keys()).includes("jyutboard-update-fixture"),
        ),
      )
      .toBe(true);
    await expect(page.getByTestId("phrase-card")).toContainText("jam2");
  } finally {
    workerOverride = undefined;
    await context.close();
  }
});

test("Home Screen installation restores the room and Natasha view from Safari's copied cookies without copying local storage", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const origin = "https://jyutboard.install.test",
    room = "f".repeat(48);
  const browserTab = await browser.newContext(),
    installed = await browser.newContext();
  async function proxy(context: typeof browserTab) {
    await context.route(origin + "/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/board") {
        const body = route.request().postDataJSON();
        expect(body.room).toBe(room);
        expect(route.request().headers().authorization).toBeUndefined();
        await route.fulfill({
          json:
            body.action === "resolve"
              ? { relay: "wss://room.install.test" }
              : { known: [], queued: [], at: Date.now() },
        });
        return;
      }
      const response = await route.fetch({ url: url + path });
      await route.fulfill({ response });
    });
  }
  try {
    await proxy(browserTab);
    const tab = await browserTab.newPage();
    await tab.goto(
      `${origin}/#room=${room}&relay=wss%3A%2F%2Froom.install.test`,
    );
    await tab.getByLabel("Your lesson view").selectOption("teacher");
    const copiedCookies = await browserTab.cookies();
    expect(
      copiedCookies.find((cookie) => cookie.name === "__Host-jyutboard_pair"),
    ).toMatchObject({
      value: room,
      secure: true,
      sameSite: "Strict",
      path: "/",
    });
    expect(
      copiedCookies.find((cookie) => cookie.name === "__Host-jyutboard_role")
        ?.value,
    ).toBe("teacher");
    // Safari copies cookies, not the browser's localStorage or IndexedDB.
    await installed.addCookies(copiedCookies);
    await proxy(installed);
    const home = await installed.newPage();
    await home.goto(origin);
    await expect(home.getByLabel("Your lesson view")).toHaveValue("teacher");
    await expect(home.locator(".tablet-join")).toHaveText("Join Leif");
    await expect(
      home.getByRole("dialog", { name: "Share lesson" }),
    ).toHaveCount(0);
    const pair = await home.evaluate(() =>
      window.desktop!.pair({ action: "get" }),
    );
    expect(pair?.room).toBe(room);
    await home.evaluate(() => window.desktop!.pair({ action: "forget" }));
    expect(
      (await installed.cookies()).some(
        (cookie) => cookie.name === "__Host-jyutboard_pair",
      ),
    ).toBe(false);
  } finally {
    await browserTab.close();
    await installed.close();
  }
});
