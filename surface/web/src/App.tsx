import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { Home } from "./pages/Home.tsx";
import { Bodies } from "./pages/Bodies.tsx";
import { BodyDetail } from "./pages/BodyDetail.tsx";
import { MeetingPage } from "./pages/MeetingPage.tsx";
import { Issues } from "./pages/Issues.tsx";
import { IssueDetailPage } from "./pages/IssueDetail.tsx";
import { Domains, DomainDetail } from "./pages/Domains.tsx";
import { TopicPage } from "./pages/TopicPage.tsx";
import { SearchPage } from "./pages/SearchPage.tsx";
import { About } from "./pages/About.tsx";
import { NotFound } from "./pages/NotFound.tsx";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="bodies" element={<Bodies />} />
        <Route path="bodies/:slug" element={<BodyDetail />} />
        <Route path="meetings/:body/:date" element={<MeetingPage />} />
        <Route path="issues" element={<Issues />} />
        <Route path="issues/:slug" element={<IssueDetailPage />} />
        <Route path="domains" element={<Domains />} />
        <Route path="domains/:slug" element={<DomainDetail />} />
        <Route path="topics/:tag" element={<TopicPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
