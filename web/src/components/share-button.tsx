/**
 * 详情页分享按钮（DANTE-7，T9.4）。
 *
 * 兼容层：对外仍是 <ShareButton game={GameDetail}/>，
 * 内部复用 ShareMenu（渠道菜单 + UTM 链接 + 海报）。
 */
import { useI18n } from "../i18n";
import { ShareMenu, ShareGlyph } from "./share-menu";
import type { GameDetail } from "@game-finder/shared";

export function ShareButton({ game }: { game: GameDetail }) {
  const { t } = useI18n();
  return (
    <ShareMenu
      target={{
        slug: game.slug,
        title: game.title,
        titleOriginal: game.titleOriginal,
        description: game.description,
        thumbnail: game.thumbnail,
        gameId: game.id,
      }}
      trigger={
        <span className="flex items-center gap-1.5">
          <ShareGlyph size={16} />
          {t("share")}
        </span>
      }
    />
  );
}