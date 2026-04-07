import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-text tracking-tight">Rue</h1>
          <p className="text-secondary mt-1 text-sm">Sign in to your AI daemon</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red/10 border border-red/20 text-red text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm text-secondary mb-1.5">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-surface border border-line rounded-lg px-3.5 py-2.5 text-text placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-secondary mb-1.5">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-surface border border-line rounded-lg px-3.5 py-2.5 text-text placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent/90 text-bg font-medium rounded-lg py-2.5 transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-muted text-xs mt-6">
          Rue v0.1 — Always-on AI daemon
        </p>
      </div>
    </div>
  );
}
