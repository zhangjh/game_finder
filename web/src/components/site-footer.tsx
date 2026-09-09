import { Link } from "react-router";

import { useI18n } from "../i18n";

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between">
        <p>{t("copyright")}</p>
        <nav className="flex items-center gap-4">
          <Link to="/games" className="transition-colors hover:text-foreground">
            {t("allGames")}
          </Link>
          <Link to="/favorites" className="transition-colors hover:text-foreground">
            {t("favTitle")}
          </Link>
          <Link to="/search" className="transition-colors hover:text-foreground">
            {t("footerSearch")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
