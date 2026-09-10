/**
 * 把本地游戏源码（web/public/local-games/）发布到 Cloudflare R2 公开桶。
 *
 * 前置：
 *   - pnpm build:local-catalog 已生成 web/public/local-games/（4 个合集）
 *   - R2 桶已创建并开启 Public access（或绑定自定义域名），
 *     且配置了 S3 兼容凭据：
 *       R2_ACCOUNT_ID        Cloudflare 账号 ID
 *       R2_ACCESS_KEY_ID     R2 S3 API 访问密钥
 *       R2_SECRET_ACCESS_KEY R2 S3 API 密钥
 *       R2_BUCKET            桶名
 *
 * 用法：
 *   pnpm publish:local-games
 *
 * 幂等：先 HEAD 对比 size，已存在且大小一致则跳过；可重复执行。
 * 上传完成后，把桶公开域名（如 https://local-games.example.com）配置为
 * LOCAL_GAMES_BASE_URL 后执行 pnpm import:local 写库。
 */
import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

loadDotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_DIR = path.join(WORKSPACE_ROOT, "web", "public", "local-games");

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;

const CONCURRENCY = Number(process.env.R2_UPLOAD_CONCURRENCY ?? 24);
const MAX_ATTEMPTS = 3;

const MIME_BY_EXT = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "text/xml; charset=utf-8",
  ".plist": "text/xml; charset=utf-8",
  ".manifest": "text/cache-manifest",
  ".mf": "text/cache-manifest",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".swf": "application/x-shockwave-flash",
};

function contentType(key) {
  return MIME_BY_EXT[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

async function walk(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(abs, rel)));
    } else {
      files.push({ key: rel, abs });
    }
  }
  return files;
}

async function withRetry(fn, attempts) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 800 * i));
    }
  }
}

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`本地游戏目录不存在：${SOURCE_DIR}`);
    console.error("先执行 pnpm build:local-catalog 生成后再发布。");
    process.exit(1);
  }
  for (const [value, label] of [
    [ACCOUNT_ID, "R2_ACCOUNT_ID"],
    [ACCESS_KEY_ID, "R2_ACCESS_KEY_ID"],
    [SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY"],
    [BUCKET, "R2_BUCKET"],
  ]) {
    if (!value) {
      console.error(`缺少环境变量 ${label}`);
      process.exit(1);
    }
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });

  const files = await walk(SOURCE_DIR, "local-games");
  console.log(`待同步文件：${files.length}`);

  const startedAt = Date.now();
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;
  let index = 0;

  async function worker() {
    for (;;) {
      const current = index++;
      if (current >= files.length) return;
      const { abs, key } = files[current];
      try {
        const size = (await stat(abs)).size;
        await withRetry(async () => {
          let same = false;
          try {
            const head = await client.send(
              new HeadObjectCommand({ Bucket: BUCKET, Key: key }),
            );
            same = head.ContentLength === size;
          } catch {
            same = false;
          }
          if (same) {
            skipped++;
            return;
          }
          const body = await readFile(abs);
          await client.send(
            new PutObjectCommand({
              Bucket: BUCKET,
              Key: key,
              Body: body,
              ContentType: contentType(key),
            }),
          );
          uploaded++;
        }, MAX_ATTEMPTS);
        if ((current + 1) % 1000 === 0 || current === files.length - 1) {
          console.log(`  进度 ${current + 1}/${files.length}（上传 ${uploaded} / 跳过 ${skipped}）`);
        }
      } catch (err) {
        errors++;
        console.error(`[FAIL] ${key}: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`done: uploaded=${uploaded} skipped=${skipped} errors=${errors} in ${seconds}s`);
  if (errors > 0) process.exitCode = 1;
}

await main();