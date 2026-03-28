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
    <div className="h-screen flex relative overflow-hidden">
      {/* Living background */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Sidebar */}
      <nav className="w-[200px] shrink-0 glass border-r border-glass-border flex flex-col p-3 pt-5 z-10 relative">
        <div className="px-3 mb-8 flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-accent animate-breathe" />
          <span className="text-base font-semibold text-accent tracking-wide">rue</span>
        </div>

        <div className="flex flex-col gap-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-accent-glow text-accent"
                    : "text-text-muted hover:text-text-secondary hover:bg-glass-hover"
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
              `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                isActive ? "bg-accent-glow text-accent" : "text-text-muted hover:text-text-secondary hover:bg-glass-hover"
              }`
            }
          >
            <Settings size={16} strokeWidth={1.5} />
            Settings
          </NavLink>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto z-10 relative">
        <Outlet />
      </main>
    </div>
  );
}
