import { Route, Routes } from "react-router";

import { Layout } from "./components/layout";
import { ChineseGamesPage } from "./pages/chinese-games";
import { DetailPage } from "./pages/detail";
import { FavoritesPage } from "./pages/favorites";
import { GamesPage } from "./pages/games";
import { HighQualityPage } from "./pages/high-quality";
import { HomePage } from "./pages/home";
import { LandingPage } from "./pages/landing";
import { NotFoundPage } from "./pages/not-found";
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
        <Route path="games/:landingSlug" element={<LandingPage />} />
        <Route path="chinese-games" element={<ChineseGamesPage />} />
        <Route path="high-quality" element={<HighQualityPage />} />
        <Route path="game/:slug" element={<DetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
