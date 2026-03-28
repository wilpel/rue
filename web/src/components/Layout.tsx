import { Outlet, NavLink } from "react-router-dom";
import { Home, MessageCircle, FolderKanban, Bot, Settings } from "lucide-react";

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/chat", icon: MessageCircle, label: "Chat" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/agents", icon: Bot, label: "Agents" },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-amber-50/50 text-stone-800 flex">
      <nav className="w-56 bg-white/80 border-r border-amber-100 p-4 flex flex-col gap-1">
        <div className="px-3 py-4 mb-4">
          <h1 className="text-2xl font-bold text-amber-800">rue</h1>
          <p className="text-xs text-stone-400 mt-1">your ai companion</p>
        </div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-amber-100 text-amber-900"
                  : "text-stone-500 hover:bg-amber-50 hover:text-stone-700"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
        <div className="mt-auto">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? "bg-amber-100 text-amber-900" : "text-stone-500 hover:bg-amber-50 hover:text-stone-700"
              }`
            }
          >
            <Settings size={18} />
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
