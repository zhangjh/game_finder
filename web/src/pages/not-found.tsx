import { useLocation } from "react-router";

import { Seo } from "../components/seo";
import { useI18n } from "../i18n";

export function NotFoundPage() {
  const location = useLocation();
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 text-center text-muted">
      <Seo
        title={t("notFoundSeoTitle")}
        description={t("notFoundSeoDesc")}
        path={location.pathname}
        noIndex
      />
      {t("notFoundText")}
    </div>
  );
}
