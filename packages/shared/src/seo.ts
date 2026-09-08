import type { GameListQuery } from "./index";

export const PUBLIC_SITE_URL = "https://playwhat.cc";

export interface VideoGameJsonLdInput {
  title: string;
  titleOriginal: string;
  description: string;
  thumbnail: string | null;
  genre: string | null;
  desktop: boolean;
  mobile: boolean;
  gameLanguage: string;
  multiplayer: boolean;
  developer: string | null;
  publisher: string | null;
  releaseDate: string | null;
}

export interface SeoGameMetadata extends VideoGameJsonLdInput {
  slug: string;
  sessionLengthMax: number | null;
  minPlayers: number;
  maxPlayers: number;
  mood: string;
  sourceQualityScore: number | null;
  updatedAt: string;
}

export interface SeoGameExportResponse {
  items: SeoGameMetadata[];
  total: number;
  nextCursor: number | null;
  catalogVersion: string;
}

export interface SeoLandingPage {
  slug: string;
  path: string;
  title: string;
  description: string;
  heading: string;
  intro: string[];
  filters: GameListQuery;
  filterLabels: string[];
  aiExplanation: string;
  relatedPaths: string[];
}

export const SEO_LANDING_PAGES: SeoLandingPage[] = [
  {
    slug: "tower-defense",
    path: "/games/tower-defense",
    title: "在线塔防游戏推荐｜即开即玩的策略防守游戏",
    description:
      "精选可直接在浏览器玩的塔防游戏，按节奏、难度和单局时长筛选，并解释每款游戏适合怎样的玩家。",
    heading: "在线塔防游戏推荐",
    intro: [
      "塔防游戏的乐趣不只是把防御塔摆满地图，而是在有限资源、敌人路线和升级时机之间做取舍。这里收录无需下载、打开浏览器就能玩的塔防作品。",
      "我们优先推荐规则清楚、前几分钟能快速进入核心循环的游戏，并保留不同难度和节奏，方便新手与策略玩家各取所需。",
    ],
    filters: { genre: "塔防", sort: "score" },
    filterLabels: ["类型：塔防", "状态：可在线游玩", "排序：综合评分"],
    aiExplanation:
      "AI 会综合塔防类型匹配度、认知负担、难度、单局时长和 GameScore 排序；高分不等于更难，而是更符合塔防需求且实际游玩反馈更好。",
    relatedPaths: ["/games/10-minute", "/games/mobile", "/games/relaxing"],
  },
  {
    slug: "roguelike",
    path: "/games/roguelike",
    title: "在线 Roguelike 游戏推荐｜每局都不同的网页游戏",
    description:
      "精选无需下载的在线 Roguelike 游戏，比较难度、局长和认知负担，快速找到适合当前状态的一局。",
    heading: "在线 Roguelike 游戏推荐",
    intro: [
      "Roguelike 的核心是随机成长与失败后的重新决策。同一款游戏每局拿到的能力、路线和组合不同，适合喜欢试构筑、追求重复可玩性的玩家。",
      "列表同时包含轻量生存玩法与需要规划的硬核作品。先看单局时长和难度，再决定现在是否适合开一局，比只看热门度更可靠。",
    ],
    filters: { genre: "Roguelike", sort: "score" },
    filterLabels: ["类型：Roguelike", "状态：可在线游玩", "排序：综合评分"],
    aiExplanation:
      "AI 优先考虑类型与玩法机制，再结合重复可玩性、难度、认知负担和玩家行为分数；目标是推荐真正有随机成长循环的游戏，而不是只匹配标题关键词。",
    relatedPaths: ["/games/10-minute", "/games/mobile", "/games/tower-defense"],
  },
  {
    slug: "puzzle",
    path: "/games/puzzle",
    title: "在线解谜游戏推荐｜动脑但不盲目试错",
    description:
      "精选无需下载的在线解谜游戏，结合难度、认知负担和单局时长，快速找到适合当前状态的谜题。",
    heading: "在线解谜游戏推荐",
    intro: [
      "解谜游戏需要观察规则、发现线索并验证推理，但好的谜题不会只靠反复试错拖延时间。这里收录打开浏览器即可玩的解谜作品。",
      "选择时可以先看难度、认知负担和单局时长：短谜题适合碎片时间，连续关卡则更适合愿意持续思考的玩家。",
    ],
    filters: { genre: "解谜", sort: "score" },
    filterLabels: ["类型：解谜", "状态：可在线游玩", "排序：综合评分"],
    aiExplanation:
      "AI 先匹配解谜类型，再结合难度、认知负担、单局时长和玩家反馈排序，减少只有题材像谜题、实际玩法却不匹配的结果。",
    relatedPaths: ["/games/5-minute", "/games/relaxing", "/games/mobile"],
  },
  {
    slug: "2-player",
    path: "/games/2-player",
    title: "双人在线小游戏推荐｜两个人直接玩的网页游戏",
    description:
      "无需下载的双人网页游戏精选，筛选真实支持两人参与的作品，并按上手成本、设备和游玩反馈推荐。",
    heading: "双人在线小游戏推荐",
    intro: [
      "两个人临时想玩一局，最浪费时间的不是输赢，而是下载、注册后才发现不支持同屏或双人。这里先按玩家人数做硬过滤，只展示支持两人参与的在线游戏。",
      "开始前仍要查看游戏卡片与详情中的设备和操作说明：部分作品适合同屏轮流，部分更偏合作或对抗，选择取决于你们共用还是各用一台设备。",
    ],
    filters: { players: 2, sort: "score" },
    filterLabels: ["人数：支持 2 人", "状态：可在线游玩", "排序：综合评分"],
    aiExplanation:
      "玩家人数属于硬条件，不会被热度放宽。满足双人条件后，AI 再比较难度、单局时长、GameScore 与流行度，减少点进去才发现不能一起玩的情况。",
    relatedPaths: ["/games/5-minute", "/games/mobile", "/games/relaxing"],
  },
  {
    slug: "5-minute",
    path: "/games/5-minute",
    title: "5分钟小游戏推荐｜碎片时间即开即玩",
    description:
      "精选单局最长约 5 分钟的在线小游戏，适合通勤、排队和短暂休息，无需下载即可开始。",
    heading: "5分钟小游戏推荐",
    intro: [
      "只有几分钟时，最重要的是能快速进入玩法、在时间到之前完成一轮，而不是打开一个需要长教程的游戏。这里按 AI 画像中的单局最长时长严格筛选。",
      "时长是估算值，首次学习规则可能多花一点时间；熟悉后更接近标注区间。需要随时中断时，优先选择低认知负担和低压力的作品。",
    ],
    filters: { duration: 5, sort: "score" },
    filterLabels: ["单局最长：5 分钟", "状态：可在线游玩", "排序：综合评分"],
    aiExplanation:
      "时长是硬过滤条件，只有画像中的 sessionLengthMax 不超过 5 分钟才会进入列表；随后再按上手成本、评分和实际热度排序。",
    relatedPaths: ["/games/10-minute", "/games/relaxing", "/games/mobile"],
  },
  {
    slug: "10-minute",
    path: "/games/10-minute",
    title: "10分钟以内网页游戏推荐｜现在就能完成一局",
    description:
      "为只有十分钟的场景精选在线游戏，严格限制单局最长时长，并解释难度、节奏与设备适配。",
    heading: "10分钟以内网页游戏推荐",
    intro: [
      "十分钟足够完成一局有明确反馈的游戏，但不适合冗长教程、重度养成或必须连续投入的内容。本页解决的是“我现在只有十分钟，玩什么”。",
      "筛选使用单局最长时长，而不是只看最快完成时间，因此不会把“最快 5 分钟、正常要半小时”的游戏混进来。",
    ],
    filters: { duration: 10, sort: "score" },
    filterLabels: ["单局最长：10 分钟", "状态：可在线游玩", "排序：综合评分"],
    aiExplanation:
      "AI 先执行 10 分钟硬过滤，再综合难度、认知负担、平台评分和近期热度。推荐区更偏向能快速理解、短时间内获得完整反馈的作品。",
    relatedPaths: ["/games/5-minute", "/games/relaxing", "/games/roguelike"],
  },
  {
    slug: "relaxing",
    path: "/games/relaxing",
    title: "轻松治愈的在线游戏推荐｜低压力放松一下",
    description:
      "精选带 relaxing 或 chill 画像的低压力网页游戏，并结合认知负担与节奏推荐真正适合放松的作品。",
    heading: "轻松治愈的在线游戏推荐",
    intro: [
      "“休闲”只是类型，“放松”是实际体验。一个休闲游戏也可能节奏很快、失败惩罚很强，因此本页直接使用 AI 体验画像中的放松心情标签筛选。",
      "如果你正在疲惫或只想清空脑子，优先看低认知负担、低压力和节奏较缓的作品；想保持一点挑战，则可从推荐区选择难度中等的游戏。",
    ],
    filters: { mood: "relaxing", sort: "score" },
    filterLabels: ["心情：放松", "状态：可在线游玩", "排序：综合评分"],
    aiExplanation:
      "AI 不只匹配“休闲”关键词，而是读取 mood、认知负担、压力、节奏与玩家反馈。进入本页的游戏必须具有 relaxing 或对应放松画像。",
    relatedPaths: ["/games/5-minute", "/games/10-minute", "/games/puzzle"],
  },
  {
    slug: "mobile",
    path: "/games/mobile",
    title: "手机网页游戏推荐｜免下载直接在线玩",
    description:
      "精选明确支持手机设备的网页游戏，兼顾触屏体验、横竖屏、单局时长和实际游玩评分。",
    heading: "手机网页游戏推荐",
    intro: [
      "能在浏览器打开，不代表适合手机操作。本页先过滤数据源与 AI 画像中明确支持 mobile 的游戏，减少按钮太小、必须键鼠或画面比例不合适的问题。",
      "进入详情页可继续确认横竖屏提示与游戏语言。第三方播放器若被浏览器隐私保护拦截，页面会提供重新加载和新标签页打开的安全兜底。",
    ],
    filters: { platform: "mobile", sort: "score" },
    filterLabels: ["设备：支持手机", "状态：可在线游玩", "排序：综合评分"],
    aiExplanation:
      "设备支持是硬条件，不会因游戏热门而放宽。满足手机条件后，AI 再比较单局时长、难度、GameScore 与流行度，优先呈现更适合移动场景的作品。",
    relatedPaths: ["/games/5-minute", "/games/10-minute", "/games/relaxing"],
  },
];

export function getSeoLandingPage(slug: string): SeoLandingPage | undefined {
  return SEO_LANDING_PAGES.find((page) => page.slug === slug);
}

export function buildVideoGameJsonLd(
  game: VideoGameJsonLdInput,
  canonicalUrl: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    alternateName: game.titleOriginal,
    description: game.description,
    image: game.thumbnail ? [game.thumbnail] : undefined,
    url: canonicalUrl,
    genre: game.genre ?? undefined,
    gamePlatform: [
      game.desktop && "Web Browser",
      game.mobile && "Mobile Web",
    ].filter(Boolean),
    inLanguage: game.gameLanguage,
    playMode: game.multiplayer ? "MultiPlayer" : "SinglePlayer",
    author: game.developer
      ? { "@type": "Organization", name: game.developer }
      : undefined,
    publisher: game.publisher
      ? { "@type": "Organization", name: game.publisher }
      : undefined,
    datePublished: game.releaseDate ?? undefined,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CNY",
      availability: "https://schema.org/InStock",
    },
  };
}
