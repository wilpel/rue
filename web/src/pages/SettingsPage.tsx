export function SettingsPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-border-subtle bg-surface-1/50 px-6 py-3.5">
        <h1 className="text-sm font-semibold text-text-secondary tracking-wide">Settings</h1>
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-lg animate-fade-in">
          <div className="bg-surface-1 rounded-xl border border-border-subtle p-6">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-[0.1em] mb-5">Daemon</h2>
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
