import type { FastifyInstance } from 'fastify';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(hostHeader: string): string {
  // Strip port; keep bracketed IPv6 intact.
  if (hostHeader.startsWith('[')) {
    const end = hostHeader.indexOf(']');
    return end === -1 ? hostHeader : hostHeader.slice(0, end + 1);
  }
  const colon = hostHeader.indexOf(':');
  return colon === -1 ? hostHeader : hostHeader.slice(0, colon);
}

/**
 * DNS-rebinding guard: a malicious website can point one of its subdomains
 * at 127.0.0.1 and bypass the same-origin policy against localhost servers.
 * Rejecting any request whose Host header is not a local hostname closes
 * that hole for a local-only tool.
 */
export function registerHostGuard(app: FastifyInstance): void {
  const extra = (process.env.FLUENTDB_ALLOW_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const allowed = new Set([...LOCAL_HOSTS, ...extra]);

  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host;
    if (!host || !allowed.has(hostnameOf(host))) {
      return reply
        .code(403)
        .send({ error: 'Forbidden host header (DNS-rebinding protection)' });
    }
  });
}
