import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { fetchGameDetail, fetchSimilarGames } from "../api";
import { FavoriteButton } from "../components/favorite-button";
import { GameCard } from "../components/game-card";
import { GamePlayer } from "../components/game-player";
import { Seo } from "../components/seo";
import { ShareButton } from "../components/share-button";
import {
  buildVideoGameJsonLd,
  PUBLIC_SITE_URL,
  parseJsonArray,
  ratingLabel,
  sessionLabel,
  type GameDetail,
  type GameListItem,
} from "@game-finder/shared";

export function DetailPage() {
  const { slug = "" } = useParams();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [similar, setSimilar] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setError(false);
    setSimilar([]);
    void fetchGameDetail(slug)
      .then((nextGame) => {
        if (!active) return;
        if (!nextGame) {
          setGame(null);
          setNotFound(true);
          setLoadedSlug(slug);
          return;
        }

        setGame(nextGame);
        setLoadedSlug(slug);
        void fetchSimilarGames(slug)
          .then((nextSimilar) => {
            if (active) setSimilar(nextSimilar);
          })
          .catch(() => {
            if (active) setSimilar([]);
          });
      })
      .catch(() => {
        if (!active) return;
        setGame(null);
        setError(true);
        setLoadedSlug(slug);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading || loadedSlug !== slug) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">
        加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">
        <Seo
          title="游戏加载失败 | 玩什么 PlayWhat"
          description="游戏详情暂时无法加载，请稍后重试。"
          path={`/game/${encodeURIComponent(slug)}`}
          noIndex
        />
        游戏详情加载失败，请稍后重试
      </div>
    );
  }

  if (notFound || !game) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">
        <Seo
          title="游戏不存在 | 玩什么 PlayWhat"
          description="这款游戏不存在、已下架或暂时不可用。"
          path={`/game/${encodeURIComponent(slug)}`}
          noIndex
        />
        游戏不存在或已下架 ·{" "}
        <Link to="/games" className="text-primary hover:underline">
          浏览全部游戏
        </Link>
      </div>
    );
  }

  const spec: Array<[string, string]> = [
    [
      "类型",
      game.genre
        ? `${game.genre}${game.subGenre ? ` · ${game.subGenre}` : ""}`
        : "未分类",
    ],
    ["难度", ratingLabel(game.difficulty)],
    ["认知负担", ratingLabel(game.cognitiveLoad)],
    ["单局时长", sessionLabel(game.sessionLengthMin, game.sessionLengthMax)],
    [
      "玩家人数",
      game.multiplayer ? `${game.minPlayers}~${game.maxPlayers} 人` : "单人",
    ],
    [
      "设备",
      [game.desktop && "电脑", game.mobile && "手机"]
        .filter(Boolean)
        .join(" / ") || "未知",
    ],
    ["画面方向", game.portrait ? "竖屏" : "横屏"],
    ["游戏语言", game.gameLanguage === "zh" ? "中文" : "英文"],
    [
      "质量分",
      game.sourceQualityScore != null
        ? `${Math.round(game.sourceQualityScore * 100)} / 100`
        : "暂无",
    ],
    ["平台评分", game.totalScore != null ? game.totalScore.toFixed(1) : "暂无"],
  ];

  const whyPlay = [
    `单局 ${sessionLabel(game.sessionLengthMin, game.sessionLengthMax)}，节奏可控，随时能停`,
    `难度${ratingLabel(game.difficulty)}，${game.cognitiveLoad <= 2 ? "上手零门槛" : "需要一点学习成本"}`,
    game.mobile ? "手机、电脑都能玩" : "适合电脑端游玩",
  ];

  const screenshots = parseJsonArray(game.screenshots);
  const canonicalPath = `/game/${encodeURIComponent(game.slug)}`;
  const jsonLd = buildVideoGameJsonLd(game, `${PUBLIC_SITE_URL}${canonicalPath}`);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Seo
        title={`${game.title}（${game.titleOriginal}）| 玩什么 PlayWhat`}
        description={game.description.slice(0, 155)}
        path={canonicalPath}
        image={game.thumbnail}
        type="article"
        jsonLd={jsonLd}
      />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{game.title}</h1>
          <p className="mt-1 text-sm text-muted">{game.titleOriginal}</p>
        </div>
        <div className="flex items-center gap-3">
          {game.totalScore != null && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              ⭐ {game.totalScore.toFixed(1)}
            </span>
          )}
          <ShareButton game={game} />
          <FavoriteButton game={game} variant="detail" />
        </div>
      </div>

      <div className="mt-4">
        <GamePlayer
          gameId={game.id}
          slug={game.slug}
          gameUrl={game.gameUrl}
          title={game.title}
          portrait={game.portrait}
          poster={screenshots[0] ?? game.thumbnail}
        />
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-bold">简介</h2>
        <p className="mt-2 leading-relaxed text-muted">{game.description}</p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">为什么值得玩？</h2>
        <ul className="mt-2 space-y-1 text-muted">
          {whyPlay.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </section>

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

      {similar.length > 0 ? (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">你可能还喜欢</h2>
            <Link to="/games" className="text-sm text-muted hover:text-primary">
              全部游戏 →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {similar.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
