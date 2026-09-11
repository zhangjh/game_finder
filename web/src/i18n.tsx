/**
 * 轻量 i18n（T1.7）：zh / en 两组 key-value 文案 + useI18n hook。
 *
 * - 进入时按 navigator.language 自动切到 zh / en（默认中文，非中文浏览器兜底英文）
 * - 手动选择持久化 localStorage（key: ui-lang）
 * - 同步 <html lang>，覆盖 SEO metadata 的 lang 属性
 * - 仅区分「界面语种」；游戏内容语种（metadata_language）由 API 层
 *   按 lang 过滤：zh 只返回有中文元数据的游戏，en 返回全部（原始英文字段恒存在）
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type UiLang = "zh" | "en";

const STORAGE_KEY = "ui-lang";

/* ===== 文案资源 ===== */

const zh = {
  /* 通用 */
  loading: "加载中…",
  loadFailed: "加载失败",
  loadFailedWith: "加载失败：{error}",
  allGames: "全部游戏",
  allGamesArrow: "全部游戏 →",
  prevPage: "上一页",
  nextPage: "下一页",
  browseAll: "浏览全部游戏",

  /* 顶栏 */
  brand: "玩什么",
  searchPlaceholder: "搜游戏、玩法或描述你的需求…",
  favorites: "收藏",
  catHighQuality: "高品质",
  catChineseGems: "中文精品",
  catCasual: "休闲",
  catTowerDefense: "塔防",
  catRoguelike: "Roguelike",
  catPuzzle: "解谜",
  cat2p: "双人",
  cat5min: "5分钟",

  /* 底部 */
  copyright: "© 2026 PlayWhat（玩什么）· 让你更快找到想玩的游戏",
  footerSearch: "搜索",

  /* 首页 */
  homeSeoTitle: "玩什么 PlayWhat — 告诉我你想怎么玩",
  homeSeoDesc:
    "告诉 AI 你现在想怎么玩，它会结合时间、心情、人数和设备，从在线网页游戏中挑出更合适的选择。",
  heroTitle: "今天想玩什么？",
  heroSub: "告诉我你的时间和状态，AI 帮你从海量网页游戏里找到最合适的。",
  inputPlaceholder: "我只有10分钟，想玩轻松一点的",
  findGames: "帮我找游戏",
  aiPicking: "AI 挑选中…",
  recommending: "正在理解你的需求并挑选游戏…",
  recommendFailed: "推荐失败",
  tryLaterSuffix: "，请稍后再试",
  todayPicks: "今日推荐",
  hotGames: "热门游戏",
  newestGames: "最新游戏",
  more: "更多",
  allHot: "全部热门",
  allNew: "全部最新",
  categories: "游戏分类",
  dataLoadFailed: "数据加载失败：{error}（请确认后端 API 已启动）",

  /* 列表页 */
  gamesSeoTitle: "在线网页游戏大全｜按时长、人数和设备筛选",
  gamesSeoDesc:
    "浏览无需下载的在线网页游戏，按类型、单局时长、玩家人数、设备和评分筛选。",
  sortBy: "排序：",
  sortPopular: "热门",
  sortNewest: "最新",
  sortScore: "评分",
  filterGenre: "分类",
  filterDuration: "时长",
  filterPlayers: "人数",
  filterPlatform: "设备",
  withinMin: "{n}分钟内",
  singlePlayer: "单人",
  twoPlayer: "双人",
  multiPlayer: "多人",
  mobile: "手机",
  desktop: "电脑",
  countGames: "共 {total} 款游戏",
  countGamesPaged: "共 {total} 款游戏 · 第 {page}/{totalPages} 页",
  noMatch: "没有符合条件的游戏，试试放宽筛选条件",

  /* 详情页 */
  detailLoadFailedTitle: "游戏加载失败 | 玩什么 PlayWhat",
  detailLoadFailedDesc: "游戏详情暂时无法加载，请稍后重试。",
  detailNotFoundTitle: "游戏不存在 | 玩什么 PlayWhat",
  detailNotFoundDesc: "这款游戏不存在、已下架或暂时不可用。",
  gameLoadFailed: "游戏详情加载失败，请稍后重试",
  gameMissing: "游戏不存在或已下架",
  descTitle: "简介",
  whyPlayTitle: "为什么值得玩？",
  specsTitle: "游戏参数",
  similarTitle: "你可能还喜欢",
  specGenre: "类型",
  specDifficulty: "难度",
  specCognitive: "认知负担",
  specSession: "单局时长",
  specPlayers: "玩家人数",
  specDevice: "设备",
  specOrientation: "画面方向",
  specGameLang: "游戏语言",
  specQuality: "质量分",
  specRating: "平台评分",
  valUncategorized: "未分类",
  valSingle: "单人",
  valUnknown: "未知",
  valNone: "暂无",
  valPortrait: "竖屏",
  valLandscape: "横屏",
  valLangZh: "中文",
  valLangEn: "英文",
  playersRange: "{min}~{max} 人",
  whyPlay1: "单局 {session}，节奏可控，随时能停",
  whyPlay2Easy: "难度{level}，上手零门槛",
  whyPlay2Hard: "难度{level}，需要一点学习成本",
  whyPlay3Mobile: "手机、电脑都能玩",
  whyPlay3Desktop: "适合电脑端游玩",

  /* 搜索页 */
  searchSeoTitle: "搜索 | 玩什么 PlayWhat",
  searchSeoDesc: "搜索在线网页游戏，或直接描述你的时间、心情、人数和设备需求。",
  resultsFor: "「{q}」的搜索结果",
  searchGames: "搜索游戏",
  searchInputPlaceholder: "搜游戏名，或描述你想玩什么…",
  searchEmptySub: "关键词搜游戏名；整句描述需求，AI 帮你挑",
  doSearch: "搜索",
  recentSearches: "最近搜索",
  clearRecent: "清空",
  removeRecentAria: "删除搜索记录「{word}」",
  semanticExamples: "试试这样描述",
  keywordBadge: "关键词匹配",
  aiBadge: "AI 推荐",
  semanticBadge: "语义搜索",
  semanticFallbackHint: "没有「{q}」的直接匹配，为你找到相近游戏",
  noResultsFor: "没有找到与「{q}」相关的游戏",
  tryOtherSearches: "换个词试试",
  searching: "搜索中…",
  searchFailed: "搜索失败：{error}（请确认后端 API 已启动）",
  notUnderstoodPre: "没有理解这个需求，也搜不到相关游戏。试试",
  notUnderstoodPost: "或换个说法",
  relatedFound: "为你找到的相关游戏",

  /* 收藏页 */
  favSeoTitle: "我的收藏 | 玩什么 PlayWhat",
  favSeoDesc: "查看保存在当前浏览器中的游戏收藏。",
  favTitle: "我的收藏",
  favCount: "{n} 款游戏",
  favLocalHint:
    "收藏数据保存在当前浏览器本地，清除浏览器缓存、使用无痕模式或更换设备后收藏将丢失。未来上线账号体系后可跨设备同步。",
  favEmptyTitle: "还没有收藏任何游戏",
  favEmptyHint: "在游戏中找到喜欢的，点一下心形按钮就能收藏到这里",
  favDiscover: "去发现游戏",

  /* Landing 页 */
  aiPicksBadge: "AI 场景选游",
  currentFilters: "当前筛选",
  adjustSort: "调整排序：",
  howAiPicks: "AI 如何挑选",
  featured: "优先推荐",
  featuredHint: "先满足场景硬条件，再比较体验画像与真实游玩反馈。",
  listTitle: "游戏列表",
  countPaged: "共 {total} 款 · 第 {page}/{totalPages} 页",
  landingEmpty: "当前没有符合全部条件的已发布游戏，请稍后再来查看。",
  relatedNeeds: "相关游戏需求",
  recommendReason: "推荐理由：{duration}，{device}，难度 {difficulty}/5。",
  reasonMobile: "支持手机",
  reasonDesktop: "适合电脑",

  /* 404 */
  notFoundSeoTitle: "页面不存在 | 玩什么 PlayWhat",
  notFoundSeoDesc: "你访问的页面不存在或已经移除。",
  notFoundText: "页面不存在",

  /* 高品质页 */
  hqSeoTitle: "高品质在线游戏精选 | 玩什么 PlayWhat",
  hqSeoDesc: "按质量分筛选的高品质在线网页游戏，免下载直接游玩。",
  hqTitle: "高品质精选",
  hqHint: "质量分 > {n} 的精品，按分数高到低",
  hqCount: "共 {total} 款",
  hqCountPaged: "共 {total} 款 · 第 {page}/{totalPages} 页",
  hqEmpty: "暂未发现 {n} 分以上的游戏，等下次采集同步后回来看看",

  /* 中文精品专区 */
  zhSeoTitle: "中文精品小游戏专区 | 玩什么 PlayWhat",
  zhSeoDesc:
    "精选本地部署的中文 H5 小游戏，无需下载、打开即玩，无论棋牌、消除还是动作小游戏都能直接开始。",
  zhTitle: "中文精品游戏专区",
  zhHint: "本地部署的中文 H5 小游戏，源码随站点托管，打开即玩",
  zhCount: "共 {total} 款",
  zhCountPaged: "共 {total} 款 · 第 {page}/{totalPages} 页",
  zhEmpty: "专区暂未收录游戏，等目录导入后回来看看",

  /* 游戏卡片 */
  playNow: "立即玩",
  qualityBadge: "质量分",
  thumbnailAlt: "{title}缩略图",
  nPlayers: "{n}人",

  /* 推荐结果 */
  recNoMatch: "没有找到匹配的游戏，换个说法试试？",
  recNotParsed: "没能理解这句话，试试下面的快捷条件，或换个更具体的描述",
  recBasedOn: "以《{title}》为基准找相似",
  recRelaxed: "严格匹配不足，已展示条件接近的结果",
  recNotSure: "AI 理解不确定，以下为热门推荐",
  recPicked: "为你挑选了 {n} 款",

  /* 游戏启动 */
  portraitHint: "建议竖屏体验",
  landscapeHint: "建议横屏 / 桌面体验",
  continueGame: "▶ 继续游戏",
  startGame: "▶ 开始游戏",
  restart: "重新开始",
  playerLoadFailed: "游戏加载失败",
  playerLoadFailedHint: "可能是网络波动或游戏源暂时不可用",
  retry: "重试",
  playerStalled: "游戏没有启动",
  playerStalledHint:
    "可能是浏览器拦截了游戏源的广告/跟踪脚本（如 Edge 跟踪防护、广告拦截）。点击右上角可关闭提示继续等待，或关闭拦截后点「重新加载」。",
  reload: "重新加载",
  saveFailed: "存档保存失败",
  saveFailedSub: "请检查网络后重试",
  exitFullscreen: "退出全屏",
  enterFullscreen: "进入全屏",
  rotateToLandscape: "切换横屏",
  rotateGuide: "请旋转手机至横屏",
  rotateGuideHint:
    "如需横屏游玩，请旋转手机；旋转后会自动继续，点击右上角可关闭提示。",

  /* 分享 */
  share: "分享",
  copied: "已复制",
  shareAria: "分享游戏",
  copiedToast: "链接已复制",
  copiedToastSub: "粘贴到微信 / 微博 / 群聊即可分享",
  copyFailed: "复制失败，请手动复制地址栏链接",
  shareText: "来玩《{title}》——{desc}",

  /* 收藏按钮 */
  favorite: "收藏",
  favorited: "已收藏",
  favAdded: "已收藏",
  favAddedSub: "收藏仅保存在当前浏览器，清理缓存或换设备后会丢失",
  favRemoved: "已取消收藏",
  ariaAddFav: "收藏",
  ariaRemoveFav: "取消收藏",

  /* 游戏质量反馈 */
  feedback: "反馈",
  feedbackAria: "反馈游戏质量问题",
  feedbackDialogTitle: "反馈问题",
  feedbackDialogSub: "告诉我们哪里有问题，我们会尽快核实处理。",
  feedbackTypeNotPlayable: "游戏打不开 / 玩不了",
  feedbackTypeNotPlayableDesc: "点开始后游戏无法启动、白屏或无响应",
  feedbackTypeWrongLang: "游戏语言不对",
  feedbackTypeWrongLangDesc: "既不是中文也不是英文（比如俄语）",
  feedbackLangHint: "提示：英文游戏是正常的，不属于语言错误",
  feedbackNotePlaceholder: "补充说明（可选），比如「确定是俄语，看不懂」",
  feedbackSubmit: "提交反馈",
  feedbackCancel: "取消",
  feedbackRequired: "请先选择一个反馈类型",
  feedbackSubmitted: "反馈已提交",
  feedbackSubmittedSub: "我们会尽快核实处理，谢谢你！",
  feedbackAlreadyReported: "已收到过你对这款游戏的反馈",
  feedbackSubmitFailed: "提交失败，请稍后再试",

  /* 语种切换 */
  langToggleAria: "切换语言 / Switch language",
} as const;

export type I18nKey = keyof typeof zh;

const en: Record<I18nKey, string> = {
  /* Common */
  loading: "Loading…",
  loadFailed: "Failed to load",
  loadFailedWith: "Failed to load: {error}",
  allGames: "All games",
  allGamesArrow: "All games →",
  prevPage: "Previous",
  nextPage: "Next",
  browseAll: "Browse all games",

  /* Header */
  brand: "PlayWhat",
  searchPlaceholder: "Search games or describe what you feel like…",
  favorites: "Favorites",
  catHighQuality: "Top rated",
  catChineseGems: "Chinese",
  catCasual: "Casual",
  catTowerDefense: "Tower Defense",
  catRoguelike: "Roguelike",
  catPuzzle: "Puzzle",
  cat2p: "2 Player",
  cat5min: "5 min",

  /* Footer */
  copyright: "© 2026 PlayWhat · Find a game you'll love, faster",
  footerSearch: "Search",

  /* Home */
  homeSeoTitle: "PlayWhat — Tell us how you want to play",
  homeSeoDesc:
    "Tell AI how you want to play right now — it picks the best match from online web games based on your time, mood, players and device.",
  heroTitle: "What do you want to play today?",
  heroSub: "Tell us your time and state of mind — AI finds the best fit from thousands of web games.",
  inputPlaceholder: "I've only got 10 minutes, something relaxing",
  findGames: "Find games",
  aiPicking: "AI picking…",
  recommending: "Understanding your needs and picking games…",
  recommendFailed: "Recommendation failed",
  tryLaterSuffix: ", please try again later",
  todayPicks: "Today's picks",
  hotGames: "Popular games",
  newestGames: "New games",
  more: "More",
  allHot: "All popular",
  allNew: "All newest",
  categories: "Categories",
  dataLoadFailed: "Failed to load data: {error} (make sure the API server is running)",

  /* Games page */
  gamesSeoTitle: "All Online Web Games | Filter by Length, Players & Device",
  gamesSeoDesc:
    "Browse no-download online web games. Filter by genre, session length, players, device and rating.",
  sortBy: "Sort:",
  sortPopular: "Popular",
  sortNewest: "Newest",
  sortScore: "Rating",
  filterGenre: "Genre",
  filterDuration: "Length",
  filterPlayers: "Players",
  filterPlatform: "Device",
  withinMin: "Within {n} min",
  singlePlayer: "Single",
  twoPlayer: "2P",
  multiPlayer: "Multi",
  mobile: "Mobile",
  desktop: "Desktop",
  countGames: "{total} games",
  countGamesPaged: "{total} games · Page {page}/{totalPages}",
  noMatch: "No games match these filters — try relaxing them",

  /* Detail page */
  detailLoadFailedTitle: "Game failed to load | PlayWhat",
  detailLoadFailedDesc: "This game's details couldn't be loaded. Please try again later.",
  detailNotFoundTitle: "Game not found | PlayWhat",
  detailNotFoundDesc: "This game doesn't exist, has been removed, or is temporarily unavailable.",
  gameLoadFailed: "Failed to load this game. Please try again later",
  gameMissing: "This game doesn't exist or has been removed",
  descTitle: "Description",
  whyPlayTitle: "Why it's worth playing",
  specsTitle: "Game specs",
  similarTitle: "You may also like",
  specGenre: "Genre",
  specDifficulty: "Difficulty",
  specCognitive: "Cognitive load",
  specSession: "Session length",
  specPlayers: "Players",
  specDevice: "Devices",
  specOrientation: "Orientation",
  specGameLang: "Game language",
  specQuality: "Quality score",
  specRating: "Rating",
  valUncategorized: "Uncategorized",
  valSingle: "Single-player",
  valUnknown: "Unknown",
  valNone: "N/A",
  valPortrait: "Portrait",
  valLandscape: "Landscape",
  valLangZh: "Chinese",
  valLangEn: "English",
  playersRange: "{min}-{max} players",
  whyPlay1: "Runs {session} per session — easy to stop anytime",
  whyPlay2Easy: "{level} difficulty, zero barrier to entry",
  whyPlay2Hard: "{level} difficulty, takes a little learning",
  whyPlay3Mobile: "Plays on both phone and desktop",
  whyPlay3Desktop: "Best played on desktop",

  /* Search page */
  searchSeoTitle: "Search | PlayWhat",
  searchSeoDesc:
    "Search online web games, or just describe your time, mood, players and device needs.",
  resultsFor: "Search results for \"{q}\"",
  searchGames: "Search games",
  searchInputPlaceholder: "Search a title, or describe what you feel like…",
  searchEmptySub:
    "Keywords match game titles; describe what you want and AI picks for you",
  doSearch: "Search",
  recentSearches: "Recent searches",
  clearRecent: "Clear",
  removeRecentAria: "Remove search \"{word}\"",
  semanticExamples: "Try describing what you want",
  keywordBadge: "Keyword match",
  aiBadge: "AI picks",
  semanticBadge: "Semantic search",
  semanticFallbackHint:
    "No direct matches for \"{q}\" — here are similar games",
  noResultsFor: "No games found for \"{q}\"",
  tryOtherSearches: "Try a different search",
  searching: "Searching…",
  searchFailed: "Search failed: {error} (make sure the API server is running)",
  notUnderstoodPre: "Couldn't understand that request and no games matched. Try the",
  notUnderstoodPost: "or rephrase it",
  relatedFound: "Related games we found",

  /* Favorites page */
  favSeoTitle: "My Favorites | PlayWhat",
  favSeoDesc: "View game favorites saved in this browser.",
  favTitle: "My favorites",
  favCount: "{n} games",
  favLocalHint:
    "Favorites are stored in this browser only — clearing cache, going incognito or switching devices will lose them. They'll sync across devices once accounts launch.",
  favEmptyTitle: "No favorites yet",
  favEmptyHint: "Find a game you like and tap the heart button to save it here",
  favDiscover: "Discover games",

  /* Landing pages */
  aiPicksBadge: "AI-picked for the scenario",
  currentFilters: "Current filters",
  adjustSort: "Sort by:",
  howAiPicks: "How AI picks",
  featured: "Featured",
  featuredHint: "Hard scenario filters first, then experience profiles and real play feedback.",
  listTitle: "Game list",
  countPaged: "{total} games · Page {page}/{totalPages}",
  landingEmpty: "No published games match all conditions yet — check back later.",
  relatedNeeds: "Related needs",
  recommendReason: "Why: {duration}, {device}, difficulty {difficulty}/5.",
  reasonMobile: "mobile-friendly",
  reasonDesktop: "desktop-fit",

  /* 404 */
  notFoundSeoTitle: "Page not found | PlayWhat",
  notFoundSeoDesc: "The page you're looking for doesn't exist or has been removed.",
  notFoundText: "Page not found",

  /* High quality page */
  hqSeoTitle: "Top-Quality Online Games | PlayWhat",
  hqSeoDesc: "High-quality online web games filtered by quality score — no download, play instantly.",
  hqTitle: "Top-quality picks",
  hqHint: "Gems with a quality score above {n}, ranked highest first",
  hqCount: "{total} games",
  hqCountPaged: "{total} games · Page {page}/{totalPages}",
  hqEmpty: "No games above {n} yet — check back after the next sync",

  /* Chinese games zone */
  zhSeoTitle: "Premium Chinese Web Games | PlayWhat",
  zhSeoDesc:
    "Hand-picked, locally hosted Chinese H5 games — no download, play instantly. From board games and match-3 to action mini-games.",
  zhTitle: "Premium Chinese games",
  zhHint: "Locally hosted Chinese H5 games — bundled with the site, play instantly",
  zhCount: "{total} games",
  zhCountPaged: "{total} games · Page {page}/{totalPages}",
  zhEmpty: "No games in this zone yet — check back after the catalog import",

  /* Game card */
  playNow: "Play now",
  qualityBadge: "Quality score",
  thumbnailAlt: "{title} thumbnail",
  nPlayers: "{n}P",

  /* Recommend results */
  recNoMatch: "No matching games — try rephrasing?",
  recNotParsed: "Couldn't understand that. Try the quick filters below, or be more specific",
  recBasedOn: "Finding games similar to \"{title}\"",
  recRelaxed: "Few exact matches — showing close alternatives",
  recNotSure: "AI wasn't sure — here are popular picks",
  recPicked: "Picked {n} for you",

  /* Game player */
  portraitHint: "Best experienced in portrait",
  landscapeHint: "Best in landscape / desktop",
  continueGame: "▶ Continue",
  startGame: "▶ Start",
  restart: "Restart",
  playerLoadFailed: "Failed to load the game",
  playerLoadFailedHint: "Could be a network hiccup or the game source is temporarily down",
  retry: "Retry",
  playerStalled: "The game didn't start",
  playerStalledHint:
    "Your browser may have blocked the game source's ad/tracking scripts (e.g. Edge tracking prevention or an ad blocker). Tap the close button to keep waiting, or disable the blocker and hit \"Reload\".",
  reload: "Reload",
  saveFailed: "Failed to save progress",
  saveFailedSub: "Check your connection and try again",
  exitFullscreen: "Exit fullscreen",
  enterFullscreen: "Enter fullscreen",
  rotateToLandscape: "Rotate screen",
  rotateGuide: "Please rotate your phone to landscape",
  rotateGuideHint:
    "Rotate your phone to play in landscape. The game continues automatically once you rotate — tap the top-right corner to dismiss.",

  /* Share */
  share: "Share",
  copied: "Copied",
  shareAria: "Share game",
  copiedToast: "Link copied",
  copiedToastSub: "Paste it into any chat to share",
  copyFailed: "Copy failed — please copy the URL from the address bar",
  shareText: "Come play \"{title}\" — {desc}",

  /* Favorite button */
  favorite: "Favorite",
  favorited: "Saved",
  favAdded: "Added to favorites",
  favAddedSub: "Favorites live in this browser only — clearing cache or switching devices loses them",
  favRemoved: "Removed from favorites",
  ariaAddFav: "Add to favorites",
  ariaRemoveFav: "Remove from favorites",

  /* Game quality feedback */
  feedback: "Feedback",
  feedbackAria: "Report a problem with this game",
  feedbackDialogTitle: "Report a problem",
  feedbackDialogSub: "Tell us what's wrong — we'll verify and fix it soon.",
  feedbackTypeNotPlayable: "Game won't start / unplayable",
  feedbackTypeNotPlayableDesc: "The game doesn't launch, shows a blank screen, or won't respond after starting",
  feedbackTypeWrongLang: "Wrong game language",
  feedbackTypeWrongLangDesc: "It's neither Chinese nor English (e.g. Russian)",
  feedbackLangHint: "Tip: English games are fine — that's not a language error",
  feedbackNotePlaceholder: "Anything else? (optional), e.g. \"It's Russian, can't understand\"",
  feedbackSubmit: "Submit feedback",
  feedbackCancel: "Cancel",
  feedbackRequired: "Please pick a problem type first",
  feedbackSubmitted: "Feedback sent",
  feedbackSubmittedSub: "We'll verify and handle it soon. Thank you!",
  feedbackAlreadyReported: "We've already received your feedback on this game",
  feedbackSubmitFailed: "Failed to send — please try again later",

  /* Language toggle */
  langToggleAria: "切换语言 / Switch language",
};

const dictionaries: Record<UiLang, Record<I18nKey, string>> = { zh, en };

/* ===== 语种检测 ===== */

function detectLang(): UiLang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* localStorage 不可用（无痕/禁用）→ 走浏览器语种 */
  }
  const nav =
    typeof navigator !== "undefined"
      ? (navigator.language ?? navigator.languages?.[0] ?? "zh")
      : "zh";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/* ===== Context ===== */

interface I18nContextValue {
  lang: UiLang;
  setLang: (lang: UiLang) => void;
  /** 取文案；params 替换 {name} 占位符 */
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(detectLang);

  // 同步 <html lang>（SEO metadata 的 lang 属性，T1.7）
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = useCallback((next: UiLang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 持久化失败不影响本次会话 */
    }
  }, []);

  const t = useCallback(
    (key: I18nKey, params?: Record<string, string | number>) =>
      interpolate(dictionaries[lang][key], params),
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
