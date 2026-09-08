import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildVideoGameJsonLd,
  PUBLIC_SITE_URL,
  SEO_LANDING_PAGES,
  type SeoGameExportResponse,
  type SeoGameMetadata,
  type SeoLandingPage,
} from "../../packages/shared/src/index.ts";

const SITE_URL = PUBLIC_SITE_URL;
const API_BASE_URL = normalizeApiUrl(
  process.env.SEO_API_BASE_URL ?? process.env.VITE_API_BASE_URL,
);
const SEO_EXPORT_TOKEN = requiredEnv("SEO_EXPORT_TOKEN");
const MAX_OUTPUT_FILES = readPositiveInteger(
  process.env.SEO_MAX_OUTPUT_FILES,
  19_000,
);
const DIST_DIR = path.resolve(process.cwd(), "dist");
const PAGE_SIZE = 1_000;
const SITEMAP_PAGE_SIZE = 45_000;
const STATIC_GAME_LINK_LIMIT = 12;
const RELATED_GAME_LINK_LIMIT = 4;
const NOINDEX_PAGES = [
  ["search.html", "搜索 | 玩什么 PlayWhat", "搜索在线网页游戏。", "/search"],
  ["favorites.html", "我的收藏 | 玩什么 PlayWhat", "查看保存在当前浏览器中的游戏收藏。", "/favorites"],
  ["admin.html", "管理后台 | 玩什么 PlayWhat", "玩什么管理后台。", "/admin"],
  ["admin/games.html", "游戏管理 | 玩什么 PlayWhat", "玩什么游戏管理后台。", "/admin/games"],
  ["admin/sources.html", "数据源管理 | 玩什么 PlayWhat", "玩什么数据源管理后台。", "/admin/sources"],
  ["admin/duplicates.html", "重复游戏处理 | 玩什么 PlayWhat", "玩什么重复游戏处理后台。", "/admin/duplicates"],
  ["admin/cron-jobs.html", "定时任务 | 玩什么 PlayWhat", "玩什么定时任务管理后台。", "/admin/cron-jobs"],
  ["admin/analytics.html", "数据看板 | 玩什么 PlayWhat", "玩什么数据分析后台。", "/admin/analytics"],
] as const;

interface PageMetadata {
  title: string;
  description: string;
  pathname: string;
  image?: string | null;
  type?: "website" | "article";
  noIndex?: boolean;
  bodyHtml?: string;
  jsonLd?: Record<string, unknown>;
}

async function main() {
  const startedAt = Date.now();
  const template = await readFile(path.join(DIST_DIR, "index.html"), "utf8");
  const games = await fetchSeoGames();
  await assertOutputFileLimit(games.length);
  const featuredGames = games.slice(0, STATIC_GAME_LINK_LIMIT);
  const highQualityGames = games
    .filter((game) => (game.sourceQualityScore ?? 0) > 0.8)
    .sort(
      (left, right) =>
        (right.sourceQualityScore ?? 0) - (left.sourceQualityScore ?? 0),
    )
    .slice(0, STATIC_GAME_LINK_LIMIT);
  const landingGames = new Map(
    SEO_LANDING_PAGES.map((landing) => [
      landing.path,
      games.filter((game) => matchesLanding(game, landing)).slice(0, STATIC_GAME_LINK_LIMIT),
    ]),
  );
  const relatedGames = buildRelatedGames(games);

  await Promise.all([
    writePage(template, "index.html", {
      title: "玩什么 PlayWhat — 告诉我你想怎么玩",
      description:
        "告诉 AI 你现在想怎么玩，它会结合时间、心情、人数和设备，从在线网页游戏中挑出更合适的选择。",
      pathname: "/",
      bodyHtml: renderStaticBody(
        "玩什么 PlayWhat",
        "告诉 AI 你现在想怎么玩，它会结合时间、心情、人数和设备，从在线网页游戏中挑出更合适的选择。",
        SEO_LANDING_PAGES.map((landing) => ({
          path: landing.path,
          label: landing.heading,
        })),
        featuredGames,
      ),
    }),
    writePage(template, "games.html", {
      title: "在线网页游戏大全｜按时长、人数和设备筛选",
      description:
        "浏览无需下载的在线网页游戏，按类型、单局时长、玩家人数、设备和评分筛选。",
      pathname: "/games",
      bodyHtml: renderStaticBody(
        "在线网页游戏大全",
        "浏览无需下载的在线网页游戏，按类型、单局时长、玩家人数、设备和评分筛选。",
        SEO_LANDING_PAGES.map((landing) => ({
          path: landing.path,
          label: landing.heading,
        })),
        featuredGames,
      ),
    }),
    writePage(template, "high-quality.html", {
      title: "高品质在线游戏精选 | 玩什么 PlayWhat",
      description: "按质量分筛选的高品质在线网页游戏，免下载直接游玩。",
      pathname: "/high-quality",
      bodyHtml: renderStaticBody(
        "高品质在线游戏精选",
        "按质量分筛选的高品质在线网页游戏，免下载直接游玩。",
        [{ path: "/games", label: "浏览全部游戏" }],
        highQualityGames,
      ),
    }),
    ...SEO_LANDING_PAGES.map((landing) =>
      writePage(template, `games/${landing.slug}.html`, {
        title: landing.title,
        description: landing.description,
        pathname: landing.path,
        bodyHtml: renderLandingBody(
          landing,
          landingGames.get(landing.path) ?? [],
        ),
      }),
    ),
    ...NOINDEX_PAGES.map(([file, title, description, pathname]) =>
      writePage(template, file, {
        title,
        description,
        pathname,
        noIndex: true,
      }),
    ),
    writePage(template, "404.html", {
      title: "页面不存在 | 玩什么 PlayWhat",
      description: "你访问的页面不存在或已经移除。",
      pathname: "/404",
      noIndex: true,
    }),
  ]);

  for (let offset = 0; offset < games.length; offset += 32) {
    await Promise.all(
      games.slice(offset, offset + 32).map((game) => {
        const pathname = `/game/${game.slug}`;
        return writePage(template, `game/${game.slug}.html`, {
          title: `${game.title}（${game.titleOriginal}）| 玩什么 PlayWhat`,
          description: truncate(game.description, 155),
          pathname,
          image: game.thumbnail,
          type: "article",
          bodyHtml: renderGameBody(game, relatedGames.get(game.slug) ?? []),
          jsonLd: buildVideoGameJsonLd(game, `${SITE_URL}${pathname}`),
        });
      }),
    );
  }

  await writeSitemaps(games);
  await writeFile(
    path.join(DIST_DIR, "robots.txt"),
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      "",
    ].join("\n"),
  );

  console.log(
    `[seo] generated ${games.length} game pages and ${SEO_LANDING_PAGES.length} landing pages in ${Math.round((Date.now() - startedAt) / 1000)}s`,
  );
}

async function fetchSeoGames(): Promise<SeoGameMetadata[]> {
  const games: SeoGameMetadata[] = [];
  const slugs = new Set<string>();
  let cursor = 0;
  let expectedTotal: number | null = null;
  let catalogVersion: string | null = null;

  for (;;) {
    const url = new URL("/api/games/seo/export", API_BASE_URL);
    url.searchParams.set("cursor", String(cursor));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    const response = parseExportResponse(await fetchJson(url));

    if (expectedTotal == null) expectedTotal = response.total;
    if (catalogVersion == null) catalogVersion = response.catalogVersion;
    if (response.total !== expectedTotal) {
      throw new Error("SEO export total changed during build");
    }
    if (response.catalogVersion !== catalogVersion) {
      throw new Error("SEO catalog changed during build");
    }

    for (const game of response.items) {
      if (
        game.slug.length > 180 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.slug)
      ) {
        throw new Error(`invalid game slug: ${game.slug}`);
      }
      if (slugs.has(game.slug)) {
        throw new Error(`duplicate game slug: ${game.slug}`);
      }
      slugs.add(game.slug);
      games.push(game);
    }

    if (response.nextCursor == null) break;
    if (response.nextCursor <= cursor) {
      throw new Error("SEO export cursor did not advance");
    }
    cursor = response.nextCursor;
  }

  if (games.length !== expectedTotal) {
    throw new Error(
      `SEO export count mismatch: expected ${expectedTotal}, received ${games.length}`,
    );
  }

  return games;
}

async function fetchJson(url: URL): Promise<unknown> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${SEO_EXPORT_TOKEN}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      continue;
    }

    if (response.ok) return response.json();
    if (response.status < 500 && response.status !== 429) {
      throw new Error(`SEO export request failed: ${response.status}`);
    }
    if (attempt === 3) {
      throw new Error(`SEO export request failed: ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw new Error("SEO export request failed");
}

function parseExportResponse(value: unknown): SeoGameExportResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("invalid SEO export response");
  }
  const total = readInteger(value, "total");
  const nextCursor =
    value.nextCursor == null
      ? null
      : readInteger(value, "nextCursor");
  return {
    items: value.items.map(parseSeoGame),
    total,
    nextCursor,
    catalogVersion: readString(value, "catalogVersion"),
  };
}

function parseSeoGame(value: unknown): SeoGameMetadata {
  if (!isRecord(value)) throw new Error("invalid SEO game metadata");
  const updatedAt = readString(value, "updatedAt");
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error(`invalid updatedAt for ${readString(value, "slug")}`);
  }
  return {
    slug: readString(value, "slug"),
    title: readString(value, "title"),
    titleOriginal: readString(value, "titleOriginal"),
    description: readString(value, "description"),
    thumbnail: readNullableString(value, "thumbnail"),
    genre: readNullableString(value, "genre"),
    sessionLengthMax: readNullableInteger(value, "sessionLengthMax"),
    minPlayers: readInteger(value, "minPlayers"),
    maxPlayers: readInteger(value, "maxPlayers"),
    mood: readString(value, "mood"),
    sourceQualityScore: readNullableNumber(value, "sourceQualityScore"),
    desktop: readBoolean(value, "desktop"),
    mobile: readBoolean(value, "mobile"),
    gameLanguage: readString(value, "gameLanguage"),
    multiplayer: readBoolean(value, "multiplayer"),
    developer: readNullableString(value, "developer"),
    publisher: readNullableString(value, "publisher"),
    releaseDate: readNullableString(value, "releaseDate"),
    updatedAt,
  };
}

async function assertOutputFileLimit(gameCount: number) {
  const existingFiles = await countFiles(DIST_DIR);
  const fixedHtmlFiles = 2 + SEO_LANDING_PAGES.length + NOINDEX_PAGES.length + 1;
  const sitemapFiles = 4 + Math.ceil(gameCount / SITEMAP_PAGE_SIZE);
  const projectedFiles =
    existingFiles + gameCount + fixedHtmlFiles + sitemapFiles;
  if (projectedFiles > MAX_OUTPUT_FILES) {
    throw new Error(
      `SEO build would create ${projectedFiles} files; limit is ${MAX_OUTPUT_FILES}`,
    );
  }
}

async function countFiles(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? countFiles(path.join(directory, entry.name))
        : Promise.resolve(1),
    ),
  );
  return counts.reduce((total, count) => total + count, 0);
}

async function writePage(
  template: string,
  relativePath: string,
  metadata: PageMetadata,
) {
  const target = path.join(DIST_DIR, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, renderHtml(template, metadata));
}

function renderStaticBody(
  heading: string,
  description: string,
  links: Array<{ path: string; label: string }>,
  games: SeoGameMetadata[],
): string {
  const allLinks = [
    ...links,
    ...games.map((game) => ({
      path: `/game/${game.slug}`,
      label: game.title,
    })),
  ];
  return `<main><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(description)}</p><nav>${allLinks
    .map(
      (link) =>
        `<a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>`,
    )
    .join(" ")}</nav></main>`;
}

function renderLandingBody(
  landing: SeoLandingPage,
  games: SeoGameMetadata[],
): string {
  const links = [
    ...landing.relatedPaths.map((relatedPath) => {
      const related = SEO_LANDING_PAGES.find((page) => page.path === relatedPath);
      return {
        path: relatedPath,
        label: related?.heading ?? relatedPath,
      };
    }),
    ...games.map((game) => ({
      path: `/game/${game.slug}`,
      label: game.title,
    })),
  ];
  return `<main><h1>${escapeHtml(landing.heading)}</h1>${landing.intro
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("")}<p>${escapeHtml(landing.aiExplanation)}</p><nav>${links
    .map(
      (link) =>
        `<a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>`,
    )
    .join(" ")}</nav></main>`;
}

function renderGameBody(
  game: SeoGameMetadata,
  relatedGames: SeoGameMetadata[],
): string {
  const image = game.thumbnail
    ? `<img src="${escapeHtml(new URL(game.thumbnail, SITE_URL).toString())}" alt="${escapeHtml(game.title)}" width="640" height="400" decoding="async" />`
    : "";
  const originalTitle =
    game.titleOriginal !== game.title
      ? `<p>${escapeHtml(game.titleOriginal)}</p>`
      : "";
  const genre = game.genre ? `<p>类型：${escapeHtml(game.genre)}</p>` : "";
  const links = [
    { path: "/games", label: "浏览全部游戏" },
    ...relatedGames.map((related) => ({
      path: `/game/${related.slug}`,
      label: related.title,
    })),
  ];
  return `<main><article><h1>${escapeHtml(game.title)}</h1>${originalTitle}${image}<p>${escapeHtml(game.description)}</p>${genre}</article><nav>${links
    .map(
      (link) =>
        `<a href="${escapeHtml(link.path)}">${escapeHtml(link.label)}</a>`,
    )
    .join(" ")}</nav></main>`;
}

function matchesLanding(
  game: SeoGameMetadata,
  landing: SeoLandingPage,
): boolean {
  const { filters } = landing;
  if (filters.genre && game.genre !== filters.genre) return false;
  if (
    filters.duration != null &&
    (game.sessionLengthMax == null || game.sessionLengthMax > filters.duration)
  ) {
    return false;
  }
  if (filters.players === "multi" && !game.multiplayer) return false;
  if (
    typeof filters.players === "number" &&
    (game.minPlayers > filters.players || game.maxPlayers < filters.players)
  ) {
    return false;
  }
  if (filters.platform === "mobile" && !game.mobile) return false;
  if (filters.platform === "desktop" && !game.desktop) return false;
  if (
    filters.mood === "relaxing" &&
    !game.mood.includes('"relaxing"') &&
    !game.mood.includes('"chill"')
  ) {
    return false;
  }
  return true;
}

function buildRelatedGames(
  games: SeoGameMetadata[],
): Map<string, SeoGameMetadata[]> {
  const buckets = new Map<string, SeoGameMetadata[]>();
  for (const game of games) {
    if (!game.genre) continue;
    const bucket = buckets.get(game.genre) ?? [];
    bucket.push(game);
    buckets.set(game.genre, bucket);
  }

  const related = new Map<string, SeoGameMetadata[]>();
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    for (let index = 0; index < bucket.length; index += 1) {
      const items: SeoGameMetadata[] = [];
      const count = Math.min(RELATED_GAME_LINK_LIMIT, bucket.length - 1);
      for (let offset = 1; offset <= count; offset += 1) {
        items.push(bucket[(index + offset) % bucket.length]);
      }
      related.set(bucket[index].slug, items);
    }
  }
  return related;
}

function renderHtml(template: string, metadata: PageMetadata): string {
  const canonical = `${SITE_URL}${metadata.pathname}`;
  const tags = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="robots" content="${metadata.noIndex ? "noindex, nofollow" : "index, follow"}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    '<meta property="og:site_name" content="玩什么 PlayWhat" />',
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:type" content="${metadata.type ?? "website"}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
  ];

  if (metadata.image) {
    const image = new URL(metadata.image, SITE_URL).toString();
    tags.push(
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    );
  }
  if (metadata.jsonLd) {
    const json = JSON.stringify(metadata.jsonLd).replace(/</g, "\\u003c");
    tags.push(`<script id="page-json-ld" type="application/ld+json">${json}</script>`);
  }

  const html = template
    .replace(/\s*<title>[\s\S]*?<\/title>/i, "")
    .replace(/\s*<meta\s+name="description"[\s\S]*?>/i, "")
    .replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
  return metadata.bodyHtml
    ? html.replace(
        '<div id="root"></div>',
        `<div id="root">${metadata.bodyHtml}</div>`,
      )
    : html;
}

async function writeSitemaps(games: SeoGameMetadata[]) {
  const sitemapDir = path.join(DIST_DIR, "sitemaps");
  await mkdir(sitemapDir, { recursive: true });

  const staticEntries = ["/", "/games", "/high-quality"].map((pathname) => ({
    location: `${SITE_URL}${pathname}`,
  }));
  const landingEntries = SEO_LANDING_PAGES.map((landing) => ({
    location: `${SITE_URL}${landing.path}`,
  }));
  const gameChunks = chunk(games, SITEMAP_PAGE_SIZE);

  await Promise.all([
    writeFile(path.join(sitemapDir, "static.xml"), renderUrlSet(staticEntries)),
    writeFile(path.join(sitemapDir, "landings.xml"), renderUrlSet(landingEntries)),
    ...gameChunks.map((items, index) =>
      writeFile(
        path.join(sitemapDir, `games-${index + 1}.xml`),
        renderUrlSet(
          items.map((game) => ({
            location: `${SITE_URL}/game/${game.slug}`,
            lastModified: game.updatedAt,
          })),
        ),
      ),
    ),
  ]);

  const sitemapLocations = [
    `${SITE_URL}/sitemaps/static.xml`,
    `${SITE_URL}/sitemaps/landings.xml`,
    ...gameChunks.map(
      (_, index) => `${SITE_URL}/sitemaps/games-${index + 1}.xml`,
    ),
  ];
  await writeFile(
    path.join(DIST_DIR, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapLocations
      .map(
        (location) =>
          `<sitemap><loc>${escapeXml(location)}</loc></sitemap>`,
      )
      .join("")}</sitemapindex>`,
  );
}

function renderUrlSet(
  entries: Array<{ location: string; lastModified?: string }>,
): string {
  const urls = entries
    .map(
      ({ location, lastModified }) =>
        `<url><loc>${escapeXml(location)}</loc>${lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : ""}</url>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function readString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string") throw new Error(`invalid ${key}`);
  return field;
}

function readNullableString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const field = value[key];
  if (field === null) return null;
  if (typeof field !== "string") throw new Error(`invalid ${key}`);
  return field;
}

function readNullableInteger(
  value: Record<string, unknown>,
  key: string,
): number | null {
  if (value[key] === null) return null;
  return readInteger(value, key);
}

function readNullableNumber(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const field = value[key];
  if (field === null) return null;
  if (typeof field !== "number" || !Number.isFinite(field)) {
    throw new Error(`invalid ${key}`);
  }
  return field;
}

function readBoolean(value: Record<string, unknown>, key: string): boolean {
  const field = value[key];
  if (typeof field !== "boolean") throw new Error(`invalid ${key}`);
  return field;
}

function readInteger(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (!Number.isSafeInteger(field) || Number(field) < 0) {
    throw new Error(`invalid ${key}`);
  }
  return Number(field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error("SEO_MAX_OUTPUT_FILES must be a positive integer");
  }
  return Number(value);
}

function normalizeApiUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("SEO_API_BASE_URL or VITE_API_BASE_URL is required");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("SEO API URL must use HTTP or HTTPS");
  }
  return url.origin;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(value: string): string {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

await main();
