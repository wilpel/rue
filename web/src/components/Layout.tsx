import { Outlet, NavLink, Link, useLocation } from "react-router-dom";
import { FolderKanban, Bot, Settings, PanelLeftClose, PanelLeft, Plus, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../lib/api";

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [conversations, setConversations] = useState<Array<{ content: string }>>([]);
  const [showAllChats, setShowAllChats] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api.history(15).then(r => {
      setConversations(r.messages.filter(m => m.role === "user").reverse().slice(0, 8));
    }).catch(() => {});
  }, [location.pathname]);

  const visibleChats = showAllChats ? conversations : conversations.slice(0, 3);

  return (
    <div className="h-screen flex bg-bg">
      <div className={`${collapsed ? "w-14" : "w-64"} shrink-0 bg-sidebar flex flex-col border-r border-line transition-all duration-200`}>
        {/* Top: branding + collapse */}
        <div className="h-12 flex items-center justify-between px-3 border-b border-line shrink-0">
          {!collapsed && (
            <Link to="/" className="flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-accent" />
              <span className="text-sm font-semibold text-text">rue</span>
            </Link>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-md text-muted hover:text-secondary hover:bg-hover transition-colors">
            {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* New chat */}
        <div className="p-2 pb-0">
          <Link to="/" className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""} px-3 py-2 rounded-lg border border-line hover:bg-hover text-secondary hover:text-text transition-colors text-[13px]`}>
            <Plus size={14} />
            {!collapsed && "New chat"}
          </Link>
        </div>

        {/* Nav links */}
        <div className="p-2 space-y-0.5">
          <SidebarLink to="/projects" icon={FolderKanban} label="Projects" collapsed={collapsed} />
          <SidebarLink to="/agents" icon={Bot} label="Agents" collapsed={collapsed} />
          <SidebarLink to="/settings" icon={Settings} label="Settings" collapsed={collapsed} />
        </div>

        {/* Recent chats */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto px-2 pt-1 border-t border-line mt-1">
            <p className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-widest">Recent</p>
            {visibleChats.map((c, i) => (
              <Link key={i} to="/chat" className="block px-3 py-1.5 rounded-lg text-xs text-secondary hover:text-text hover:bg-hover transition-colors truncate">
                {c.content}
              </Link>
            ))}
            {conversations.length > 3 && (
              <button
                onClick={() => setShowAllChats(!showAllChats)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted hover:text-secondary transition-colors w-full"
              >
                <ChevronDown size={12} className={`transition-transform ${showAllChats ? "rotate-180" : ""}`} />
                {showAllChats ? "Show less" : `${conversations.length - 3} more`}
              </button>
            )}
          </div>
        )}
      </div>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarLink({ to, icon: Icon, label, collapsed }: { to: string; icon: React.ComponentType<{size?: number}>; label: string; collapsed: boolean }) {
  return (
    <NavLink to={to} className={({ isActive }) =>
      `flex items-center gap-3 ${collapsed ? "justify-center" : ""} px-3 py-2 rounded-lg text-[13px] transition-colors ${
        isActive ? "bg-accent-soft text-accent" : "text-muted hover:text-secondary hover:bg-hover"
      }`
    }>
      <Icon size={16} />
      {!collapsed && label}
    </NavLink>
  );
}
