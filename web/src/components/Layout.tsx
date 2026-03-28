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
    <div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] flex">
      <nav className="w-56 bg-[#0e0e0e] border-r border-[#1a1a1a] p-4 flex flex-col gap-1">
        <div className="px-3 py-4 mb-4">
          <h1 className="text-2xl font-bold text-[#c8a050]">rue</h1>
          <p className="text-xs text-[#555] mt-1">your ai companion</p>
        </div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#1a1a1a] text-[#c8a050]"
                  : "text-[#888] hover:bg-[#141414] hover:text-[#e5e5e5]"
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
                isActive ? "bg-[#1a1a1a] text-[#c8a050]" : "text-[#888] hover:bg-[#141414] hover:text-[#e5e5e5]"
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
