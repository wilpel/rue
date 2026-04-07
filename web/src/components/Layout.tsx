import { Outlet, NavLink, Link, useLocation } from "react-router-dom";
import { FolderKanban, Bot, Settings, PanelLeftClose, PanelLeft, Plus, ChevronDown, LayoutDashboard, MessageCircle, KeyRound, BookOpen, Brain, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [conversations, setConversations] = useState<Array<{ content: string }>>([]);
  const [showAllChats, setShowAllChats] = useState(false);
  const { user, signOut } = useAuth();
  const location = useLocation();

  useEffect(() => {
    supabase.from("messages").select("content").eq("role", "channel").order("created_at", { ascending: false }).limit(15)
      .then(({ data }) => {
        const userMsgs = (data ?? []).filter((m: Record<string, unknown>) => {
          const content = m.content as string;
          return content && content.length > 5;
        }).slice(0, 8);
        setConversations(userMsgs as Array<{ content: string }>);
      });
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
          <Link to="/chat" className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""} px-3 py-2 rounded-lg border border-line hover:bg-hover text-secondary hover:text-text transition-colors text-[13px]`}>
            <Plus size={14} />
            {!collapsed && "New chat"}
          </Link>
        </div>

        {/* Nav links */}
        <div className="p-2 space-y-0.5">
          <SidebarLink to="/" icon={LayoutDashboard} label="Dashboard" collapsed={collapsed} end />
          <SidebarLink to="/chat" icon={MessageCircle} label="Chat" collapsed={collapsed} />
          <SidebarLink to="/projects" icon={FolderKanban} label="Projects" collapsed={collapsed} />
          <SidebarLink to="/agents" icon={Bot} label="Agents" collapsed={collapsed} />
          <SidebarLink to="/knowledge" icon={BookOpen} label="Knowledge" collapsed={collapsed} />
          <SidebarLink to="/memory" icon={Brain} label="Memory" collapsed={collapsed} />
          <SidebarLink to="/secrets" icon={KeyRound} label="Secrets" collapsed={collapsed} />
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

        {/* User footer */}
        <div className="border-t border-line p-2 shrink-0">
          {!collapsed ? (
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs text-secondary truncate">{user?.email ?? "—"}</span>
              <button onClick={signOut} className="p-1 text-muted hover:text-red transition-colors" title="Sign out">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button onClick={signOut} className="w-full flex justify-center p-1.5 text-muted hover:text-red transition-colors" title="Sign out">
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarLink({ to, icon: Icon, label, collapsed, end }: { to: string; icon: React.ComponentType<{ size?: number }>; label: string; collapsed: boolean; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) =>
      `flex items-center gap-3 ${collapsed ? "justify-center" : ""} px-3 py-2 rounded-lg text-[13px] transition-colors ${
        isActive ? "bg-accent-soft text-accent" : "text-muted hover:text-secondary hover:bg-hover"
      }`
    }>
      <Icon size={16} />
      {!collapsed && label}
    </NavLink>
  );
}
