export function SettingsPage() {
  return (
    <div className="h-screen flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#0e0e0e] px-6 py-4">
        <h1 className="text-lg font-semibold text-[#e5e5e5]">Settings</h1>
      </div>
      <div className="flex-1 p-6">
        <div className="max-w-2xl">
          <div className="bg-[#141414] rounded-xl border border-[#1a1a1a] p-6">
            <h2 className="font-semibold text-[#e5e5e5] mb-4">Daemon</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[#888]">Status</span>
                <span className="text-[#4ade80] font-medium">Connected</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Endpoint</span>
                <span className="text-[#aaa] font-mono">ws://localhost:18800</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#888]">Version</span>
                <span className="text-[#aaa]">0.1.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
