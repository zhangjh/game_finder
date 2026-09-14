/**
 * 分享海报（DANTE-7，T9.4 分享链路）。
 *
 * canvas 生成竖版游戏推荐图（750×1250，适配朋友圈/小红书），
 * 包含：品牌 + 封面 + 标题/简介 + 二维码 + 落地链接。
 * 二维码内容为带 UTM 的详情页链接（默认微信渠道，便于看板归因）。
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { useI18n } from "../i18n";
import type { ShareTarget } from "./share-menu";

const W = 750;
const H = 1250;

const FONT =
  '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif';

function loadImage(src: string, crossOrigin = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 按字符宽度换行（中文按字切分），返回最多 maxLines 行 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line += ch;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  return lines;
}

/** 以 cover 方式绘制图片到矩形区域（裁剪超出部分） */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0,
): void {
  ctx.save();
  if (radius > 0) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    ctx.clip();
  }
  const iw = img.width as number;
  const ih = img.height as number;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x - (dw - w) / 2, y - (dh - h) / 2, dw, dh);
  ctx.restore();
}

export function SharePosterModal({
  target,
  url,
  onClose,
}: {
  target: ShareTarget;
  url: string;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"rendering" | "ready" | "failed">("rendering");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setStatus("rendering");
    renderPoster(ctx, target, url, lang === "en").then(() => setStatus("ready")).catch(() => setStatus("failed"));
  }, [target, url, lang]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${target.slug}-分享海报.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("sharePosterTitle")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-muted transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label={t("sharePosterClose")}
          >
            ✕
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <canvas ref={canvasRef} className="block h-auto w-full" />
          {status === "failed" && (
            <div className="bg-neutral-900 p-4 text-center text-xs text-muted">
              {t("sharePosterFailed")}
            </div>
          )}
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={download}
            disabled={status !== "ready"}
            className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {status === "rendering" ? t("sharePosterRendering") : t("sharePosterSave")}
          </button>
          <p className="mt-2 text-center text-xs text-muted">
            {t("sharePosterMobileHint")}
          </p>
        </div>
      </div>
    </div>
  );
}

async function renderPoster(
  ctx: CanvasRenderingContext2D,
  target: ShareTarget,
  url: string,
  en: boolean,
): Promise<void> {
  // 背景渐变
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0b1220");
  grad.addColorStop(0.6, "#132138");
  grad.addColorStop(1, "#0b1220");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 顶部品牌栏
  ctx.fillStyle = "rgba(148,163,184,0.95)";
  ctx.font = `600 22px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("玩什么 PlayWhat", 40, 60);
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = "rgba(148,163,184,0.7)";
  ctx.save();
  ctx.textAlign = "right";
  ctx.fillText("playwhat.cc", W - 40, 60);
  ctx.restore();

  // 分割线
  ctx.strokeStyle = "rgba(148,163,184,0.18)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(40, 82);
  ctx.lineTo(W - 40, 82);
  ctx.stroke();

  // 封面图（670×380）
  const heroX = 40;
  const heroY = 104;
  const heroW = W - 80;
  const heroH = 380;
  const thumb = target.thumbnail;
  const img = thumb ? await loadImage(thumb) : null;
  if (img) {
    drawCover(ctx, img, heroX, heroY, heroW, heroH, 20);
  } else {
    ctx.fillStyle = "rgba(30,41,59,0.9)";
    roundedRect(ctx, heroX, heroY, heroW, heroH, 20);
    ctx.fill();
    ctx.fillStyle = "rgba(148,163,184,0.8)";
    ctx.font = `600 30px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(target.title, W / 2, heroY + heroH / 2);
    ctx.textAlign = "left";
  }

  // 标题（最多 2 行）
  ctx.fillStyle = "#f1f5f9";
  ctx.font = `700 40px ${FONT}`;
  const titleLines = wrapText(ctx, target.title, heroW, 2);
  let y = heroY + heroH + 34;
  for (const line of titleLines) {
    ctx.fillText(line, heroX, y);
    y += 50;
  }
  y += 6;

  // 简介（最多 3 行）
  ctx.fillStyle = "rgba(203,213,225,0.9)";
  ctx.font = `24px ${FONT}`;
  const desc = en ? target.title : target.description || target.title;
  const descWrap = wrapText(ctx, desc.slice(0, 120), heroW, 3);
  for (const line of descWrap) {
    ctx.fillText(line, heroX, y);
    y += 36;
  }

  // 二维码（深底亮码）
  let qr: string | null = null;
  try {
    qr = await QRCode.toDataURL(url, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#e2e8f0", light: "#0f1b2d" },
    });
  } catch {
    qr = null;
  }
  const qrSize = 190;
  const qrX = heroX;
  const qrY = 940;
  if (qr) {
    const qrImg = new Image();
    await new Promise<void>((resolve) => {
      qrImg.onload = () => resolve();
      qrImg.onerror = () => resolve();
      qrImg.src = qr;
    });
    roundedRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 16);
    ctx.fillStyle = "#0f1b2d";
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `18px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("扫码开始玩", qrX + qrSize / 2, qrY + qrSize + 34);
    ctx.textAlign = "left";
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  }

  // 底部：URL + 来源
  ctx.fillStyle = "rgba(148,163,184,0.65)";
  ctx.font = `16px ${FONT}`;
  ctx.save();
  ctx.textAlign = "right";
  ctx.fillText(url, W - 40, H - 40);
  ctx.restore();
  const shortUrl = url.length > 64 ? `${url.slice(0, 64)}…` : url;
  ctx.fillStyle = "rgba(148,163,184,0.55)";
  ctx.font = `15px ${FONT}`;
  ctx.fillText(`分享自 ${en ? "PlayWhat" : "玩什么"}`, 40, H - 40);
  ctx.fillText(shortUrl, 40, H - 16);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}