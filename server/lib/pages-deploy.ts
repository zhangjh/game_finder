const DEBOUNCE_MS = 30_000;
const RETRY_DELAY_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

let timer: NodeJS.Timeout | undefined;
let running = false;
let pending = false;
const reasons = new Set<string>();

export function schedulePagesDeploy(reason: string): void {
  if (!process.env.CLOUDFLARE_PAGES_DEPLOY_HOOK_URL) return;
  reasons.add(reason);
  if (running) {
    pending = true;
    return;
  }
  queuePagesDeploy(DEBOUNCE_MS);
}

function queuePagesDeploy(delay: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void triggerPagesDeploy();
  }, delay);
}

async function triggerPagesDeploy(): Promise<void> {
  const url = process.env.CLOUDFLARE_PAGES_DEPLOY_HOOK_URL;
  if (!url || running) return;
  running = true;
  const triggerReasons = [...reasons];
  reasons.clear();
  let retryableFailure = false;

  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (attempt === 2) {
          retryableFailure = true;
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }

      if (response.ok) {
        console.log(
          `[pages-deploy] triggered (${triggerReasons.join(", ")})`,
        );
        return;
      }
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (attempt === 2) {
        retryableFailure = true;
        throw new Error(`HTTP ${response.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  } catch (error) {
    console.error("[pages-deploy] trigger failed:", error);
  } finally {
    running = false;
    if (retryableFailure) {
      for (const reason of triggerReasons) reasons.add(reason);
      pending = false;
      queuePagesDeploy(RETRY_DELAY_MS);
    } else if (pending || reasons.size > 0) {
      pending = false;
      schedulePagesDeploy("changes-during-deploy");
    }
  }
}
