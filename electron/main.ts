import {
  app,
  net,
  BrowserWindow,
  ipcMain,
  safeStorage,
  session,
  systemPreferences,
  dialog,
  clipboard,
  shell,
} from "electron";
import { join } from "node:path";
import { readFile, writeFile, rename } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { startRelay } from "./relay-server";
import { z } from "zod";
import { DesktopUpdates } from "./update";
let updater: DesktopUpdates | undefined;
let installingUpdate = false;
let window: BrowserWindow | null = null;
let relay: Awaited<ReturnType<typeof startRelay>> | undefined;
let tunnel: ChildProcessWithoutNullStreams | undefined;
async function startDesktopRelay() {
  try {
    return await startRelay();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    // Another open build can own the usual port; invitations use the real port.
    return startRelay(0);
  }
}
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
    if (secrets.queueUrl === "https://jyutdeck.vercel.app/api/v1/requests")
      secrets.queueUrl =
        "https://jyutdeck-live-jul08f.vercel.app/api/v1/requests";
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
  updater = new DesktopUpdates({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR,
    executable: process.execPath,
    directory: join(app.getPath("userData"), "updates"),
    fetch: (input, init) =>
      net.fetch(input instanceof URL ? input.href : input, init),
    quit: () => app.quit(),
  });
  await updater.start();
  ipcMain.handle("updates:get", (event) => {
    trusted(event);
    return updater!.state;
  });
  ipcMain.handle("updates:check", (event) => {
    trusted(event);
    return updater!.check();
  });
  ipcMain.handle("updates:enabled", (event, enabled) => {
    trusted(event);
    return updater!.setEnabled(z.boolean().parse(enabled));
  });
  ipcMain.handle("updates:install", (event) => {
    trusted(event);
    installingUpdate = true;
    return updater!.restart().catch((error) => {
      installingUpdate = false;
      throw error;
    });
  });
  ipcMain.handle("settings:get", (event) => {
    trusted(event);
    return {
      queueUrl:
        secrets.queueUrl ||
        "https://jyutdeck-live-jul08f.vercel.app/api/v1/requests",
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
      ...secrets,
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
  ipcMain.handle("clipboard:write", (event, text) => {
    trusted(event);
    const value = z.string().min(1).max(5000).parse(text);
    clipboard.writeText(value);
    return true;
  });
  ipcMain.handle("relay:start", async (event) => {
    trusted(event);
    relay ??= await startDesktopRelay();
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
    relay ??= await startDesktopRelay();
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
  async function boardRequest(body: unknown, needsToken = true) {
    const action = (body as { action?: string }).action;
    const pairedGuest =
      needsToken &&
      !secrets.queueToken &&
      Boolean(secrets.pairRoom) &&
      ["vocabulary", "transcribe", "analyze", "send"].includes(action || "");
    if (needsToken && !secrets.queueToken && !pairedGuest)
      throw Error(
        "Pair with Leif's room, or add the JyutDeck request token in Settings first.",
      );
    if (pairedGuest) body = { ...(body as object), room: secrets.pairRoom };
    const endpoint = new URL(
      secrets.queueUrl ||
        "https://jyutdeck-live-jul08f.vercel.app/api/v1/requests",
    );
    endpoint.pathname = "/api/v1/board";
    endpoint.search = "";
    const response = await net.fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(needsToken && secrets.queueToken
          ? { Authorization: `Bearer ${secrets.queueToken}` }
          : {}),
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error || "JyutDeck connection unavailable.");
    return result;
  }
  ipcMain.handle("board:analyze", async (event, text, language) => {
    trusted(event);
    return boardRequest({
      action: "analyze",
      text: z.string().trim().min(1).max(2000).parse(text),
      language: z.enum(["chinese", "jyutping", "english"]).parse(language),
    });
  });
  ipcMain.handle("board:vocabulary", async (event) => {
    trusted(event);
    return boardRequest({ action: "vocabulary" });
  });
  ipcMain.handle("board:transcribe", async (event, input) => {
    trusted(event);
    const audio = z
      .string()
      .max(2_800_000)
      .regex(/^data:audio\//)
      .parse(input);
    return boardRequest({ action: "transcribe", audio });
  });
  ipcMain.handle("board:pair", async (event, input) => {
    trusted(event);
    const value = z
      .object({
        action: z.enum(["remember", "get", "publish", "resolve", "forget"]),
        room: z
          .string()
          .regex(/^[a-f0-9]{48}$/)
          .optional(),
        relay: z.string().url().max(500).optional(),
        host: z.boolean().optional(),
      })
      .strict()
      .parse(input);
    if (value.action === "get")
      return secrets.pairRoom
        ? { room: secrets.pairRoom, host: secrets.pairHost === "true" }
        : null;
    if (value.action === "resolve")
      return boardRequest(
        { action: "resolve", room: value.room || secrets.pairRoom },
        false,
      );
    if (value.action === "publish")
      return boardRequest({
        action: "publish",
        room: value.room,
        relay: value.relay,
      });
    if (!safeStorage.isEncryptionAvailable())
      throw Error("OS credential encryption is unavailable.");
    if (value.action === "forget") {
      delete secrets.pairRoom;
      delete secrets.pairHost;
    } else {
      if (!value.room) throw Error("Room required");
      secrets.pairRoom = value.room;
      secrets.pairHost = String(value.host === true);
    }
    await writeFile(
      join(app.getPath("userData"), "settings.enc"),
      safeStorage.encryptString(JSON.stringify(secrets)),
      { mode: 0o600 },
    );
    return true;
  });
  ipcMain.handle("queue:send", async (event, input) => {
    trusted(event);
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
          sourceRole: z.enum(["teacher", "learner"]).optional(),
          teacherApproved: z.boolean().optional(),
        }),
        idempotencyKey: z.string().max(200),
      })
      .strict()
      .refine((value) => Boolean(value.chinese || value.requestText));
    const payload = z
      .object({ requests: z.array(item).min(1).max(10) })
      .strict()
      .parse(input);
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body) > 65536)
      throw Error("Batch is too large. Send fewer phrases.");

    // A paired participant can save through the room capability. Natasha never
    // needs Leif's long-lived JyutDeck token on her own desktop.
    if (!secrets.queueToken) {
      if (!secrets.pairRoom)
        throw Error(
          "Pair this JyutBoard with Leif's room once, then saved phrases sync automatically.",
        );
      return boardRequest({
        action: "send",
        room: secrets.pairRoom,
        payload,
      });
    }

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
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url === "https://github.com/lemaurer/jyutboard/releases/latest")
        void shell.openExternal(url);
      return { action: "deny" };
    });
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
app.on("before-quit", (event) => {
  if (!installingUpdate && updater?.canInstall && updater.state.enabled) {
    event.preventDefault();
    installingUpdate = true;
    void updater
      .install(false)
      .catch(() => {})
      .finally(() => app.quit());
    return;
  }
  tunnel?.kill();
  void relay?.close();
});
