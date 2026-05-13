export type Permissions = {
  overview: { view: boolean };
  orders: {
    view: boolean;
    channels: { pdv: boolean; delivery: boolean; pickup: boolean; ifood: boolean };
    edit: boolean;
    change_status: boolean;
    create_pdv_order: boolean;
  };
  menu: { view: boolean; edit: boolean };
  customers: { view: boolean; edit: boolean; delete: boolean };
  marketing: {
    coupons: { view: boolean; edit: boolean };
    bulk: { view: boolean; edit: boolean };
  };
  loyalty: {
    view: boolean;
    toggle_program: boolean;
    credit_points: boolean;
    redeem_points: boolean;
    manual_adjust: boolean;
    member_create: boolean;
    member_delete: boolean;
    rewards: { view: boolean; edit: boolean; delete: boolean };
  };
  settings: { view: boolean };
  supply_orders: { view: boolean; edit: boolean };
  stock: { view: boolean; edit: boolean };
  expenses: { view: boolean };
  finance: { view: boolean };
  access_management: { view: boolean };
};

export const FULL_PERMISSIONS: Permissions = {
  overview: { view: true },
  orders: {
    view: true,
    channels: { pdv: true, delivery: true, pickup: true, ifood: true },
    edit: true,
    change_status: true,
    create_pdv_order: true,
  },
  menu: { view: true, edit: true },
  customers: { view: true, edit: true, delete: true },
  marketing: { coupons: { view: true, edit: true }, bulk: { view: true, edit: true } },
  loyalty: {
    view: true,
    toggle_program: true,
    credit_points: true,
    redeem_points: true,
    manual_adjust: true,
    member_create: true,
    member_delete: true,
    rewards: { view: true, edit: true, delete: true },
  },
  settings: { view: true },
  supply_orders: { view: true, edit: true },
  stock: { view: true, edit: true },
  expenses: { view: true },
  finance: { view: true },
  access_management: { view: true },
};

export function mergePermissions(partial: any): Permissions {
  const base: any = JSON.parse(JSON.stringify(FULL_PERMISSIONS));
  function merge(b: any, p: any) {
    if (!p || typeof p !== "object") return;
    for (const k of Object.keys(p)) {
      if (b[k] !== null && typeof b[k] === "object" && !Array.isArray(b[k]) && typeof p[k] === "object") {
        merge(b[k], p[k]);
      } else if (p[k] !== undefined) {
        b[k] = p[k];
      }
    }
  }
  merge(base, partial);
  return base as Permissions;
}

export function getPerm(perms: Permissions | undefined | null, path: string): any {
  if (!perms) return undefined;
  return path.split(".").reduce((o: any, k) => (o ? o[k] : undefined), perms);
}

