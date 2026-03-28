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
    <div className="min-h-screen bg-surface flex">
      {/* Gold accent line at very top */}
      <div className="fixed top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold/40 to-transparent z-50" />

      <nav className="w-52 bg-surface-1 border-r border-border-subtle flex flex-col p-3 pt-6">
        <div className="px-3 mb-8 flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-gold animate-pulse-gold" />
          <span className="text-lg font-semibold text-gold tracking-wide">rue</span>
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
                    ? "bg-gold/10 text-gold"
                    : "text-text-muted hover:text-text-secondary hover:bg-surface-2"
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
                isActive ? "bg-gold/10 text-gold" : "text-text-muted hover:text-text-secondary hover:bg-surface-2"
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
