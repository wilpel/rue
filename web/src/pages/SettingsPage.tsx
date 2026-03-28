export function SettingsPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-amber-100 bg-white/60 px-6 py-4">
        <h1 className="text-lg font-semibold text-stone-700">Settings</h1>
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-2xl">
          <div className="bg-white rounded-xl border border-amber-100 p-6 shadow-sm">
            <h2 className="font-semibold text-stone-700 mb-4">Daemon</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">Status</span>
                <span className="text-green-600 font-medium">Connected</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Endpoint</span>
                <span className="text-stone-600 font-mono">ws://localhost:18800</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Version</span>
                <span className="text-stone-600">0.1.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
