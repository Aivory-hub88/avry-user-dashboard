// Fail-fast env loader. Previously these URLs defaulted to the old compromised
// VPS (43.156.108.96), which silently routed prod traffic to a host running a
// Monero miner when env vars were absent. Refusing to fall back is intentional:
// better a loud 500 than quiet traffic leakage.
//
// Three contexts to consider:
//   1. Runtime, server-side: throw if env missing — this is the real fail-fast.
//   2. Build-time (NEXT_PHASE=phase-production-build): return placeholder so
//      Next.js page-data collection doesn't crash before docker even runs.
//   3. Runtime, browser: process.env is empty (Next.js only exposes
//      NEXT_PUBLIC_*). Throwing here would break the page bundle for modules
//      that happen to be imported by client components. Return empty string;
//      callers that actually need the value on the client must reach a server
//      API route or use a NEXT_PUBLIC_* variant.

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    if (typeof window !== 'undefined') {
      // Browser bundle — env not available. Don't crash module load.
      return '';
    }
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      return 'http://__missing_env_at_build_time__';
    }
    throw new Error(
      `${name} env var is required — refusing to fall back to a compromised default host`
    );
  }
  return v.replace(/\/$/, '');
}
