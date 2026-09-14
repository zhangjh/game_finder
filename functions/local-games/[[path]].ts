/**
 * CF Pages Function: /local-games/* → R2 同源代理
 *
 * Cloudflare Pages _redirects 不支持跨域代理（外部 URL），
 * 导致 /local-games/* 在 playwhat.cc 上返回 404。
 * 此 Function 在同域下代理 R2 内容，保持 B1 localStorage 同源桥。
 *
 * 路径匹配：/local-games/:collection/:game/index.html 等
 */
export const onRequest: PagesFunction = async (context) => {
  const req = context.request;
  const url = new URL(req.url);

  // 目标 R2 地址
  const r2Url = `https://r2.playwhat.cc${url.pathname}${url.search}`;

  try {
    const res = await fetch(r2Url, {
      method: req.method,
      headers: req.headers,
      redirect: "follow",
    });

    // 复制响应并设置正确的 CORS/cache 头
    const newHeaders = new Headers(res.headers);
    // 去掉 R2 特有的头，避免冲突
    newHeaders.delete("x-amz-request-id");
    newHeaders.delete("x-amz-id-2");
    // 本地游戏 HTML/JS/CSS 长缓存
    const ext = url.pathname.split(".").pop()?.toLowerCase();
    if (["js","css","png","jpg","jpeg","gif","webp","svg","woff","woff2","ttf","ico"].includes(ext ?? "")) {
      newHeaders.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    }
    newHeaders.set("X-Content-Type-Options", "nosniff");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${String(err).slice(0, 100)}`, { status: 502 });
  }
};
