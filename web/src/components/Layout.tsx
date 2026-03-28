import { Outlet, NavLink } from "react-router-dom";
import { MessageCircle, FolderKanban, Bot, Settings, CircleDot } from "lucide-react";

export function Layout() {
  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* Command bar */}
      <header className="h-12 shrink-0 border-b border-line flex items-center px-5 gap-6">
        <NavLink to="/" className="flex items-center gap-2 mr-4">
          <CircleDot size={14} className="text-amber" />
          <span className="text-sm font-semibold text-white tracking-tight">rue</span>
        </NavLink>

        <div className="flex items-center gap-1 h-full">
          <Tab to="/chat" label="Chat" icon={MessageCircle} />
          <Tab to="/projects" label="Projects" icon={FolderKanban} />
          <Tab to="/agents" label="Agents" icon={Bot} />
        </div>

        <div className="ml-auto">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `p-1.5 rounded-md transition-colors ${isActive ? "text-white" : "text-dim hover:text-gray"}`
            }
          >
            <Settings size={15} />
          </NavLink>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function Tab({ to, label, icon: Icon }: { to: string; label: string; icon: React.ComponentType<{ size?: number }> }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 h-full text-[13px] font-medium border-b-2 transition-colors ${
          isActive
            ? "border-amber text-white"
            : "border-transparent text-dim hover:text-gray"
        }`
      }
    >
      <Icon size={14} />
      {label}
    </NavLink>
  );
}
