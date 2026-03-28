import { Outlet, NavLink } from "react-router-dom";
import { Home, MessageCircle, FolderKanban, Bot, Settings } from "lucide-react";

const nav = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/chat", icon: MessageCircle, label: "Chat" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/agents", icon: Bot, label: "Agents" },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-bg flex">
      <nav className="w-[200px] bg-bg border-r border-border flex flex-col px-3 py-5">
        <div className="px-3 mb-8 flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse-accent" />
          <span className="text-base font-bold text-text-primary tracking-tight">rue</span>
        </div>

        <div className="flex flex-col gap-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-accent-muted text-accent"
                    : "text-text-muted hover:text-text-secondary hover:bg-surface"
                }`
              }
            >
              <Icon size={16} strokeWidth={1.5} />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="mt-auto">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
                isActive ? "bg-accent-muted text-accent" : "text-text-muted hover:text-text-secondary hover:bg-surface"
              }`
            }
          >
            <Settings size={16} strokeWidth={1.5} />
            Settings
          </NavLink>
        </div>
      </nav>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
