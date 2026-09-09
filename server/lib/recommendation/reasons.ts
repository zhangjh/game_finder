/**
 * 推荐理由生成（T5.4，PRD §44）。
 *
 * 基于结构化数据（GameIntent 命中维度 + 游戏画像）模板化拼接，
 * 非 LLM 自由发挥——保证每条理由可解释、可测试、零成本零延迟。
 * 每款必须给出理由（PRD 红线："这是一款非常好玩的游戏"式废话不允许）。
 * T1.7：buildReason 支持 zh / en 两种语言。
 */
import {
  GENRE_LABELS_EN,
  MOOD_LABELS,
  MOOD_LABELS_EN,
  type GameIntent,
  type Mood,
  type UiLang,
} from "@game-finder/shared";
import type { ReferenceGame } from "./intent-parser";
import type { RecallCandidate } from "./recall";

function parseArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** 单局时长描述（中/英） */
function sessionText(g: RecallCandidate, lang: UiLang): string {
  const { sessionLengthMin: min, sessionLengthMax: max } = g;
  if (min != null && max != null) {
    return lang === "en"
      ? min === max
        ? `${min} min per round`
        : `${min}-${max} min per round`
      : min === max
        ? `单局 ${min} 分钟`
        : `单局 ${min}~${max} 分钟`;
  }
  if (min != null)
    return lang === "en"
      ? `about ${min} min per round`
      : `单局约 ${min} 分钟起`;
  if (max != null)
    return lang === "en"
      ? `at most ${max} min per round`
      : `单局不超过 ${max} 分钟`;
  return "";
}

/** 心情标签（中/英） */
function moodText(moods: string[], lang: UiLang): string {
  return moods
    .map((m) =>
      lang === "en"
        ? MOOD_LABELS_EN[m as Mood]
        : MOOD_LABELS[m as Mood],
    )
    .filter(Boolean)
    .join("/");
}

/** 类型（中/英）：DB 存中文值，英文界面查映射表 */
function genreText(genre: string | null, lang: UiLang): string {
  if (!genre) return lang === "en" ? "casual" : "休闲";
  if (lang === "en") return GENRE_LABELS_EN[genre] ?? genre;
  return genre;
}

/**
 * 为单个推荐结果生成理由。
 * 按用户 intent 实际命中的维度组织，最多 3 个分句（时间/状态/设备/人数/相似）。
 */
export function buildReason(
  g: RecallCandidate,
  intent: GameIntent,
  reference: ReferenceGame | null,
  lang: UiLang = "zh",
): string {
  const clauses: string[] = [];
  const en = lang === "en";

  /* 时间（场景 B） */
  if (intent.sessionLengthMax != null) {
    const st = sessionText(g, lang);
    if (st) {
      clauses.push(
        g.sessionLengthMin != null &&
          g.sessionLengthMin <= intent.sessionLengthMax
          ? en
            ? `fits your limited time — ${st}, easy to pick up and put down`
            : `你时间有限，这款${st}，随时可玩可停`
          : en
            ? `${st}, with a pace you can control`
            : `这款${st}，节奏可控`,
      );
    }
  } else if (intent.sessionLengthMin != null) {
    const st = sessionText(g, lang);
    if (st)
      clauses.push(
        en ? `${st} — plenty to keep you going` : `这款${st}，够你慢慢玩`,
      );
  }

  /* 心情/状态（场景 C） */
  const moods = intent.mood ?? [];
  if (moods.includes("relaxing") || intent.cognitiveLoadMax != null) {
    const load =
      g.cognitiveLoad <= 2
        ? en
          ? "simple controls and low cognitive load"
          : "操作简单、认知负担低"
        : g.cognitiveLoad <= 3
          ? en
            ? "easy to pick up"
            : "上手轻松"
          : en
            ? "a gentle pace"
            : "节奏舒缓";
    const mood = moodText(moods, lang);
    clauses.push(
      mood
        ? en
          ? `leans ${mood}, ${load} — matches your current mood`
          : `${mood}向，${load}，适合现在的状态`
        : en
          ? `${load} — great for unwinding`
          : `${load}，适合放松一下`,
    );
  } else if (moods.includes("brain_burn") || intent.cognitiveLoadMin != null) {
    clauses.push(
      g.cognitiveLoad >= 4
        ? en
          ? "seriously brain-burning — the more you play, the deeper it gets"
          : "硬核烧脑，越玩越上头"
        : en
          ? "takes planning and has real strategic depth"
          : "需要动脑规划，有策略深度",
    );
  } else if (moods.length > 0) {
    const mood = moodText(moods, lang);
    if (mood) {
      const gameMoods = parseArray(g.mood);
      const moodSet = moods as string[];
      clauses.push(
        gameMoods.some((m) => moodSet.includes(m))
          ? en
            ? `${mood} atmosphere, through and through`
            : `${mood}氛围拉满`
          : en
            ? `a ${mood} experience`
            : `${mood}向的体验`,
      );
    }
  }

  /* 难度（场景 F"简单一点"） */
  if (intent.difficultyMax != null && intent.difficultyMax <= 2) {
    clauses.push(
      g.difficulty <= 2
        ? en
          ? "low difficulty, almost zero barrier to entry"
          : "难度友好，几乎零门槛"
        : en
          ? "not too hard, easy to pick up"
          : "难度不高，容易上手",
    );
  } else if (intent.difficultyMin != null && intent.difficultyMin >= 4) {
    clauses.push(
      g.difficulty >= 4
        ? en
          ? "maxed-out challenge"
          : "挑战性拉满"
        : en
          ? "a fair challenge"
          : "有一定挑战",
    );
  }

  /* 人数（场景 E） */
  if (typeof intent.players === "number" && intent.players >= 2) {
    const p = intent.players;
    if (g.maxPlayers >= p && g.minPlayers <= p) {
      clauses.push(
        p === 2
          ? en
            ? "supports 2-player head-to-head"
            : "支持双人对战"
          : en
            ? `supports up to ${g.maxPlayers} players`
            : `支持最多 ${g.maxPlayers} 人`,
      );
    }
  }

  /* 设备（场景 D） */
  if (intent.platform === "mobile") {
    clauses.push(
      g.portrait
        ? en
          ? "play right away in portrait on your phone — no download"
          : "手机竖屏直接玩，无需下载"
        : en
          ? "play right from the phone browser — no download"
          : "手机浏览器直接玩，无需下载",
    );
  }

  /* 参考游戏相似（场景 F，PRD §44 示例） */
  if (reference) {
    const sameGenre = g.genre && g.genre === reference.genre;
    const myMechanics = parseArray(g.mechanics);
    const refMechanics = parseArray(reference.mechanics);
    const overlap = refMechanics.filter((m) => myMechanics.includes(m));
    const refName = en
      ? reference.titleOriginal || reference.title
      : reference.title;
    const simpler =
      (intent.difficultyMax != null || intent.complexityMax != null) &&
      g.difficulty <= reference.difficulty;
    const bits: string[] = [];
    if (sameGenre) {
      const genre = genreText(g.genre, lang);
      bits.push(
        en
          ? `same ${genre} gameplay as "${refName}"`
          : `和《${refName}》同为${genre}玩法`,
      );
    } else if (overlap.length) {
      bits.push(
        en
          ? `mechanics are close to "${refName}"`
          : `玩法机制与《${refName}》相近`,
      );
    } else {
      bits.push(
        en
          ? `style is close to "${refName}"`
          : `风格接近《${refName}》`,
      );
    }
    if (simpler)
      bits.push(
        en
          ? "but with a lower barrier — easier to pick up"
          : "但门槛更低、更容易上手",
      );
    clauses.push(bits.join(en ? ", " : "，"));
  } else if (intent.similarTo) {
    // 站内未命中参考游戏：仍点明相似意图（测试断言：理由须提及参考游戏）
    clauses.push(
      en
        ? `gameplay shares similarities with "${intent.similarTo}"`
        : `玩法上与《${intent.similarTo}》有相似之处`,
    );
  }

  /* 类型 */
  if (!reference && intent.genre && g.genre === intent.genre && clauses.length < 2) {
    clauses.push(
      en
        ? `exactly the ${genreText(g.genre, lang)} genre you asked for`
        : `正属于你要找的${genreText(g.genre, lang)}类`,
    );
  }

  /* 兜底：新鲜度/热门（保证永远有理由） */
  if (clauses.length === 0) {
    if (g.playCount > 0)
      clauses.push(
        en
          ? "a popular pick that players keep coming back to"
          : "玩家反复回访的热门之选",
      );
    else if (g.publishedAt)
      clauses.push(
        en
          ? "recently added — worth trying out now"
          : "近期新上架，值得第一时间试试",
      );
    else
      clauses.push(
        en
          ? `a ${genreText(g.genre, lang)} game you can play instantly`
          : `一款${genreText(g.genre, lang)}游戏，开箱即玩`,
      );
  }

  // 分句过少时补充游戏画像（时长/类型/设备），保证理由信息量
  if (clauses.length < 2) {
    const st = sessionText(g, lang);
    if (st && !clauses[0].includes(en ? "min per round" : "单局"))
      clauses.push(en ? `this one runs ${st}` : `这款${st}`);
    if (clauses.length < 2 && g.genre)
      clauses.push(
        en
          ? `${genreText(g.genre, lang)} gameplay`
          : `${genreText(g.genre, lang)}类玩法`,
      );
  }

  // 上限 3 个分句，防止理由过长
  if (en) {
    return clauses.slice(0, 3).join("; ") + ".";
  }
  return clauses.slice(0, 3).join("；") + "。";
}