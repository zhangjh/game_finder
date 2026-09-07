import { Route, Routes } from "react-router";

import { Layout } from "./components/layout";
import { DetailPage } from "./pages/detail";
import { FavoritesPage } from "./pages/favorites";
import { GamesPage } from "./pages/games";
import { HighQualityPage } from "./pages/high-quality";
import { HomePage } from "./pages/home";
import { SearchPage } from "./pages/search";

// 隐藏管理后台（T2.3）：不进导航/footer，知道 URL + 密码才能访问
import { AdminPage } from "./pages/admin";

export function App() {
  return (
    <Routes>
      <Route path="admin/*" element={<AdminPage />} />
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="high-quality" element={<HighQualityPage />} />
        <Route path="game/:slug" element={<DetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route
          path="*"
          element={
            <div className="mx-auto max-w-6xl px-4 py-20 text-center text-muted">
              页面不存在
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
