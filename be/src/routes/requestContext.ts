import type { JwtPayload } from '../plugins/auth.js';

// Shared request-context accessors for authenticated routes. The auth plugin
// guarantees `req.user` is a JwtPayload on guarded routes.
export function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

export function actorIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).id;
}

export function actorOf(req: { user: unknown }): JwtPayload {
  return req.user as JwtPayload;
}
