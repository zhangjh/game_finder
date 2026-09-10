/**
 * 构建「本地部署」中文 H5 游戏目录（本地游戏专区）。
 *
 * 工作内容：
 * 1. 把源目录 4 个合集（MY-Games-01）整体拷贝到 web/public/local-games/collection-0?/，
 *    并把 MY-Games-02 的单层游戏目录拷到 collection-05/（Vite 会把 public/
 *    拷贝进 dist/，由 Cloudflare Pages 静态托管）。
 * 2. 解析各合集的 README / link/0.html / index*.html / <title>，生成
 *    server/data/local-games.json（导入脚本 import-local-games.mjs 消费）。
 *
 * 用法：
 *   pnpm build:local-catalog
 *   LOCAL_GAMES_SOURCE_DIR="D:/xxx"  pnpm build:local-catalog   # 覆盖 MY-01 源目录
 *   LOCAL_GAMES_SOURCE_DIR_2="D:/yyy" pnpm build:local-catalog  # 覆盖 MY-02 源目录
 *
 * 幂等：整目录覆盖拷贝，可重复执行（会刷新 local-games.json）。
 */
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const existsSync = fs.existsSync;

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_ROOT =
  process.env.LOCAL_GAMES_SOURCE_DIR ??
  "C:/Users/cn-dantezhang/dev/MY-Games-01";
const SOURCE_ROOT_2 =
  process.env.LOCAL_GAMES_SOURCE_DIR_2 ??
  "C:/Users/cn-dantezhang/dev/MY-Games-02";
const TARGET_ROOT = path.join(WORKSPACE_ROOT, "web", "public", "local-games");
const OUT_JSON = path.join(WORKSPACE_ROOT, "server", "data", "local-games.json");

const COLLECTIONS = [
  { dir: "游戏合集01", target: "collection-01" },
  { dir: "游戏合集02", target: "collection-02" },
  { dir: "游戏合集03", target: "collection-03" },
  { dir: "游戏合集04", target: "collection-04" },
];

/** 简单类型关键词 → 站点中文 genre（只做有把握的映射，其余留 null） */
const GENRE_RULES = [
  [/象棋|五子棋|围棋|国际象棋|跳棋/, "棋盘"],
  [/扑克|斗地主|纸牌|蜘蛛牌/, "纸牌"],
  [/消消|三消|2048|数字/, "益智"],
  [/魔塔/, "冒险"],
  [/跑酷/, "跑酷"],
];

/** 把集合根目录下的相对路径映射成 /local-games/{collection}/{rel} URL */
function assetUrl(collection, relPath) {
  const rel = relPath.replace(/\\/g, "/");
  return `/local-games/${collection}/${rel}`;
}

/** 候选文件里第一个真实存在的，转成可访问 URL；都不存在返回 null */
function firstExisting(root, collection, candidates) {
  for (const rel of candidates) {
    if (existsSync(path.join(root, rel))) return assetUrl(collection, rel);
  }
  return null;
}

/* ===== 智能选图：无 icon.png 时从游戏目录挑「最像封面」的素材 =====
 * 思路：文件名打分（cover/logo/banner 优先，sprite/anim 扣分）
 * + 图片头尺寸校验（太小是图标、长条是精灵图、超大降权）。
 */

const SMART_IMG_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** 读图片头部解析像素尺寸（PNG/GIF/JPEG；失败返回 null） */
function probeImageSize(file) {
  let buf;
  try {
    const fd = fs.openSync(file, "r");
    buf = Buffer.alloc(65536);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    buf = buf.subarray(0, bytes);
    fs.closeSync(fd);
  } catch {
    return null;
  }
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        off += 2;
        continue;
      }
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  return null;
}

function scoreImage(name, size, dirBase, relPath) {
  const n = name.toLowerCase();
  const stem = n.replace(/\.[^.]+$/, "");
  let s = 0;
  if (/(cover|logo|banner|poster|thumb|title|main|start)/.test(n)) s += 100;
  else if (/icon/.test(n)) s += 80;
  // 文件名与游戏目录同名：基本就是作者放的封面/主视觉
  if (dirBase && stem === dirBase) s += 80;
  if (/(bg|background)/.test(n)) s += 60;
  // 素材图集 / 贴图目录（如 minecraft 的 texture/gui.png）：不是封面
  if (/(sheet|sprite|anim|atlas|tile|btn|button|num|font)/.test(n)) s -= 60;
  if (/(^|\/)(texture|textures|ui|hud|atlas|sprites?)(\/|$)/i.test(relPath ?? "")) s -= 80;
  if (/^(gui|ui|hud|bar)s?[\._-]/.test(n)) s -= 80;
  if (size) {
    const { w, h } = size;
    if (w < 200 || h < 120) s -= 100;
    const ratio = w / h;
    if (ratio > 3 || ratio < 1 / 3) s -= 80;
    if (w >= 480 && h >= 270) s += 30;
    if (w >= 1600 || h >= 1600) s -= 10;
  }
  return s;
}

function listImages(dir, depth = 0, out = [], root = dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth < 2) listImages(p, depth + 1, out, root);
    } else if (SMART_IMG_EXTS.has(path.extname(e.name).toLowerCase())) {
      out.push({ name: e.name, abs: p, rel: path.relative(root, p).replace(/\\/g, "/") });
    }
  }
  return out;
}

/** 挑出得分达标的最佳图片，返回其公开 URL（相对 /local-games/）；无合适素材返回 null */
const smartPickStats = { picked: 0, none: 0 };
function pickSmartThumbnail(gameDir, urlPrefix) {
  const files = listImages(gameDir);
  const dirBase = path.basename(gameDir).toLowerCase();
  let best = null;
  for (const f of files) {
    const s = scoreImage(f.name, probeImageSize(f.abs), dirBase, f.rel);
    if (s < 0) continue;
    if (!best || s > best.s) best = { s, f };
  }
  if (!best) {
    smartPickStats.none++;
    return null;
  }
  smartPickStats.picked++;
  const rel = path.relative(gameDir, best.f.abs).replace(/\\/g, "/");
  return `${urlPrefix}/${rel}`;
}

/** capture-local-thumbnails.mjs 截图兜底的产物（_thumb.png 已在 public 树里） */
function capturedThumbUrl(collection, relDir) {
  const rel = relDir.replace(/\\/g, "/");
  return existsSync(path.join(TARGET_ROOT, collection, rel, "_thumb.png"))
    ? `/local-games/${collection}/${rel}/_thumb.png`
    : null;
}

function inferGenre(title) {
  for (const [re, genre] of GENRE_RULES) {
    if (re.test(title)) return genre;
  }
  return null;
}

function templateDesc(title) {
  return `经典中文 H5 小游戏《${title}》，HTML5 实现，无需下载、即开即玩。`;
}

/** 生成 URL 安全的 slug（只保留 a-z0-9-，折叠连续分隔符） */
function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readUtf8(file) {
  return readFile(file, "utf8");
}

async function copyCollection(src, target) {
  await mkdir(path.dirname(target), { recursive: true });
  await cp(src, target, { recursive: true, force: true });
}

/* ===== 合集01：README 表格（目录 | 游戏名）===== */
async function parseCollection01() {
  const root = path.join(SOURCE_ROOT, "游戏合集01");
  const readme = await readUtf8(path.join(root, "README.md"));
  const entries = [];
  const seen = new Set();

  const tableRe = /^\|\s*([a-z0-9_\-]+)\s*\|\s*([^|]+?)\s*\|/gim;
  let m;
  while ((m = tableRe.exec(readme))) {
    const dirName = m[1];
    const title = m[2].trim();
    if (seen.has(dirName)) continue;
    seen.add(dirName);
    if (!existsSync(path.join(root, dirName, "index.html"))) {
      console.log(`[c1] skip ${dirName}（缺少 index.html，README 中收录但源缺失）`);
      continue;
    }
    entries.push({
      sourceGameId: `c1-${dirName}`,
      slug: slugify(`c1-${dirName}`),
      title,
      description: templateDesc(title),
      genre: inferGenre(title),
      thumbnail:
        firstExisting(root, "collection-01", [
          `${dirName}/icon.png`,
          `${dirName}/images/icon.png`,
        ]) ??
        capturedThumbUrl("collection-01", dirName) ??
        pickSmartThumbnail(
          path.join(root, dirName),
          `/local-games/collection-01/${dirName}`,
        ),
      gameUrl: assetUrl("collection-01", `${dirName}/index.html`),
    });
  }
  return entries;
}

/* ===== 合集02：link/0.html（名称+简介）+ yxmb/1..80 ===== */
// logo 区块内容含 <img>，组 2 抓取后需 strip 标签再取文本
const LINK_RE =
  /<a[^>]*href="\.\.\/yxmb\/(\d+)\/[^"]*"[^>]*>[\s\S]*?<div class="logo">([\s\S]*?)<\/div>[\s\S]*?<div class="desc">([^<]*)<\/div>/g;

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function parseCollection02() {
  const root = path.join(SOURCE_ROOT, "游戏合集02");
  const indexHtml = await readUtf8(path.join(root, "link", "0.html"));
  const meta = new Map();

  let m;
  while ((m = LINK_RE.exec(indexHtml))) {
    if (!meta.has(m[1])) {
      meta.set(m[1], { name: stripTags(m[2]), desc: m[3].trim() });
    }
  }
  console.log(`[c2] link/0.html 解析到 ${meta.size} 条「编号→名称」映射`);

  const dirs = await readdir(path.join(root, "yxmb"), { withFileTypes: true });
  const entries = [];
  for (const d of dirs.sort((a, b) => Number(a.name) - Number(b.name))) {
    if (!d.isDirectory() || !/^\d+$/.test(d.name)) continue;
    const rel = path.join("yxmb", d.name);
    if (!existsSync(path.join(root, rel, "index.html"))) continue;

    const info = meta.get(d.name) ?? {};
    let title = info.name;
    if (!title) {
      const html = await readUtf8(path.join(root, rel, "index.html"));
      const tm = /<title>([^<]*)<\/title>/i.exec(html);
      title = tm?.[1].trim() || `合集02游戏 ${d.name}`;
    }
    entries.push({
      sourceGameId: `c2-${d.name}`,
      slug: slugify(`c2-${d.name}`),
      title,
      description: info.desc || templateDesc(title),
      genre: inferGenre(title),
      thumbnail:
        firstExisting(root, "collection-02", [`${rel}/icon.png`]) ??
        capturedThumbUrl("collection-02", rel) ??
        pickSmartThumbnail(
          path.join(root, rel),
          `/local-games/collection-02/${rel.replace(/\\/g, "/")}`,
        ),
      gameUrl: assetUrl("collection-02", `${rel}/index.html`),
    });
  }
  return entries;
}

/* ===== 合集03：games/（+ games1、games-desktop）目录枚举 + 站内列表名映射 ===== */
const LIST_NAME_RE =
  /<a[^>]*href="games\/([a-z0-9_\-]+)"[^>]*>[\s\S]*?<div class="info">[\s\S]*?<p>([^<]*)<\/p>/g;
const LIST_ICON_NAME_RE =
  /<a[^>]*href="games\/([a-z0-9_\-]+)"[^>]*>[\s\S]*?background-image:url\(([^)]+)\)[\s\S]*?<p>([^<]*)<\/p>/g;
const LIST_IMG_ALT_RE =
  /<a[^>]*href="games\/([a-z0-9_\-]+)"[^>]*><img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/g;

async function parseCollection03() {
  const root = path.join(SOURCE_ROOT, "游戏合集03");
  const nameMap = new Map();
  const iconMap = new Map();

  for (const file of ["index.html", "index1.html", "index3.html", "index4.html", "index5.html"]) {
    const html = await readUtf8(path.join(root, file));
    for (const re of [LIST_ICON_NAME_RE, LIST_IMG_ALT_RE, LIST_NAME_RE]) {
      let m;
      while ((m = re.exec(html))) {
        if (!nameMap.has(m[1])) nameMap.set(m[1], m[3].trim());
        if (!iconMap.has(m[1]) && re !== LIST_NAME_RE) iconMap.set(m[1], m[2]);
      }
    }
  }
  console.log(`[c3] 站内列表解析到 ${nameMap.size} 个游戏名`);

  const entries = [];
  const groups = ["games", "games1", "games-desktop"];

  for (const group of groups) {
    const base = path.join(root, group);
    if (!existsSync(base)) continue;
    const dirs = await readdir(base, { withFileTypes: true });
    for (const d of dirs.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!d.isDirectory()) continue;
      const rel = `${group}/${d.name}`;
      const indexHtml = path.join(root, rel, "index.html");
      if (!existsSync(indexHtml)) {
        console.log(`[c3] skip ${rel}（缺少 index.html）`);
        continue;
      }

      const listName = nameMap.get(d.name);
      let title = listName;
      if (!title) {
        const html = await readUtf8(indexHtml);
        const tm = /<title>([^<]*)<\/title>/i.exec(html);
        title = tm?.[1].trim() || `合集03游戏 ${d.name}`;
      }

      let thumbnail = firstExisting(root, "collection-03", [`${rel}/icon.png`]);
      if (!thumbnail && iconMap.has(d.name)) {
        // 列表图标常用站点根相对路径（如 icon/x.png），整目录拷贝后可直接引用
        const relIcon = slugify(iconMap.get(d.name)).replace(/^-/, "");
        const abs = path.join(WORKSPACE_ROOT, "web", "public", "local-games", "collection-03", relIcon);
        if (existsSync(abs)) {
          thumbnail = `/local-games/collection-03/${relIcon.replace(/\\/g, "/")}`;
        }
      }
      if (!thumbnail) {
        thumbnail =
          capturedThumbUrl("collection-03", rel) ??
          pickSmartThumbnail(
            path.join(root, rel),
            `/local-games/collection-03/${rel}`,
          );
      }

      entries.push({
        sourceGameId: `c3-${d.name}`,
        slug: slugify(`c3-${d.name}`),
        title,
        description: listName ? `《${listName}》中文 H5 小游戏，即开即玩。` : templateDesc(title),
        genre: inferGenre(title),
        thumbnail,
        gameUrl: assetUrl("collection-03", `${rel}/index.html`),
      });
    }
  }
  return entries;
}

/* ===== 合集04：子目录枚举 + <title> ===== */
async function parseCollection04() {
  const root = path.join(SOURCE_ROOT, "游戏合集04");
  const dirs = await readdir(root, { withFileTypes: true });
  const entries = [];
  const usedSlugs = new Set();

  for (const d of dirs.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isDirectory()) continue;
    if (!existsSync(path.join(root, d.name, "index.html"))) {
      console.log(`[c4] skip ${d.name}（缺少 index.html）`);
      continue;
    }
    const html = await readUtf8(path.join(root, d.name, "index.html"));
    const tm = /<title>([^<]*)<\/title>/i.exec(html);
    const title = tm?.[1].trim() || `合集04游戏 ${d.name}`;

    let slug = slugify(`c4-${d.name}`);
    if (usedSlugs.has(slug)) slug = slugify(`c4-${d.name}-${d.name}`);
    usedSlugs.add(slug);

    entries.push({
      sourceGameId: `c4-${d.name}`,
      slug,
      title,
      description: templateDesc(title),
      genre: inferGenre(title),
      thumbnail:
        firstExisting(root, "collection-04", [`${d.name}/icon.png`]) ??
        capturedThumbUrl("collection-04", d.name) ??
        pickSmartThumbnail(
          path.join(root, d.name),
          `/local-games/collection-04/${d.name}`,
        ),
      gameUrl: assetUrl("collection-04", `${d.name}/index.html`),
    });
  }
  return entries;
}

/* ===== MY-Games-02：README 清单（标题+描述+路径+类型）+ 单层游戏目录 =====
 * 中文目录名无法进 URL，用一个稳定的 ASCII 映射做 collection-05 下的目录名；
 * copy 用 ASCII 名（游戏内部均为相对引用，改名不影响运行），URL 保持干净。
 * 统一入口：拷贝后把非 index.html 的入口文件重命名为 index.html，
 * 保证上传/库里所有本地游戏入口都是 index.html，代码层无需特判入口文件名。
 */
const MY2_ID_MAP = {
  "2048": "2048",
  "8球桌球": "8-ball",
  "像素大卡车": "pixel-truck",
  "四色牌": "uno",
  "小黑屋": "a-dark-room",
  "我的世界网页版（简化版）": "minecraft-lite",
  "植物大战僵尸-v1.3": "pvz-v1-3",
  "植物大战僵尸-v1.6": "pvz-v1-6",
  "火柴人跑酷": "stickman-runner",
  "炒股模拟器": "stock-simulator",
};

const MY2_README_ENTRY_RE = /###\s*\d+\.\s*(.+?)\s*\n([\s\S]*?)(?=\n###\s|\n##\s|$)/g;
const MY2_PATH_RE = /-\s*\*\*文件路径\*\*:\s*`([^`]+)`/;
const MY2_TYPE_RE = /-\s*\*\*游戏类型\*\*:\s*(.+)/;

async function parseCollection05() {
  const root = SOURCE_ROOT_2;
  if (!existsSync(root)) {
    console.log(`[c5] 跳过（源目录不存在）：${root}`);
    return [];
  }
  const targetBase = path.join(TARGET_ROOT, "collection-05");
  const readme = await readUtf8(path.join(root, "README.md"));
  const entries = [];
  const skipCopy = process.env.LOCAL_CATALOG_SKIP_COPY === "1";

  let m;
  while ((m = MY2_README_ENTRY_RE.exec(readme))) {
    const title = m[1].trim();
    const body = m[2];
    const desc =
      body
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l && !/^[-*#]/.test(l)) ??
      templateDesc(title);
    const type = MY2_TYPE_RE.exec(body)?.[1]?.trim() ?? null;

    const rel = MY2_PATH_RE.exec(body)?.[1]?.replace(/\\/g, "/") ?? null;
    const dirName = rel?.split("/")?.[0] ?? null;
    const entryFromReadme = rel?.split("/").slice(1).join("/") ?? null;

    if (!dirName || !existsSync(path.join(root, dirName))) {
      console.log(`[c5] skip ${title}（找不到源目录：${rel ?? "?"}）`);
      continue;
    }

    const id =
      MY2_ID_MAP[dirName] ??
      (() => {
        const fallback = createHash("sha1").update(dirName).digest("hex").slice(0, 8);
        console.warn(
          `[c5] ${dirName} 未收录在 MY2_ID_MAP，使用回退 ID c5-${fallback}（建议补一行映射）`,
        );
        return fallback;
      })();

    // 真实入口 html：优先 README 指定的文件，否则目录根唯一 .html
    let entry = entryFromReadme || "index.html";
    if (!existsSync(path.join(root, dirName, entry))) {
      const htmls = (await readdir(path.join(root, dirName))).filter((f) =>
        f.toLowerCase().endsWith(".html"),
      );
      if (htmls.length === 1) entry = htmls[0];
      else {
        console.log(`[c5] skip ${dirName}（入口 ${entry} 不存在且目录 html 不唯一）`);
        continue;
      }
    }

    if (!skipCopy) {
      await copyCollection(path.join(root, dirName), path.join(targetBase, id));
      // 统一入口为 index.html：非 index.html 的入口重命名（如 2048/2048.html）
      if (entry !== "index.html") {
        const entryPath = path.join(targetBase, id, entry);
        if (existsSync(entryPath)) {
          await rm(path.join(targetBase, id, "index.html"), { force: true });
          await rename(entryPath, path.join(targetBase, id, "index.html"));
          console.log(`[c5] ${id}：入口 ${entry} → index.html`);
        }
      }
    }

    const srcDir = path.join(root, dirName);
    let thumbnail = null;
    for (const cand of ["icon.png", "images/icon.png", "favicon.ico"]) {
      if (existsSync(path.join(srcDir, cand))) {
        thumbnail = assetUrl("collection-05", `${id}/${cand}`);
        break;
      }
    }
    if (!thumbnail) {
      thumbnail =
        capturedThumbUrl("collection-05", id) ??
        pickSmartThumbnail(srcDir, `/local-games/collection-05/${id}`);
    }

    entries.push({
      sourceGameId: `c5-${id}`,
      slug: slugify(`c5-${id}`),
      title,
      description: desc,
      genre: inferGenre(`${title} ${type ?? ""}`),
      thumbnail,
      gameUrl: assetUrl("collection-05", `${id}/index.html`),
    });
  }
  console.log(`[c5] README 解析到 ${entries.length} 款游戏`);
  return entries;
}

async function main() {
  if (!existsSync(SOURCE_ROOT)) {
    console.error(`源目录不存在：${SOURCE_ROOT}`);
    console.error(`可通过 LOCAL_GAMES_SOURCE_DIR 指定，如：LOCAL_GAMES_SOURCE_DIR="D:/games" pnpm build:local-catalog`);
    process.exit(1);
  }

  console.log(`源目录：${SOURCE_ROOT}`);
  console.log(`源目录2：${SOURCE_ROOT_2}`);
  console.log(`拷贝目标：${TARGET_ROOT}`);
  console.log("");

  // 1. 整目录拷贝 4 个合集（保留相对路径，兼容个别游戏引用站内共享资源）
  //    设 LOCAL_CATALOG_SKIP_COPY=1 可只重建 JSON、跳过拷贝（迭代解析用）
  if (process.env.LOCAL_CATALOG_SKIP_COPY === "1") {
    console.log("[copy] LOCAL_CATALOG_SKIP_COPY=1，跳过拷贝");
  } else {
    for (const { dir, target } of COLLECTIONS) {
      const src = path.join(SOURCE_ROOT, dir);
      if (!existsSync(src)) {
        console.log(`[copy] 跳过 ${dir}（源不存在）`);
        continue;
      }
      await copyCollection(src, path.join(TARGET_ROOT, target));
      console.log(`[copy] ${dir} → ${target}`);
    }
  }

  // 2. 解析目录
  const c1 = await parseCollection01();
  const c2 = await parseCollection02();
  const c3 = await parseCollection03();
  const c4 = await parseCollection04();
  const c5 = await parseCollection05();

  // 3. 统一 slug：全部带 local- 前缀且唯一
  const used = new Set();
  const final = [...c1, ...c2, ...c3, ...c4, ...c5].map((g) => {
    let slug = `local-${g.slug}`;
    let n = 2;
    while (used.has(slug)) slug = `local-${g.slug}-${n++}`;
    used.add(slug);
    return { ...g, slug };
  });

  await mkdir(path.dirname(OUT_JSON), { recursive: true });
  await writeFile(OUT_JSON, JSON.stringify(final, null, 2) + "\n", "utf8");

  const perColl = { "c1-": 0, "c2-": 0, "c3-": 0, "c4-": 0, "c5-": 0 };
  for (const g of final) {
    const prefix = g.sourceGameId.slice(0, 3);
    if (prefix in perColl) perColl[prefix]++;
  }
  console.log("");
  console.log(`catalog: 共 ${final.length} 款游戏（c1=${perColl["c1-"]} c2=${perColl["c2-"]} c3=${perColl["c3-"]} c4=${perColl["c4-"]} c5=${perColl["c5-"]}）`);
  const missingThumb = final.filter((g) => !g.thumbnail);
  console.log(
    `缩略图：智能选图补 ${smartPickStats.picked} 款，仍缺 ${missingThumb.length} 款` +
      (missingThumb.length
        ? `（可跑 pnpm capture:local-thumbs 截图兜底：${missingThumb.map((g) => g.sourceGameId).slice(0, 8).join(", ")}${missingThumb.length > 8 ? " …" : ""}）`
        : ""),
  );
  console.log(`已写入 ${OUT_JSON}`);
  console.log(`下一步：pnpm --filter server import:local 导入数据库`);
}

await main();