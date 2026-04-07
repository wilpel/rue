import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ClientProvider } from "./lib/context";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { ChatPage } from "./pages/ChatPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { AgentsPage } from "./pages/AgentsPage";
import { SecretsPage } from "./pages/SecretsPage";
import { SettingsPage } from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import KnowledgePage from "./pages/KnowledgePage";
import MemoryPage from "./pages/MemoryPage";

function AuthenticatedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-accent animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <ClientProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="projects/*" element={<ProjectsPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="secrets" element={<SecretsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </ClientProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </BrowserRouter>
  );
}
