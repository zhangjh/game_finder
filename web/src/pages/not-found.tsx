import { useLocation } from "react-router";

import { Seo } from "../components/seo";

export function NotFoundPage() {
  const location = useLocation();
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 text-center text-muted">
      <Seo
        title="页面不存在 | 玩什么 PlayWhat"
        description="你访问的页面不存在或已经移除。"
        path={location.pathname}
        noIndex
      />
      页面不存在
    </div>
  );
}
