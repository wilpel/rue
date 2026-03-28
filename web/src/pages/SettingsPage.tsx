export function SettingsPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="h-12 flex items-center px-5 border-b border-line shrink-0">
        <h1 className="text-sm font-semibold text-text">Settings</h1>
      </div>
      <div className="flex-1 p-5">
        <div className="max-w-sm p-4 rounded-lg border border-line bg-surface">
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-3">Daemon</p>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between"><span className="text-muted">Status</span><span className="text-green">Connected</span></div>
            <div className="flex justify-between"><span className="text-muted">Endpoint</span><span className="font-mono text-muted">ws://localhost:18800</span></div>
            <div className="flex justify-between"><span className="text-muted">Version</span><span className="text-muted">0.1.0</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
