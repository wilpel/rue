import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClientProvider } from "./lib/context";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { ChatPage } from "./pages/ChatPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { AgentsPage } from "./pages/AgentsPage";
import { SecretsPage } from "./pages/SecretsPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <ClientProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="projects/*" element={<ProjectsPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="secrets" element={<SecretsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </ClientProvider>
    </BrowserRouter>
  );
}
