import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '../plugins/auth.js';
import { CrudConflictError, CrudValidationError, type CrudListOptions, type CrudResourceConfig } from '../services/auditedCrudService.js';

const errorResponse = z.object({ error: z.string() });
const dateish = z.union([z.date(), z.string()]);

export const auditLogSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  actorId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: dateish,
});

const crudQuerySchema = z.object({
  q: z.string().optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
  includeDeleted: z.coerce.boolean().optional(),
  supplyEntityId: z.string().optional(),
  status: z.string().optional(),
  inventoryType: z.string().optional(),
  collectionUnitId: z.string().optional(),
  collectionOrderId: z.string().optional(),
  collectionReceiptId: z.string().optional(),
  issuanceOrderId: z.string().optional(),
  inventorySkuId: z.string().optional(),
  inventoryLotId: z.string().optional(),
  inventoryLocationId: z.string().optional(),
  currentLocationId: z.string().optional(),
  workOrderId: z.string().optional(),
  parentInventoryLotId: z.string().optional(),
  childInventoryLotId: z.string().optional(),
  relationshipType: z.string().optional(),
});

const mutationBodySchema = z.record(z.string(), z.unknown());

export interface CrudRouteDefinition<ResourceKey extends string> {
  key: ResourceKey;
  path: string;
  singular: string;
  plural: string;
  config: CrudResourceConfig;
  schema: z.ZodTypeAny;
  filters?: readonly string[];
  requestExample?: Record<string, unknown>;
  operationSuffix?: string;
  skipList?: boolean;
  skipDetail?: boolean;
  skipCreate?: boolean;
  skipUpdate?: boolean;
  skipArchive?: boolean;
  skipRestore?: boolean;
  skipAudit?: boolean;
}

interface CrudRouteServices<ResourceKey extends string> {
  list: (key: ResourceKey, options: CrudListOptions) => Promise<unknown>;
  get: (key: ResourceKey, id: string, tenantId?: string | null, includeDeleted?: boolean) => Promise<unknown>;
  create: (key: ResourceKey, input: { tenantId?: string | null; actor: JwtPayload; payload: Record<string, unknown> }) => Promise<unknown>;
  update: (key: ResourceKey, input: { id: string; tenantId?: string | null; actor: JwtPayload; payload: Record<string, unknown> }) => Promise<unknown>;
  archive: (key: ResourceKey, input: { id: string; tenantId?: string | null; actor: JwtPayload }) => Promise<unknown>;
  restore: (key: ResourceKey, input: { id: string; tenantId?: string | null; actor: JwtPayload }) => Promise<unknown>;
  audit: (key: ResourceKey, input: { id: string; tenantId?: string | null }) => Promise<unknown>;
}

function tenantIdOf(req: { user: unknown }): string {
  return (req.user as JwtPayload).tenantId;
}

function actorOf(req: { user: unknown }): JwtPayload {
  return req.user as JwtPayload;
}

function operationSuffix(path: string) {
  return path
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function filtersFromQuery(query: Record<string, unknown>, allowedFilters: readonly string[] | undefined) {
  const filters: Record<string, unknown> = {};
  for (const key of allowedFilters ?? []) {
    const value = query[key];
    if (value !== undefined && value !== '') filters[key] = value;
  }
  return filters;
}

async function handleCrudError(reply: FastifyReply, error: unknown) {
  if (error instanceof CrudValidationError) return reply.status(400).send({ error: error.message });
  if (error instanceof CrudConflictError) return reply.status(409).send({ error: error.message });
  throw error;
}

export function registerCrudRoutes<ResourceKey extends string>(
  app: FastifyInstance,
  domain: 'Procurement' | 'Inventory',
  definition: CrudRouteDefinition<ResourceKey>,
  services: CrudRouteServices<ResourceKey>,
) {
  const suffix = definition.operationSuffix ?? operationSuffix(definition.path);
  const resource = definition.config.resource;
  const permissionMeta = (action: string) => ({
    'x-auth': 'permission',
    'x-required-permissions': [`${resource}.${action}`],
  });

  if (!definition.skipList) app.get(
    `/${definition.path}`,
    {
      onRequest: [app.requirePermission(resource, 'read')],
      schema: {
        tags: [domain],
        summary: `List ${definition.plural}`,
        description: `List tenant-scoped ${definition.plural}. Deleted records are excluded unless includeDeleted=true and the caller has deleted-read or audit permission.`,
        operationId: `list${suffix}`,
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        ...permissionMeta('read'),
        querystring: crudQuerySchema,
        response: { 200: z.array(definition.schema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req, reply) => {
      const query = req.query as z.infer<typeof crudQuerySchema>;
      if (query.includeDeleted) {
        await app.requireAnyPermission([{ resource, action: 'readDeleted' }, { resource, action: 'readAudit' }])(req as FastifyRequest, reply);
        if (reply.sent) return;
      }
      return services.list(definition.key, {
        tenantId: tenantIdOf(req),
        q: query.q,
        take: query.take,
        includeDeleted: query.includeDeleted,
        filters: filtersFromQuery(query, definition.filters),
      });
    },
  );

  if (!definition.skipDetail) app.get(
    `/${definition.path}/:id`,
    {
      onRequest: [app.requirePermission(resource, 'read')],
      schema: {
        tags: [domain],
        summary: `Get ${definition.singular}`,
        description: `Read one tenant-scoped ${definition.singular} by id.`,
        operationId: `get${suffix}`,
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        ...permissionMeta('read'),
        params: z.object({ id: z.string() }),
        querystring: z.object({ includeDeleted: z.coerce.boolean().optional() }),
        response: { 200: definition.schema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const query = req.query as { includeDeleted?: boolean };
      if (query.includeDeleted) {
        await app.requireAnyPermission([{ resource, action: 'readDeleted' }, { resource, action: 'readAudit' }])(req as FastifyRequest, reply);
        if (reply.sent) return;
      }
      const row = await services.get(definition.key, (req.params as { id: string }).id, tenantIdOf(req), query.includeDeleted);
      if (!row) return reply.status(404).send({ error: `${definition.singular} not found` });
      return row;
    },
  );

  if (!definition.skipCreate) app.post(
    `/${definition.path}`,
    {
      onRequest: [app.requirePermission(resource, 'create')],
      schema: {
        tags: [domain],
        summary: `Create ${definition.singular}`,
        description: `Create a tenant-scoped ${definition.singular}. Referenced records must belong to the same tenant.`,
        operationId: `create${suffix}`,
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        ...permissionMeta('create'),
        body: mutationBodySchema,
        response: { 201: definition.schema, 400: errorResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        const row = await services.create(definition.key, {
          tenantId: tenantIdOf(req),
          actor: actorOf(req),
          payload: req.body as Record<string, unknown>,
        });
        return reply.status(201).send(row);
      } catch (error) {
        return handleCrudError(reply, error);
      }
    },
  );

  if (!definition.skipUpdate) app.patch(
    `/${definition.path}/:id`,
    {
      onRequest: [app.requirePermission(resource, 'update')],
      schema: {
        tags: [domain],
        summary: `Update ${definition.singular}`,
        description: `Patch a tenant-scoped ${definition.singular}. Archived rows must be restored before normal updates.`,
        operationId: `update${suffix}`,
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        ...permissionMeta('update'),
        params: z.object({ id: z.string() }),
        body: mutationBodySchema,
        response: { 200: definition.schema, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse },
      },
    },
    async (req, reply) => {
      try {
        const row = await services.update(definition.key, {
          id: (req.params as { id: string }).id,
          tenantId: tenantIdOf(req),
          actor: actorOf(req),
          payload: req.body as Record<string, unknown>,
        });
        if (!row) return reply.status(404).send({ error: `${definition.singular} not found` });
        return row;
      } catch (error) {
        return handleCrudError(reply, error);
      }
    },
  );

  if (!definition.skipArchive) app.delete(
    `/${definition.path}/:id`,
    {
      onRequest: [app.requirePermission(resource, 'delete')],
      schema: {
        tags: [domain],
        summary: `Archive ${definition.singular}`,
        description: `Soft-delete/archive a tenant-scoped ${definition.singular}. This never physically removes the row.`,
        operationId: `archive${suffix}`,
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        ...permissionMeta('delete'),
        params: z.object({ id: z.string() }),
        response: { 200: definition.schema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const row = await services.archive(definition.key, {
        id: (req.params as { id: string }).id,
        tenantId: tenantIdOf(req),
        actor: actorOf(req),
      });
      if (!row) return reply.status(404).send({ error: `${definition.singular} not found` });
      return row;
    },
  );

  if (!definition.skipRestore) app.patch(
    `/${definition.path}/:id/restore`,
    {
      onRequest: [app.requirePermission(resource, 'restore')],
      schema: {
        tags: [domain],
        summary: `Restore ${definition.singular}`,
        description: `Restore a previously archived tenant-scoped ${definition.singular}.`,
        operationId: `restore${suffix}`,
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        ...permissionMeta('restore'),
        params: z.object({ id: z.string() }),
        response: { 200: definition.schema, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    async (req, reply) => {
      const row = await services.restore(definition.key, {
        id: (req.params as { id: string }).id,
        tenantId: tenantIdOf(req),
        actor: actorOf(req),
      });
      if (!row) return reply.status(404).send({ error: `${definition.singular} not found` });
      return row;
    },
  );

  if (!definition.skipAudit) app.get(
    `/${definition.path}/:id/audit`,
    {
      onRequest: [app.requirePermission(resource, 'readAudit')],
      schema: {
        tags: [domain],
        summary: `List ${definition.singular} audit events`,
        description: `Read append-only audit events for one tenant-scoped ${definition.singular}.`,
        operationId: `list${suffix}Audit`,
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        ...permissionMeta('readAudit'),
        params: z.object({ id: z.string() }),
        response: { 200: z.array(auditLogSchema), 401: errorResponse, 403: errorResponse },
      },
    },
    async (req) => services.audit(definition.key, { id: (req.params as { id: string }).id, tenantId: tenantIdOf(req) }),
  );
}
