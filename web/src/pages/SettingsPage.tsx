export function SettingsPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-line px-6 py-4">
        <h1 className="text-base font-semibold text-white">Settings</h1>
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-md">
          <div className="p-5 rounded-xl border border-line bg-raised">
            <h2 className="text-[11px] font-semibold text-dim uppercase tracking-wider mb-4">Daemon</h2>
            <div className="space-y-3">
              {[
                { l: "Status", v: "Connected", c: "text-green" },
                { l: "Endpoint", v: "ws://localhost:18800", c: "font-code text-dim" },
                { l: "Version", v: "0.1.0", c: "text-dim" },
              ].map(({ l, v, c }) => (
                <div key={l} className="flex justify-between">
                  <span className="text-xs text-dim">{l}</span>
                  <span className={`text-xs ${c}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
