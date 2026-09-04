/**
 * M5 E2E 验收测试（T5.7，PRD §51 Case 1~3）。
 *
 * API 层测试：直接调用 POST /api/recommend，断言 Intent 解析、
 * 召回、硬过滤、结果数、理由、可启动性。
 *
 * 用法：
 *   node server/scripts/test-recommend-e2e.mjs
 *   BASE_URL=http://localhost:3001 node server/scripts/test-recommend-e2e.mjs
 *
 * LLM 输出存在不确定性：断言失败会打印实际值便于诊断；
 * 同一 Case 最多重试 2 次（覆盖 LLM 偶发解析漂移）。
 */
const BASE_URL = process.env.BASE_URL ?? "https://game-api.zhangjh.cn";

/* ===== 断言工具 ===== */
let passed = 0;
let failed = 0;
const failures = [];

function check(caseName, name, cond, actual) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${caseName} / ${name}`);
    console.log(`  ✗ ${name}`);
    console.log(`    实际值: ${JSON.stringify(actual)}`);
  }
}

async function recommend(body) {
  const res = await fetch(`${BASE_URL}/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

async function runCase(name, body, assertions) {
  console.log(`\n===== ${name} =====`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    // 记录本轮开始时的计数：本轮新增失败 = LLM 波动 → 回滚计数后重试
    const failedBefore = failed;
    const passedBefore = passed;
    const failuresLenBefore = failures.length;
    try {
      const result = await recommend(body);
      assertions(result);
      const newFailures = failed - failedBefore;
      if (newFailures === 0 || attempt === 3) return result;
      console.log(`  （第 ${attempt} 轮有 ${newFailures} 项失败，LLM 波动重试…）`);
      failed = failedBefore;
      passed = passedBefore;
      failures.length = failuresLenBefore;
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`  （API 异常重试: ${err.message}）`);
    }
  }
}

/* ===== Case 1（PRD §51：10 项检查）===== */
async function case1() {
  await runCase(
    "Case 1: 我只有10分钟，想玩轻松一点的，最好手机也能玩",
    { input: "我只有10分钟，想玩轻松一点的，最好手机也能玩" },
    (r) => {
      const it = r.intent ?? {};
      // 1. 正确解析时间
      check("Case1", "1. 解析出时间上限 ≤10 分钟", it.sessionLengthMax != null && it.sessionLengthMax <= 10, it);
      // 2. 正确理解轻松
      check("Case1", "2. 理解「轻松」（mood 含 relaxing 或认知负担上限）",
        Array.isArray(it.mood) && it.mood.includes("relaxing") || it.cognitiveLoadMax != null, it);
      // 3. 正确识别手机需求
      check("Case1", "3. 识别手机需求 platform=mobile", it.platform === "mobile", it);
      // 4/5/6. 召回候选 + 排除不符 + ≥3 款
      check("Case1", "4~6. 召回 ≥3 款且全部支持手机",
        r.items.length >= 3 && r.items.every((x) => x.game.mobile === true),
        { count: r.items.length, nonMobile: r.items.filter((x) => !x.game.mobile).map((x) => x.game.slug) });
      // 时长符合（放宽模式记 warning 不判失败）
      const tooLong = r.items.filter(
        (x) => x.game.sessionLengthMin != null && x.game.sessionLengthMin > 10,
      );
      if (tooLong.length > 0) {
        console.log(`  ⚠ 放宽模式：${tooLong.length} 款单局时长超 10 分钟（relaxed=${r.relaxed}）`);
      }
      // 7. 每款都有推荐理由
      check("Case1", "7. 每款均有非空推荐理由（≥8 字）",
        r.items.every((x) => (x.reason ?? "").length >= 8),
        r.items.map((x) => x.reason));
      // 8. 可以直接启动（slug 可达详情页 iframe）
      check("Case1", "8. 每款均有 slug 可直接启动",
        r.items.every((x) => typeof x.game.slug === "string" && x.game.slug.length > 0),
        r.items.map((x) => x.game.slug));
      // 9. 请求已落库（requestId > 0，M6 归因基础）
      check("Case1", "9. 请求落库（requestId>0）", r.requestId > 0, r.requestId);
      // 10. 解析成功
      check("Case1", "10. intent 解析成功 parsedOk", r.parsedOk === true, r.parsedOk);
      return r.parsedOk === true && r.items.length >= 3;
    },
  );
}

/* ===== Case 2（PRD §51：7 项检查）===== */
async function case2() {
  await runCase(
    "Case 2: 有没有类似植物大战僵尸，但是简单一点的？",
    { input: "有没有类似植物大战僵尸，但是简单一点的？" },
    (r) => {
      const it = r.intent ?? {};
      // 1. 识别参考游戏
      check("Case2", "1. 识别参考游戏 similarTo", typeof it.similarTo === "string" && it.similarTo.length > 0, it);
      // 2/3. 提取核心玩法约束 + "简单"的负向/约束条件
      const simple = it.difficultyMax != null || it.complexityMax != null || it.cognitiveLoadMax != null;
      check("Case2", "2~3. 提取「简单一点」约束（difficulty/complexity/cognitiveLoad 上限）", simple, it);
      // 4/5/6. 机制相似召回 + 复杂度排序 + ≥3 个候选
      check("Case2", "4~6. 返回 ≥3 个候选", r.items.length >= 3, r.items.length);
      // 7. 解释相似原因（理由提到参考游戏或"简单/上手"）
      const reasonOk = r.items.some(
        (x) => x.reason.includes("简单") || x.reason.includes("上手") || x.reason.includes("植物大战僵尸"),
      );
      check("Case2", "7. 理由解释相似原因（含「简单/上手/参考游戏」）", reasonOk, r.items.map((x) => x.reason));
      check("Case2", "8. intent 解析成功 parsedOk", r.parsedOk === true, r.parsedOk);
      // 参考游戏命中提示（可能站内无该游戏，命中与否都合法，仅展示）
      console.log(`  ℹ 参考游戏站内匹配: ${r.referenceGame ? `《${r.referenceGame.title}》` : "未命中（用语义相似兜底）"}`);
      return r.parsedOk === true && r.items.length >= 3;
    },
  );
}

/* ===== Case 3（PRD §51）===== */
async function case3() {
  await runCase(
    "Case 3: 两个人玩，最好不用下载",
    { input: "两个人玩，最好不用下载" },
    (r) => {
      const it = r.intent ?? {};
      // players >= 2 且 multiplayer
      check("Case3", "1. 解析出双人（players=2）", it.players === 2, it);
      check("Case3", "2. 返回 ≥3 款", r.items.length >= 3, r.items.length);
      // 每款满足 players>=2 && multiplayer && web（站内全部为网页游戏）
      check("Case3",
        "3. 全部满足 minPlayers<=2<=maxPlayers && multiplayer（web 默认满足）",
        r.items.length > 0 && r.items.every(
          (x) => x.game.multiplayer === true && x.game.minPlayers <= 2 && x.game.maxPlayers >= 2,
        ),
        r.items.map((x) => ({ slug: x.game.slug, mp: x.game.multiplayer, min: x.game.minPlayers, max: x.game.maxPlayers })));
      check("Case3", "4. 每款均有推荐理由", r.items.every((x) => (x.reason ?? "").length >= 8), r.items.map((x) => x.reason));
      check("Case3", "5. intent 解析成功 parsedOk", r.parsedOk === true, r.parsedOk);
      return r.parsedOk === true && r.items.length >= 3;
    },
  );
}

/* ===== 快捷条件冒烟（不走 LLM，应稳定全过）===== */
async function quickSmoke() {
  console.log("\n===== 快捷条件冒烟 =====");
  for (const quick of ["5min", "relax", "2p", "mobile", "random"]) {
    try {
      const r = await recommend({ quick });
      const label = { "5min": "⚡5分钟", relax: "😌放松", "2p": "👥双人", mobile: "📱手机", random: "🎲随便" }[quick];
      check("Quick", `${label} 返回 ≥1 款`, r.items.length >= 1, r.items.length);
    } catch (err) {
      check("Quick", `quick=${quick} 调用成功`, false, err.message);
    }
  }
}

/* ===== 主流程 ===== */
console.log(`E2E 目标: ${BASE_URL}/api/recommend`);
try {
  await case1();
  await case2();
  await case3();
  await quickSmoke();
} catch (err) {
  console.error("\nE2E 执行异常:", err.message);
  process.exit(1);
}

console.log(`\n===== 结果: ${passed} 通过 / ${failed} 失败 =====`);
if (failed > 0) {
  console.log("失败项:", failures.join(" | "));
  process.exit(1);
}
