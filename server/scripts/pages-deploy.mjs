const REQUEST_TIMEOUT_MS = 15_000;

export async function triggerPagesDeploy(reason) {
  const hookUrl = process.env.CLOUDFLARE_PAGES_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    console.warn(`[pages-deploy] 未配置 Hook，跳过重建 (${reason})`);
    return;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    let response;
    try {
      response = await fetch(hookUrl, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }

    if (response.ok) {
      console.log(`[pages-deploy] 已触发重建 (${reason})`);
      return;
    }
    if (response.status < 500 && response.status !== 429) {
      throw new Error(`Pages Deploy Hook HTTP ${response.status}`);
    }
    if (attempt === 2) {
      throw new Error(`Pages Deploy Hook HTTP ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
