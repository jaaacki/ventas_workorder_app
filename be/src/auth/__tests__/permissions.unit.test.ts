import { describe, it, expect } from 'vitest';
import {
  ALL_OPERATIONAL_PERMISSIONS,
  ROLE_PERMISSION_KEYS,
  WORKORDER_PERMISSIONS,
  permissionKey,
} from '../permissions.js';

const wo = (action: string) => permissionKey('workOrder', action);

describe('workOrder permission catalog', () => {
  it('registers every workOrder.* key in the operational catalog so the seed creates them', () => {
    const catalogKeys = new Set(ALL_OPERATIONAL_PERMISSIONS.map((permission) => permission.key));
    expect(WORKORDER_PERMISSIONS).toEqual([
      'workOrder.create',
      'workOrder.execute',
      'workOrder.advance',
      'workOrder.release',
      'workOrder.combine',
      'workOrder.collect',
    ]);
    for (const key of WORKORDER_PERMISSIONS) {
      expect(catalogKeys.has(key), key).toBe(true);
    }
  });

  it('exposes a well-formed resource/action/description for each workOrder permission', () => {
    for (const permission of ALL_OPERATIONAL_PERMISSIONS.filter((p) => p.resource === 'workOrder')) {
      expect(permission.key).toBe(`workOrder.${permission.action}`);
      expect(permission.description).toBeTruthy();
    }
  });

  it('grants owner and admin every workOrder action', () => {
    for (const role of ['owner', 'admin'] as const) {
      for (const key of WORKORDER_PERMISSIONS) {
        expect(ROLE_PERMISSION_KEYS[role], `${role} ${key}`).toContain(key);
      }
    }
  });

  it('maps production/QA/operator roles to their intended workOrder actions without lockout', () => {
    // production_manager runs production end to end but not final release or combine.
    expect(ROLE_PERMISSION_KEYS.production_manager).toEqual(
      expect.arrayContaining([wo('create'), wo('execute'), wo('advance'), wo('collect')]),
    );
    expect(ROLE_PERMISSION_KEYS.production_manager).not.toContain(wo('release'));
    expect(ROLE_PERMISSION_KEYS.production_manager).not.toContain(wo('combine'));

    // qa_manager owns the release disposition and can record phase evidence/gates.
    expect(ROLE_PERMISSION_KEYS.qa_manager).toEqual(expect.arrayContaining([wo('execute'), wo('release')]));
    expect(ROLE_PERMISSION_KEYS.qa_manager).not.toContain(wo('create'));

    // operator executes and advances on the floor and can collect.
    expect(ROLE_PERMISSION_KEYS.operator).toEqual(
      expect.arrayContaining([wo('execute'), wo('advance'), wo('collect')]),
    );
    expect(ROLE_PERMISSION_KEYS.operator).not.toContain(wo('release'));
  });

  it('grants no workOrder actions to read-only roles', () => {
    for (const role of ['viewer', 'user'] as const) {
      for (const key of WORKORDER_PERMISSIONS) {
        expect(ROLE_PERMISSION_KEYS[role], `${role} ${key}`).not.toContain(key);
      }
    }
  });
});
