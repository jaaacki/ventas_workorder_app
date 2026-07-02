export const CRUD_ACTIONS = ['read', 'create', 'update', 'delete', 'restore', 'readDeleted', 'readAudit'] as const;

export type CrudAction = (typeof CRUD_ACTIONS)[number];

export const PROCUREMENT_RESOURCES = [
  'procurement.supplyEntity',
  'procurement.collectionPoint',
  'procurement.collectionUnit',
  'procurement.issuanceOrder',
  'procurement.issuanceOrderLine',
  'procurement.collectionUnitFulfilment',
  'procurement.collectionOrder',
  'procurement.collectionReceipt',
  'procurement.collectionReceiptLine',
  'procurement.importReport',
] as const;

export const INVENTORY_RESOURCES = [
  'inventory.reference',
  'inventory.location',
  'inventory.sku',
  'inventory.lot',
  'inventory.transaction',
  'inventory.balance',
  'inventory.genealogy',
  'inventory.workOrderConsumption',
  'inventory.importReport',
] as const;

export const ADMIN_PERMISSIONS = [
  permissionKey('auth.user', 'create'),
  permissionKey('auth.user', 'read'),
  permissionKey('auth.user', 'update'),
  permissionKey('auth.role', 'read'),
  permissionKey('auth.role', 'update'),
] as const;

export function permissionKey(resource: string, action: string): string {
  return `${resource}.${action}`;
}

export function crudPermissions(resource: string) {
  return CRUD_ACTIONS.map((action) => ({
    key: permissionKey(resource, action),
    resource,
    action,
    description: `${action} ${resource}`,
  }));
}

export const ALL_OPERATIONAL_PERMISSIONS = [
  ...PROCUREMENT_RESOURCES.flatMap((resource) => crudPermissions(resource)),
  ...INVENTORY_RESOURCES.flatMap((resource) => crudPermissions(resource)),
  ...ADMIN_PERMISSIONS.map((key) => {
    const parts = key.split('.');
    return {
      key,
      resource: parts.slice(0, -1).join('.'),
      action: parts.at(-1) ?? key,
      description: key,
    };
  }),
];

function keysFor(resources: readonly string[], actions: readonly CrudAction[]) {
  return resources.flatMap((resource) => actions.map((action) => permissionKey(resource, action)));
}

const procurementRead = keysFor(PROCUREMENT_RESOURCES, ['read']);
const procurementWrite = keysFor(PROCUREMENT_RESOURCES, ['create', 'update', 'delete', 'restore', 'readDeleted', 'readAudit']);
const inventoryRead = keysFor(INVENTORY_RESOURCES, ['read']);
const inventoryWrite = keysFor(INVENTORY_RESOURCES, ['create', 'update', 'delete', 'restore', 'readDeleted', 'readAudit']);

export const ROLE_PERMISSION_KEYS: Record<string, string[]> = {
  owner: ALL_OPERATIONAL_PERMISSIONS.map((permission) => permission.key),
  admin: ALL_OPERATIONAL_PERMISSIONS.map((permission) => permission.key).filter((key) => key !== permissionKey('auth.role', 'update')),
  procurement_manager: [...procurementRead, ...procurementWrite, ...inventoryRead],
  inventory_manager: [...inventoryRead, ...inventoryWrite, ...procurementRead],
  production_manager: [
    ...procurementRead,
    ...inventoryRead,
    permissionKey('procurement.collectionUnit', 'update'),
    permissionKey('procurement.collectionUnitFulfilment', 'create'),
    permissionKey('procurement.collectionUnitFulfilment', 'update'),
    permissionKey('inventory.lot', 'update'),
    permissionKey('inventory.transaction', 'create'),
    permissionKey('inventory.workOrderConsumption', 'create'),
    permissionKey('inventory.workOrderConsumption', 'update'),
    permissionKey('inventory.genealogy', 'create'),
  ],
  qa_manager: [
    ...procurementRead,
    ...inventoryRead,
    permissionKey('procurement.collectionUnit', 'update'),
    permissionKey('procurement.collectionReceiptLine', 'update'),
    permissionKey('inventory.lot', 'update'),
    permissionKey('inventory.transaction', 'readAudit'),
    permissionKey('inventory.lot', 'readAudit'),
  ],
  operator: [
    ...procurementRead,
    ...inventoryRead,
    permissionKey('procurement.collectionUnitFulfilment', 'create'),
    permissionKey('inventory.transaction', 'create'),
    permissionKey('inventory.workOrderConsumption', 'create'),
  ],
  viewer: [...procurementRead, ...inventoryRead],
  user: [...procurementRead, ...inventoryRead],
};
