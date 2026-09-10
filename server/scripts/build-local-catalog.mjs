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
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

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
      thumbnail: firstExisting(root, "collection-01", [
        `${dirName}/icon.png`,
        `${dirName}/images/icon.png`,
      ]),
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
      thumbnail: firstExisting(root, "collection-02", [`${rel}/icon.png`]),
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
      thumbnail: firstExisting(root, "collection-04", [`${d.name}/icon.png`]),
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
  console.log(`已写入 ${OUT_JSON}`);
  console.log(`下一步：pnpm --filter server import:local 导入数据库`);
}

await main();