export const DEFAULT_TENANT_ID = 'ventas';
export const DEFAULT_TENANT_SLUG = 'ventas';
export const DEFAULT_TENANT_NAME = 'Ventas Bio';

export function tenantIdOrDefault(tenantId?: string | null) {
  return tenantId || DEFAULT_TENANT_ID;
}
