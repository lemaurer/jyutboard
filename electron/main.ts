import {
  app,
  net,
  BrowserWindow,
  ipcMain,
  safeStorage,
  session,
  systemPreferences,
  dialog,
} from "electron";
import { join } from "node:path";
import { readFile, writeFile, rename } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { startRelay } from "./relay-server";
import { z } from "zod";
let window: BrowserWindow | null = null;
let relay: Awaited<ReturnType<typeof startRelay>> | undefined;
let tunnel: ChildProcessWithoutNullStreams | undefined;
let remoteAddress = "";
let secrets: Record<string, string> = {};
const settingsSchema = z
  .object({
    queueUrl: z.string().url().max(500),
    queueToken: z.string().max(1000),
    googleKey: z.string().max(1000),
  })
  .strict();
async function loadSecrets() {
  try {
    const raw = await readFile(join(app.getPath("userData"), "settings.enc"));
    secrets = JSON.parse(safeStorage.decryptString(raw));
  } catch {
    secrets = {};
  }
}
function trusted(event: Electron.IpcMainInvokeEvent) {
  if (
    event.sender !== window?.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw Error("Untrusted sender");
}
app.whenReady().then(async () => {
  app.configureHostResolver({
    enableBuiltInResolver: true,
    secureDnsMode: "automatic",
    secureDnsServers: ["https://cloudflare-dns.com/dns-query"],
  });
  await loadSecrets();
  ipcMain.handle("settings:get", (event) => {
    trusted(event);
    return {
      queueUrl:
        secrets.queueUrl || "https://jyutdeck.vercel.app/api/v1/requests",
      hasQueueToken: Boolean(secrets.queueToken),
      hasGoogleKey: Boolean(secrets.googleKey),
    };
  });
  ipcMain.handle("settings:save", async (event, input) => {
    trusted(event);
    const value = settingsSchema.parse(input);
    const url = new URL(value.queueUrl);
    if (url.protocol !== "https:")
      throw Error("Queue endpoint must use HTTPS.");
    if (!safeStorage.isEncryptionAvailable())
      throw Error(
        "OS credential encryption is unavailable. Settings were not saved.",
      );
    secrets = {
      queueUrl: value.queueUrl,
      queueToken: value.queueToken || secrets.queueToken || "",
      googleKey: value.googleKey || secrets.googleKey || "",
    };
    await writeFile(
      join(app.getPath("userData"), "settings.enc"),
      safeStorage.encryptString(JSON.stringify(secrets)),
      { mode: 0o600 },
    );
    return true;
  });
  ipcMain.handle("settings:clear", async (event) => {
    trusted(event);
    secrets = {};
    await writeFile(join(app.getPath("userData"), "settings.enc"), "");
    return true;
  });
  ipcMain.handle("relay:start", async (event) => {
    trusted(event);
    relay ??= await startRelay();
    const ips = Object.values(networkInterfaces())
      .flat()
      .filter((x) => x?.family === "IPv4" && !x.internal)
      .map((x) => `ws://${x!.address}:${relay!.port}`);
    return { local: `ws://127.0.0.1:${relay.port}`, addresses: ips };
  });
  ipcMain.handle("remote:start", async (event) => {
    trusted(event);
    if (remoteAddress && tunnel?.exitCode === null)
      return { url: remoteAddress };
    relay ??= await startRelay();
    const binaryName =
      process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
    const bundled = join(
      app.isPackaged ? process.resourcesPath : app.getAppPath(),
      app.isPackaged ? "cloudflared" : ".vendor/cloudflared",
      binaryName,
    );
    if (!existsSync(bundled))
      throw Error(
        "Remote sharing component is missing. Install the latest JyutBoard build.",
      );
    const child = spawn(
      bundled,
      [
        "tunnel",
        "--url",
        `http://127.0.0.1:${relay.port}`,
        "--protocol",
        "http2",
        "--no-autoupdate",
      ],
      { windowsHide: true },
    );
    tunnel = child;
    let output = "";
    let address = "";
    const scan = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-20000);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) address = match[0];
    };
    child.stdout.on("data", scan);
    child.stderr.on("data", scan);
    child.on("exit", () => {
      if (tunnel === child) {
        tunnel = undefined;
        remoteAddress = "";
      }
    });
    child.on("error", () => {});
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.killed) {
        tunnel = undefined;
        throw Error("Remote tunnel stopped before connecting.");
      }
      if (address) {
        try {
          const response = await net.fetch(`${address}/health`, {
            signal: AbortSignal.timeout(2200),
          });
          if (response.ok) {
            remoteAddress = address.replace("https://", "wss://");
            return { url: remoteAddress };
          }
        } catch {}
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    child.kill();
    tunnel = undefined;
    throw Error(
      "Remote tunnel did not connect. Check internet access and try again.",
    );
  });
  ipcMain.handle("remote:stop", (event) => {
    trusted(event);
    tunnel?.kill();
    tunnel = undefined;
    remoteAddress = "";
    return true;
  });
  ipcMain.handle("translate", async (event, input) => {
    trusted(event);
    const chinese = z.string().min(1).max(2000).parse(input);
    let url: URL;
    let options: RequestInit = { signal: AbortSignal.timeout(10000) };
    if (secrets.googleKey) {
      url = new URL("https://translation.googleapis.com/language/translate/v2");
      url.searchParams.set("key", secrets.googleKey);
      options = {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: chinese,
          source: "yue",
          target: "en",
          format: "text",
        }),
      };
    } else {
      url = new URL("https://translate.googleapis.com/translate_a/single");
      url.search = new URLSearchParams({
        client: "gtx",
        sl: "yue",
        tl: "en",
        dt: "t",
        q: chinese,
      }).toString();
    }
    const response = await fetch(url, options);
    if (!response.ok)
      throw Error(`Translation unavailable (${response.status})`);
    const body = await response.json();
    const text = secrets.googleKey
      ? body.data?.translations?.[0]?.translatedText
      : Array.isArray(body?.[0])
        ? body[0]
            .map((x: unknown[]) => (typeof x[0] === "string" ? x[0] : ""))
            .join("")
        : "";
    if (!text) throw Error("Translation unavailable");
    return text
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
  });
  ipcMain.handle("queue:send", async (event, input) => {
    trusted(event);
    if (!secrets.queueToken)
      throw Error("Add your JyutDeck request token in Settings first.");
    const item = z
      .object({
        chinese: z.string().min(1).max(2000).optional(),
        requestText: z.string().min(1).max(2000).optional(),
        inputLanguage: z.enum(["chinese", "jyutping", "english"]),
        note: z.string().max(4000),
        metadata: z.object({
          source: z.literal("jyutboard"),
          sessionId: z.string().max(100),
          cardId: z.string().max(100),
          hasLessonRecording: z.boolean(),
        }),
        idempotencyKey: z.string().max(200),
      })
      .strict()
      .refine((value) => Boolean(value.chinese || value.requestText));
    const body = JSON.stringify(
      z
        .object({ requests: z.array(item).min(1).max(10) })
        .strict()
        .parse(input),
    );
    if (Buffer.byteLength(body) > 65536)
      throw Error("Batch is too large. Send fewer phrases.");
    const response = await fetch(secrets.queueUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secrets.queueToken}`,
      },
      body,
      signal: AbortSignal.timeout(180000),
      redirect: "error",
    });
    if (!response.ok)
      throw Error(
        `JyutDeck returned ${response.status}. Check Settings or retry later.`,
      );
    return response.json();
  });
  ipcMain.handle("microphone", async (event) => {
    trusted(event);
    return process.platform === "darwin"
      ? systemPreferences.askForMediaAccess("microphone")
      : true;
  });
  ipcMain.handle("backup:save", async (event, input) => {
    trusted(event);
    const text = z.string().max(40_000_000).parse(input);
    const target = await dialog.showSaveDialog(window!, {
      defaultPath: "JyutBoard-lesson.json",
      filters: [{ name: "Lesson backup", extensions: ["json"] }],
    });
    if (target.canceled || !target.filePath) return false;
    await writeFile(target.filePath + ".tmp", text);
    await rename(target.filePath + ".tmp", target.filePath);
    return true;
  });
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) =>
      callback(
        webContents === window?.webContents &&
          permission === "media" &&
          "mediaTypes" in details &&
          details.mediaTypes?.every((x: string) => x === "audio") === true,
      ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) =>
      webContents === window?.webContents && permission === "media",
  );
  function openWindow() {
    window = new BrowserWindow({
      width: 1480,
      height: 940,
      minWidth: 1000,
      minHeight: 700,
      title: "JyutBoard",
      backgroundColor: "#f7f8f5",
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    if (!app.isPackaged && process.env.JYUTBOARD_DEV_URL)
      window.loadURL("http://localhost:5173");
    else window.loadFile(join(__dirname, "../dist/index.html"));
    window.on("closed", () => {
      window = null;
    });
  }
  openWindow();
  app.on("activate", () => {
    if (!window) openWindow();
  });
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  tunnel?.kill();
  void relay?.close();
});
