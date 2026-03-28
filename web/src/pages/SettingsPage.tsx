export function SettingsPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-border-subtle px-6 py-3">
        <h1 className="text-sm font-semibold text-text-secondary">Settings</h1>
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-lg">
          <div className="bg-surface rounded-xl border border-border p-6">
            <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-5">Daemon</h2>
            <div className="space-y-4">
              {[
                { label: "Status", value: "Connected", valueClass: "text-success" },
                { label: "Endpoint", value: "ws://localhost:18800", valueClass: "font-mono text-text-muted" },
                { label: "Version", value: "0.1.0", valueClass: "text-text-muted" },
              ].map(({ label, value, valueClass }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs text-text-muted">{label}</span>
                  <span className={`text-xs ${valueClass}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
