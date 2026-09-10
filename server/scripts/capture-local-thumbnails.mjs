/**
 * 截图兜底：为 build:local-catalog 之后仍缺缩略图的本地游戏，
 * 用 Edge 无头模式截取游戏首屏，写入 web/public/local-games/<...>/_thumb.png，
 * 并把路径回填进 server/data/local-games.json（下次 build 会经
 * capturedThumbUrl() 优先复用，重建 JSON 也不会丢）。
 *
 * 截图方式（按优先级）：
 *   1. CDP 实时等待（默认，需 Node>=22 原生 WebSocket）：常驻一个 Edge 实例，
 *      逐游戏 Page.navigate → 等 loadEventFired → 再真实等待
 *      THUMB_CAPTURE_WAIT_MS（默认 5000ms）→ captureScreenshot。
 *      部分游戏的游戏循环（rAF/setInterval）会瞬间耗尽 --virtual-time-budget，
 *      截到的只会是空白页，必须真实等待才截得到画面。
 *   2. CLI 截图兜底（CDP 不可用时）：单游戏单进程
 *      Edge --headless=new --screenshot --virtual-time-budget。
 *
 * 前置：
 *   - pnpm build:local-catalog 已跑过（web/public/local-games/ 有完整游戏文件）
 *   - 本机装有 Microsoft Edge（Chromium 内核；可用 EDGE_PATH 指定安装位置）
 *
 * 用法：
 *   pnpm --filter server capture:local-thumbs
 *   THUMB_CAPTURE_ONLY=c1-chess  pnpm --filter server capture:local-thumbs  # 只截指定游戏（逗号分隔多个）
 *   THUMB_CAPTURE_WAIT_MS=10000  pnpm --filter server capture:local-thumbs  # 慢游戏加长真实等待后重截
 *   THUMB_CAPTURE_WIDTH=960 THUMB_CAPTURE_HEIGHT=640 THUMB_CAPTURE_ONLY=... # 游戏画布大于默认
 *   THUMB_CAPTURE_CLICK=1 ...  # 等待完成后在画面中心模拟一次点击（要求用户手势才开始渲染的游戏）
 *   # 480x360 视口时（如固定 960x640 画布的游戏），放大视口重截避免裁剪
 *
 * CDP 模式截图前会合成几次鼠标移动（不点击，避免跳过标题画面），
 * 让依赖鼠标位置驱动的游戏（如重力球）动起来。
 *
 * 幂等：已存在 _thumb.png 的游戏跳过；JSON 按字段覆盖，可重复执行。
 * 之后：pnpm publish:local-games 上传 R2 → pnpm import:local 回填数据库。
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const PUBLIC_ROOT = path.join(WORKSPACE_ROOT, "web", "public");
const CATALOG_PATH = path.join(WORKSPACE_ROOT, "server", "data", "local-games.json");

const EDGE_CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  process.env.EDGE_PATH,
].filter(Boolean);

const WIDTH = Number(process.env.THUMB_CAPTURE_WIDTH ?? 480);
const HEIGHT = Number(process.env.THUMB_CAPTURE_HEIGHT ?? 360);
/** CDP 模式：页面 load 后再真实等待的毫秒数（等 JS 注入的资源加载、游戏循环起播） */
const REAL_WAIT_MS = Number(process.env.THUMB_CAPTURE_WAIT_MS ?? 5_000);
/** THUMB_CAPTURE_CLICK=1：等待完成后在画面中心模拟一次点击
 *  （部分游戏要求用户手势才开始渲染/播放，鼠标移动不够，需真点击） */
const CLICK_AFTER_WAIT = process.env.THUMB_CAPTURE_CLICK === "1";
/** CLI 兜底模式：虚拟时间预算（毫秒） */
const VIRTUAL_TIME_BUDGET = 10_000;
/** 单个截图进程超时（毫秒） */
const PROCESS_TIMEOUT = 60_000;
/** 小于该字节数的 PNG 视为疑似空白截图 */
const SUSPICIOUS_MIN_BYTES = 3_000;

const MIME_BY_EXT = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function findEdge() {
  for (const p of EDGE_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** 起一个只服务本机 public 目录的静态服务器（canvas 游戏 file:// 下可能被策略拦） */
function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
        const abs = path.join(PUBLIC_ROOT, urlPath.replace(/^\/+/, ""));
        if (!abs.startsWith(PUBLIC_ROOT) || !existsSync(abs) || (await stat(abs)).isDirectory()) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, {
          "content-type": MIME_BY_EXT[path.extname(abs).toLowerCase()] ?? "application/octet-stream",
        });
        res.end(await readFile(abs));
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ===== CDP 模式：常驻 Edge + 原生 WebSocket（Node>=22）驱动真实等待截图 ===== */
class CdpBrowser {
  static async launch(edgePath) {
    const profileDir = path.join(os.tmpdir(), `edge-thumb-profile-${Date.now()}`);
    const child = spawn(
      edgePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--disable-extensions",
        `--user-data-dir=${profileDir}`,
        `--window-size=${WIDTH},${HEIGHT}`,
        "--remote-debugging-port=0",
        "about:blank",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );

    const wsUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("等待 DevTools 端口超时")), 15_000);
      let buf = "";
      const onData = (d) => {
        buf += d.toString();
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      };
      child.stderr.on("data", onData);
      child.stdout.on("data", onData);
      child.on("close", () => {
        clearTimeout(timer);
        reject(new Error("Edge 进程提前退出"));
      });
    });

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("连接 DevTools WebSocket 失败"));
    });
    return new CdpBrowser(child, ws);
  }

  constructor(child, ws) {
    this.child = child;
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    /** sessionId -> Set<{predicate, resolve}>（事件等待器） */
    this.sessionWaiters = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      const waiters = this.sessionWaiters.get(msg.sessionId);
      if (waiters) {
        for (const w of [...waiters]) {
          if (w.predicate(msg)) {
            waiters.delete(w);
            w.resolve();
          }
        }
      }
    };
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 命令超时：${method}`));
        }
      }, 30_000);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  waitForEvent(sessionId, predicate) {
    return new Promise((resolve) => {
      this.sessionWaiters.get(sessionId).add({ predicate, resolve });
    });
  }

  /** 打开页面：导航 → 等 load（最多 20s）→ 真实等待 → 截图，返回 PNG Buffer */
  async capture(url, realWaitMs) {
    const { browserContextId } = await this.send("Target.createBrowserContext", {
      disposeOnDetach: true,
    });
    const { targetId } = await this.send("Target.createTarget", {
      url: "about:blank",
      browserContextId,
    });
    let sessionId;
    try {
      ({ sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true }));
      this.sessionWaiters.set(sessionId, new Set());
      const loaded = this.waitForEvent(sessionId, (m) => m.method === "Page.loadEventFired");
      await this.send("Page.enable", {}, sessionId);
      await this.send(
        "Emulation.setDeviceMetricsOverride",
        { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
      await this.send("Page.navigate", { url }, sessionId);
      // load 事件最多等 20s（个别游戏会阻塞在广告脚本上），超时也继续截图
      await Promise.race([loaded, sleep(20_000)]);
      // 合成鼠标移动（不点击，避免误触开始按钮跳过标题画面）：
      // 让依赖鼠标位置驱动的游戏动起来，不至于截到静止黑屏
      for (const [x, y] of [
        [Math.round(WIDTH * 0.25), Math.round(HEIGHT * 0.5)],
        [Math.round(WIDTH * 0.5), Math.round(HEIGHT * 0.6)],
        [Math.round(WIDTH * 0.75), Math.round(HEIGHT * 0.4)],
        [Math.round(WIDTH * 0.5), Math.round(HEIGHT * 0.3)],
      ]) {
        await this.send(
          "Input.dispatchMouseEvent",
          { type: "mouseMoved", x, y, button: "none", pointerType: "mouse" },
          sessionId,
        ).catch(() => {});
        await sleep(300);
      }
      await sleep(realWaitMs);
      if (CLICK_AFTER_WAIT) {
        const cx = Math.round(WIDTH * 0.5);
        const cy = Math.round(HEIGHT * 0.5);
        await this.send(
          "Input.dispatchMouseEvent",
          { type: "mousePressed", x: cx, y: cy, button: "left", buttons: 1, clickCount: 1 },
          sessionId,
        );
        await this.send(
          "Input.dispatchMouseEvent",
          { type: "mouseReleased", x: cx, y: cy, button: "left", buttons: 0, clickCount: 1 },
          sessionId,
        );
        await sleep(1500);
      }
      const { data } = await this.send(
        "Page.captureScreenshot",
        { format: "png", captureBeyondViewport: false },
        sessionId,
      );
      return Buffer.from(data, "base64");
    } finally {
      this.sessionWaiters.delete(sessionId);
      await this.send("Target.closeTarget", { targetId }).catch(() => {});
    }
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // 忽略关闭异常
    }
    this.child.kill();
  }
}

/** CLI 兜底：单游戏单进程 --screenshot（虚拟时间预算，对部分 canvas 游戏可能截到空白） */
function captureViaCli(edgePath, url, outPath, profileDir) {
  return new Promise((resolve) => {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--disable-extensions",
      `--user-data-dir=${profileDir}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      `--virtual-time-budget=${VIRTUAL_TIME_BUDGET}`,
      `--screenshot=${outPath}`,
      url,
    ];
    const child = spawn(edgePath, args, { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), PROCESS_TIMEOUT);
    child.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const edgePath = findEdge();
  if (!edgePath) {
    console.error("找不到 Microsoft Edge（试过默认安装路径，可用 EDGE_PATH 指定）");
    process.exit(1);
  }

  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const only = process.env.THUMB_CAPTURE_ONLY
    ? new Set(process.env.THUMB_CAPTURE_ONLY.split(",").map((s) => s.trim()))
    : null;
  const targets = catalog.filter(
    (g) => (!g.thumbnail || (only && only.has(g.sourceGameId))) &&
      (!only || only.has(g.sourceGameId)),
  );
  if (targets.length === 0) {
    console.log("没有缺缩略图的本地游戏，无需截图。");
    return;
  }
  console.log(`待截图：${targets.length} 款`);

  const { server, port } = await startServer();

  // CDP 优先（真实等待截图），不可用则回退 CLI 虚拟时间截图
  let cdp = null;
  if (typeof WebSocket !== "undefined") {
    try {
      cdp = await CdpBrowser.launch(edgePath);
      console.log(`CDP 模式：Edge 已启动（load 后真实等待 ${REAL_WAIT_MS}ms 截图）`);
    } catch (err) {
      console.log(`CDP 启动失败（${err.message}），回退 CLI 虚拟时间截图`);
    }
  } else {
    console.log("当前 Node 无原生 WebSocket（需 >=22），回退 CLI 虚拟时间截图");
  }
  const cliProfileDir = path.join(os.tmpdir(), `edge-thumb-profile-${Date.now()}`);

  const results = { ok: 0, fail: [], suspicious: [] };
  let patched = 0;

  try {
    for (const [i, g] of targets.entries()) {
      const publicIndex = path.join(PUBLIC_ROOT, g.gameUrl.replace(/^\/+/, ""));
      if (!existsSync(publicIndex)) {
        console.log(`[skip] ${g.sourceGameId}：public 下找不到 ${g.gameUrl}`);
        results.fail.push(g.sourceGameId);
        continue;
      }
      const outPath = path.join(path.dirname(publicIndex), "_thumb.png");
      const thumbUrl = `${g.gameUrl.replace(/\/[^/]+$/, "")}/_thumb.png`;
      const url = `http://127.0.0.1:${port}${encodeURI(g.gameUrl)}`;

      if (existsSync(outPath) && !only) {
        // 幂等：已有截图只补 JSON
      } else if (cdp) {
        try {
          const buf = await cdp.capture(url, REAL_WAIT_MS);
          await writeFile(outPath, buf);
        } catch (err) {
          console.log(`[cdp-fail] ${g.sourceGameId}：${err.message}，改用 CLI 截图`);
          await captureViaCli(edgePath, url, outPath, cliProfileDir);
        }
      } else {
        await captureViaCli(edgePath, url, outPath, cliProfileDir);
      }

      if (!existsSync(outPath)) {
        console.log(`[FAIL] ${g.sourceGameId} [${g.title}]`);
        results.fail.push(g.sourceGameId);
        continue;
      }
      const size = (await stat(outPath)).size;
      if (size < SUSPICIOUS_MIN_BYTES) {
        results.suspicious.push(`${g.sourceGameId} [${g.title}] (${size}B 疑似空白)`);
      }
      if (g.thumbnail !== thumbUrl) {
        g.thumbnail = thumbUrl;
        patched++;
      }
      results.ok++;
      if ((i + 1) % 5 === 0 || i === targets.length - 1) {
        console.log(`  进度 ${i + 1}/${targets.length}`);
      }
    }
  } finally {
    cdp?.close();
    server.close();
  }

  if (patched > 0) {
    await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf8");
    console.log(`local-games.json 已回填 ${patched} 条 thumbnail`);
  }

  console.log(`\ndone: 截图成功 ${results.ok}/${targets.length}`);
  if (results.fail.length) console.log(`失败：${results.fail.join(", ")}`);
  if (results.suspicious.length) {
    console.log("疑似空白截图（可 THUMB_CAPTURE_WAIT_MS=10000 加长等待后，用 THUMB_CAPTURE_ONLY=<id> 单独重跑）：");
    for (const s of results.suspicious) console.log("  " + s);
  }
  console.log("下一步：pnpm publish:local-games 上传 R2 → pnpm --filter server import:local 回填数据库");
}

await main();
