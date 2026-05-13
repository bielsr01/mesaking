export const PDV_STATUSES = ["preparing", "delivered", "cancelled", "all"] as const;
export const DELIVERY_STATUSES = ["pending", "preparing", "out_for_delivery", "awaiting_pickup", "delivered", "cancelled", "active", "all"] as const;
export const IFOOD_STATUSES = DELIVERY_STATUSES;

export type PdvStatus = typeof PDV_STATUSES[number];
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];

type StatusMap<T extends readonly string[]> = { [K in T[number]]: boolean };

export type Permissions = {
  overview: { view: boolean };
  orders: {
    view: boolean;
    channels: { pdv: boolean; delivery: boolean; pickup: boolean; ifood: boolean };
    statuses: {
      pdv: StatusMap<typeof PDV_STATUSES>;
      delivery: StatusMap<typeof DELIVERY_STATUSES>;
      ifood: StatusMap<typeof IFOOD_STATUSES>;
    };
    edit: boolean;
    change_status: boolean;
    create_pdv_order: boolean;
  };
  menu: { view: boolean; edit: boolean };
  customers: { view: boolean; create: boolean; edit: boolean; delete: boolean };
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
  expenses: { view: boolean; edit: boolean };
  finance: { view: boolean };
  access_management: { view: boolean };
};

const buildStatusMap = <T extends readonly string[]>(keys: T, value: boolean): StatusMap<T> =>
  Object.fromEntries(keys.map((k) => [k, value])) as StatusMap<T>;

export const FULL_PERMISSIONS: Permissions = {
  overview: { view: true },
  orders: {
    view: true,
    channels: { pdv: true, delivery: true, pickup: true, ifood: true },
    statuses: {
      pdv: buildStatusMap(PDV_STATUSES, true),
      delivery: buildStatusMap(DELIVERY_STATUSES, true),
      ifood: buildStatusMap(IFOOD_STATUSES, true),
    },
    edit: true,
    change_status: true,
    create_pdv_order: true,
  },
  menu: { view: true, edit: true },
  customers: { view: true, create: true, edit: true, delete: true },
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
  expenses: { view: true, edit: true },
  finance: { view: true },
  access_management: { view: true },
};

export const EMPTY_PERMISSIONS: Permissions = {
  overview: { view: false },
  orders: {
    view: false,
    channels: { pdv: false, delivery: false, pickup: false, ifood: false },
    statuses: {
      pdv: buildStatusMap(PDV_STATUSES, false),
      delivery: buildStatusMap(DELIVERY_STATUSES, false),
      ifood: buildStatusMap(IFOOD_STATUSES, false),
    },
    edit: false,
    change_status: false,
    create_pdv_order: false,
  },
  menu: { view: false, edit: false },
  customers: { view: false, create: false, edit: false, delete: false },
  marketing: { coupons: { view: false, edit: false }, bulk: { view: false, edit: false } },
  loyalty: {
    view: false,
    toggle_program: false,
    credit_points: false,
    redeem_points: false,
    manual_adjust: false,
    member_create: false,
    member_delete: false,
    rewards: { view: false, edit: false, delete: false },
  },
  settings: { view: false },
  supply_orders: { view: false, edit: false },
  stock: { view: false, edit: false },
  expenses: { view: false, edit: false },
  finance: { view: false },
  access_management: { view: false },
};

const PERMISSION_DEPENDENCIES: Record<string, string> = {
  "orders.channels.pdv": "orders.view",
  "orders.channels.delivery": "orders.view",
  "orders.channels.pickup": "orders.view",
  "orders.channels.ifood": "orders.view",
  "orders.change_status": "orders.view",
  "orders.edit": "orders.view",
  "orders.create_pdv_order": "orders.channels.pdv",
  ...Object.fromEntries(PDV_STATUSES.map((s) => [`orders.statuses.pdv.${s}`, "orders.channels.pdv"])),
  ...Object.fromEntries(DELIVERY_STATUSES.map((s) => [`orders.statuses.delivery.${s}`, "orders.channels.delivery"])),
  ...Object.fromEntries(IFOOD_STATUSES.map((s) => [`orders.statuses.ifood.${s}`, "orders.channels.ifood"])),
  "menu.edit": "menu.view",
  "customers.create": "customers.view",
  "customers.edit": "customers.view",
  "customers.delete": "customers.view",
  "marketing.coupons.edit": "marketing.coupons.view",
  "marketing.bulk.edit": "marketing.bulk.view",
  "loyalty.toggle_program": "loyalty.view",
  "loyalty.member_create": "loyalty.view",
  "loyalty.member_delete": "loyalty.view",
  "loyalty.credit_points": "loyalty.view",
  "loyalty.redeem_points": "loyalty.view",
  "loyalty.manual_adjust": "loyalty.view",
  "loyalty.rewards.view": "loyalty.view",
  "loyalty.rewards.edit": "loyalty.rewards.view",
  "loyalty.rewards.delete": "loyalty.rewards.view",
  "supply_orders.edit": "supply_orders.view",
  "stock.edit": "stock.view",
  "expenses.edit": "expenses.view",
};

// Chaves adicionadas após o primeiro release. Se o grupo não tiver o campo
// salvo (legado) e o "pai" estiver habilitado, herdar do pai para não bloquear
// quem já tinha permissão antes de a chave existir.
const LEGACY_INHERIT_FROM_PARENT: string[] = [
  "expenses.edit",
  ...PDV_STATUSES.map((s) => `orders.statuses.pdv.${s}`),
  ...DELIVERY_STATUSES.map((s) => `orders.statuses.delivery.${s}`),
  ...IFOOD_STATUSES.map((s) => `orders.statuses.ifood.${s}`),
];

function pathDefined(obj: any, path: string): boolean {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys) {
    if (!o || typeof o !== "object" || !(k in o)) return false;
    o = o[k];
  }
  return true;
}

export function mergePermissions(partial: any): Permissions {
  const base: any = JSON.parse(JSON.stringify(EMPTY_PERMISSIONS));
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
  for (const child of LEGACY_INHERIT_FROM_PARENT) {
    if (!pathDefined(partial, child)) {
      const parent = PERMISSION_DEPENDENCIES[child];
      if (parent && getPerm(base as Permissions, parent)) setPerm(base, child, true);
    }
  }
  for (const [child, parent] of Object.entries(PERMISSION_DEPENDENCIES)) {
    if (!getPerm(base, parent)) setPerm(base, child, false);
  }
  return base as Permissions;
}

function setPerm(perms: any, path: string, value: boolean) {
  const keys = path.split(".");
  let obj = perms;
  for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
  obj[keys[keys.length - 1]] = value;
}

export function getPerm(perms: Permissions | undefined | null, path: string): any {
  if (!perms) return undefined;
  return path.split(".").reduce((o: any, k) => (o ? o[k] : undefined), perms);
}
