export type Permissions = {
  overview: { view: boolean };
  orders: { view: boolean; scope: "all" | "ifood_only"; edit: boolean; status_only: boolean };
  menu: { view: boolean; edit: boolean };
  customers: { view: boolean; edit: boolean; delete: boolean; manual_adjust: boolean };
  marketing: {
    coupons: { view: boolean; edit: boolean };
    bulk: { view: boolean; edit: boolean };
  };
  loyalty: {
    view: boolean;
    credit_points: boolean;
    redeem_points: boolean;
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
  orders: { view: true, scope: "all", edit: true, status_only: false },
  menu: { view: true, edit: true },
  customers: { view: true, edit: true, delete: true, manual_adjust: true },
  marketing: { coupons: { view: true, edit: true }, bulk: { view: true, edit: true } },
  loyalty: { view: true, credit_points: true, redeem_points: true, rewards: { view: true, edit: true, delete: true } },
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
