import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GameCard, ratingLabel, sessionLabel } from "@/components/games/game-card";
import { GamePlayer } from "@/components/games/game-player";
import { getGameBySlug, getSimilarGames } from "@/lib/games/queries";

/** M2：动态渲染 + ISR（源数据每 6 小时同步，1 小时重验足够新） */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: PageProps<"/game/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGameBySlug(slug);
  if (!game) return { title: "游戏未找到" };
  return {
    title: `${game.title}（${game.titleOriginal}）`,
    description: game.description,
  };
}

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export default async function GameDetailPage({
  params,
}: PageProps<"/game/[slug]">) {
  const { slug } = await params;
  const game = await getGameBySlug(slug);
  if (!game) notFound();

  // M4 起换为 game_relations 预计算结果
  const similar = await getSimilarGames(game.id, 4);

  const spec: Array<[string, string]> = [
    ["类型", game.genre ? `${game.genre}${game.subGenre ? ` · ${game.subGenre}` : ""}` : "未分类"],
    ["难度", ratingLabel(game.difficulty)],
    ["认知负担", ratingLabel(game.cognitiveLoad)],
    ["单局时长", sessionLabel(game.sessionLengthMin, game.sessionLengthMax)],
    [
      "玩家人数",
      game.multiplayer ? `${game.minPlayers}~${game.maxPlayers} 人` : "单人",
    ],
    [
      "设备",
      [game.desktop && "电脑", game.mobile && "手机"].filter(Boolean).join(" / ") || "未知",
    ],
    ["画面方向", game.portrait ? "竖屏" : "横屏"],
    ["游戏语言", game.gameLanguage === "zh" ? "中文" : "英文"],
    ["平台评分", game.totalScore != null ? game.totalScore.toFixed(1) : "暂无"],
  ];

  const whyPlay: string[] = [
    `单局 ${sessionLabel(game.sessionLengthMin, game.sessionLengthMax)}，节奏可控，随时能停`,
    `难度${ratingLabel(game.difficulty)}，${game.cognitiveLoad <= 2 ? "上手零门槛" : "需要一点学习成本"}`,
    game.mobile ? "手机、电脑都能玩" : "适合电脑端游玩",
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* 标题 + 评分 */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{game.title}</h1>
          <p className="mt-1 text-sm text-muted">{game.titleOriginal}</p>
        </div>
        {game.totalScore != null && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            ⭐ {game.totalScore.toFixed(1)}
          </span>
        )}
      </div>

      {/* 游戏区 */}
      <div className="mt-4">
        <GamePlayer
          gameUrl={game.gameUrl}
          title={game.title}
          portrait={game.portrait}
        />
      </div>

      {/* 简介 */}
      <section className="mt-6">
        <h2 className="text-lg font-bold">简介</h2>
        <p className="mt-2 leading-relaxed text-muted">{game.description}</p>
      </section>

      {/* 为什么值得玩（M5 起由 AI 基于画像生成） */}
      <section className="mt-6">
        <h2 className="text-lg font-bold">为什么值得玩？</h2>
        <ul className="mt-2 space-y-1 text-muted">
          {whyPlay.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </section>

      {/* 游戏参数 */}
      <section className="mt-6">
        <h2 className="text-lg font-bold">游戏参数</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-2 rounded-xl border border-border bg-surface p-4 text-sm sm:grid-cols-3">
          {spec.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <dt className="shrink-0 text-muted">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        {parseJsonArray(game.tags).length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {parseJsonArray(game.tags).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-background px-3 py-1 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {/* 类似游戏（PRD §27） */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">你可能还喜欢</h2>
          <Link href="/games" className="text-sm text-muted hover:text-primary">
            全部游戏 →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {similar.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      </section>
    </div>
  );
}
