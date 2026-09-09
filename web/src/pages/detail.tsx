import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { fetchGameDetail, fetchSimilarGames } from "../api";
import { FavoriteButton } from "../components/favorite-button";
import { FeedbackButton } from "../components/feedback-button";
import { GameCard } from "../components/game-card";
import { GamePlayer } from "../components/game-player";
import { Seo } from "../components/seo";
import { ShareButton } from "../components/share-button";
import { useI18n } from "../i18n";
import {
  buildVideoGameJsonLd,
  PUBLIC_SITE_URL,
  displayTitle,
  genreLabel,
  parseJsonArray,
  ratingLabel,
  sessionLabel,
  type GameDetail,
  type GameListItem,
} from "@game-finder/shared";

export function DetailPage() {
  const { slug = "" } = useParams();
  const { t, lang } = useI18n();
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
        void fetchSimilarGames(slug, lang)
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
  }, [slug, lang]);

  if (loading || loadedSlug !== slug) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">
        {t("loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">
        <Seo
          title={t("detailLoadFailedTitle")}
          description={t("detailLoadFailedDesc")}
          path={`/game/${encodeURIComponent(slug)}`}
          noIndex
        />
        {t("gameLoadFailed")}
      </div>
    );
  }

  if (notFound || !game) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">
        <Seo
          title={t("detailNotFoundTitle")}
          description={t("detailNotFoundDesc")}
          path={`/game/${encodeURIComponent(slug)}`}
          noIndex
        />
        {t("gameMissing")} ·{" "}
        <Link to="/games" className="text-primary hover:underline">
          {t("browseAll")}
        </Link>
      </div>
    );
  }

  // 界面语种 → 展示字段（T1.7）：英文界面优先原始英文名/简介
  const displayTitleText = displayTitle(game, lang);
  const subtitle = lang === "en" ? game.title : game.titleOriginal;
  const descriptionText =
    lang === "en"
      ? game.descriptionOriginal || game.description
      : game.description;

  const sessionText = sessionLabel(
    game.sessionLengthMin,
    game.sessionLengthMax,
    lang,
  );

  const spec: Array<[string, string]> = [
    [
      t("specGenre"),
      game.genre
        ? `${genreLabel(game.genre, lang)}${game.subGenre ? ` · ${game.subGenre}` : ""}`
        : t("valUncategorized"),
    ],
    [t("specDifficulty"), ratingLabel(game.difficulty, lang)],
    [t("specCognitive"), ratingLabel(game.cognitiveLoad, lang)],
    [t("specSession"), sessionText],
    [
      t("specPlayers"),
      game.multiplayer
        ? t("playersRange", { min: game.minPlayers, max: game.maxPlayers })
        : t("valSingle"),
    ],
    [
      t("specDevice"),
      [
        game.desktop && t("desktop"),
        game.mobile && t("mobile"),
      ]
        .filter(Boolean)
        .join(" / ") || t("valUnknown"),
    ],
    [t("specOrientation"), game.portrait ? t("valPortrait") : t("valLandscape")],
    [
      t("specGameLang"),
      game.gameLanguage === "zh" ? t("valLangZh") : t("valLangEn"),
    ],
    [
      t("specQuality"),
      game.sourceQualityScore != null
        ? `${Math.round(game.sourceQualityScore * 100)} / 100`
        : t("valNone"),
    ],
    [
      t("specRating"),
      game.totalScore != null ? game.totalScore.toFixed(1) : t("valNone"),
    ],
  ];

  const whyPlay = [
    t("whyPlay1", { session: sessionText }),
    t(game.cognitiveLoad <= 2 ? "whyPlay2Easy" : "whyPlay2Hard", {
      level: ratingLabel(game.difficulty, lang),
    }),
    game.mobile ? t("whyPlay3Mobile") : t("whyPlay3Desktop"),
  ];

  const screenshots = parseJsonArray(game.screenshots);
  const canonicalPath = `/game/${encodeURIComponent(game.slug)}`;
  // 英文界面的 JSON-LD 同步用英文名/简介
  const jsonLdGame =
    lang === "en"
      ? {
          ...game,
          title: displayTitleText,
          description: descriptionText,
        }
      : game;
  const jsonLd = buildVideoGameJsonLd(
    jsonLdGame,
    `${PUBLIC_SITE_URL}${canonicalPath}`,
  );
  const seoTitle =
    lang === "en"
      ? `${displayTitleText} | PlayWhat`
      : `${game.title}（${game.titleOriginal}）| 玩什么 PlayWhat`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Seo
        title={seoTitle}
        description={descriptionText.slice(0, 155)}
        path={canonicalPath}
        image={game.thumbnail}
        type="article"
        jsonLd={jsonLd}
      />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{displayTitleText}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {game.totalScore != null && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              ⭐ {game.totalScore.toFixed(1)}
            </span>
          )}
          <ShareButton game={game} />
          <FavoriteButton game={game} variant="detail" />
          <FeedbackButton game={game} />
        </div>
      </div>

      <div className="mt-4">
        <GamePlayer
          gameId={game.id}
          slug={game.slug}
          gameUrl={game.gameUrl}
          title={displayTitleText}
          portrait={game.portrait}
          poster={screenshots[0] ?? game.thumbnail}
        />
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-bold">{t("descTitle")}</h2>
        <p className="mt-2 leading-relaxed text-muted">{descriptionText}</p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">{t("whyPlayTitle")}</h2>
        <ul className="mt-2 space-y-1 text-muted">
          {whyPlay.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">{t("specsTitle")}</h2>
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
            {parseJsonArray(game.tags)
              // 英文界面隐藏中文标签（DB 标签为 AI 生成的中文）
              .filter((tag) => lang === "en" ? !/[\u4e00-\u9fff]/.test(tag) : true)
              .map((tag) => (
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
            <h2 className="text-lg font-bold">{t("similarTitle")}</h2>
            <Link to="/games" className="text-sm text-muted hover:text-primary">
              {t("allGamesArrow")}
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
