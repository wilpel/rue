export function SettingsPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-glass-border glass px-6 py-3.5">
        <h1 className="text-sm font-semibold text-text-secondary">Settings</h1>
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-lg animate-fade-up">
          <div className="glass rounded-2xl p-6">
            <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.1em] mb-5">Daemon</h2>
            <div className="space-y-4">
              {[
                { label: "Status", value: "Connected", cls: "text-success" },
                { label: "Endpoint", value: "ws://localhost:18800", cls: "font-mono text-text-muted" },
                { label: "Version", value: "0.1.0", cls: "text-text-muted" },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs text-text-muted">{label}</span>
                  <span className={`text-xs ${cls}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
