import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GameCard } from "@/components/games/game-card";
import { GamePlayer } from "@/components/games/game-player";
import {
  getGameBySlug,
  mockGames,
  ratingLabel,
  sessionLabel,
} from "@/lib/games/mock-data";

/** M1 阶段静态生成全部 mock 游戏详情页；M2 起改为 DB 查询 + revalidate */
export function generateStaticParams() {
  return mockGames.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/game/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) return { title: "游戏未找到" };
  return {
    title: `${game.title}（${game.titleOriginal}）`,
    description: game.description,
  };
}

export default async function GameDetailPage({
  params,
}: PageProps<"/game/[slug]">) {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) notFound();

  // M4 起换为 game_relations 预计算结果；M1 先用同类型 + 难度相近粗排
  const similar = mockGames
    .filter((g) => g.id !== game.id)
    .map((g) => ({
      g,
      dist:
        Math.abs(g.difficulty - game.difficulty) +
        Math.abs(g.cognitiveLoad - game.cognitiveLoad) +
        (g.genre === game.genre ? 0 : 2),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4)
    .map((x) => x.g);

  const spec: Array<[string, string]> = [
    ["类型", `${game.genre} · ${game.subGenre}`],
    ["难度", ratingLabel(game.difficulty)],
    ["认知负担", ratingLabel(game.cognitiveLoad)],
    ["单局时长", sessionLabel(game.sessionLengthMin, game.sessionLengthMax)],
    ["玩家人数", game.multiplayer ? `${game.players.min}~${game.players.max} 人` : "单人"],
    ["设备", [game.desktop && "电脑", game.mobile && "手机"].filter(Boolean).join(" / ")],
    ["画面方向", game.portrait ? "竖屏" : "横屏"],
    ["游戏语言", game.language === "zh" ? "中文" : "英文"],
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* 标题 + 评分 */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{game.title}</h1>
          <p className="mt-1 text-sm text-muted">{game.titleOriginal}</p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          ⭐ {game.score.toFixed(1)}
        </span>
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
          <li>· 单局 {sessionLabel(game.sessionLengthMin, game.sessionLengthMax)}，节奏可控，随时能停</li>
          <li>· 难度{ratingLabel(game.difficulty)}，{game.cognitiveLoad <= 2 ? "上手零门槛" : "需要一点学习成本"}</li>
          <li>· {game.mobile ? "手机、电脑都能玩" : "适合电脑端游玩"}</li>
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
