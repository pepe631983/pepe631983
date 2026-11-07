import { catalog, SERVICE_LABEL, SERVICES } from "../data.js";
import { closeSale, todayISO, unitCents } from "../logic.js";
import type { CartLine, Pay, Product, Sale, ServiceRef, VehicleKind } from "../types.js";

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const IMAGE = /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i;
const VEHICLES = new Set<VehicleKind>(["moto", "sedan", "suv", "pickup"]);

export type Viewer = {
  kind: "person" | "key";
  sub: string;
  email: string;
  name: string;
  appVisibility: "private" | "team" | "public";
  teamRole?: "admin" | "member" | "service";
  stage: "production" | "preview";
};

export type StoredButton = {
  id: string;
  serviceId: string;
  name: string;
  priceCents: number;
  category: string;
  image: string;
  scales: boolean;
  kinds: VehicleKind[];
  sort: number;
  active: boolean;
};

export type StoredService = {
  id: string;
  name: string;
  sort: number;
  active: boolean;
};

export type Slice = {
  services: StoredService[];
  buttons: StoredButton[];
  menu: { day: string; buttonId: string }[];
  sales: Sale[];
  admins: { sub: string; email: string; name: string }[];
  nextNumber: number;
};

export function emptySlice(): Slice {
  return { services: [], buttons: [], menu: [], sales: [], admins: [], nextNumber: 1 };
}

export function ensureSeed(slice: Slice, day = todayISO()): Slice {
  if (slice.services.length > 0) return slice;
  return {
    ...slice,
    services: SERVICES.map((id, index) => ({ id, name: SERVICE_LABEL[id] ?? id, sort: index, active: true })),
    buttons: catalog.map((item, index) => ({
      id: item.id,
      serviceId: item.service,
      name: item.name,
      priceCents: Math.round(item.price * 100),
      category: item.category,
      image: "",
      scales: item.scales,
      kinds: item.kinds ?? [],
      sort: index,
      active: true,
    })),
    menu: catalog.map((item) => ({ day, buttonId: item.id })),
  };
}

export function viewerIsAdmin(slice: Slice, viewer: Viewer): boolean {
  if (viewer.kind !== "person") return false;
  if (viewer.appVisibility === "team" && viewer.teamRole === "admin") return true;
  return slice.admins.some((admin) => admin.sub === viewer.sub);
}

export function rememberViewer(slice: Slice, viewer: Viewer): Slice {
  if (viewer.kind !== "person") return slice;
  const known = slice.admins.find((admin) => admin.sub === viewer.sub);
  if (known) {
    if (known.name === "" && known.email === "") return slice;
    return {
      ...slice,
      admins: slice.admins.map((admin) => (admin.sub === viewer.sub ? { ...admin, email: "", name: "" } : admin)),
    };
  }
  const firstPrivate = viewer.appVisibility === "private" && slice.admins.length === 0;
  const teamAdmin = viewer.appVisibility === "team" && viewer.teamRole === "admin";
  if (!firstPrivate && !teamAdmin) return slice;
  return {
    ...slice,
    admins: [...slice.admins, { sub: viewer.sub, email: "", name: "" }],
  };
}

export function toProduct(button: StoredButton): Product {
  return {
    id: button.id,
    service: button.serviceId,
    category: button.category,
    name: button.name,
    price: button.priceCents / 100,
    priceCents: button.priceCents,
    scales: button.scales,
    kinds: button.kinds.length ? button.kinds : undefined,
    image: button.image || undefined,
  };
}

export function activeServices(slice: Slice): ServiceRef[] {
  return slice.services
    .filter((service) => service.active)
    .sort((left, right) => left.sort - right.sort)
    .map((service) => ({ id: service.id, name: service.name }));
}

function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return slug || "servicio";
}

function uniqueId(name: string, taken: Set<string>): string {
  const base = slugify(name);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const next = `${base.slice(0, 28)}-${n}`;
    if (!taken.has(next)) return next;
  }
  return `${base.slice(0, 24)}-${Date.now().toString(36)}`;
}

export function cleanImage(value: unknown): string | { error: string } {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || !IMAGE.test(value)) return { error: "La imagen tiene que ser JPEG, PNG o WebP." };
  if (value.length > 180_000) return { error: "La imagen es demasiado grande." };
  return value;
}

function cleanName(value: unknown): string | { error: string } {
  if (typeof value !== "string") return { error: "Falta el nombre." };
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) return { error: "El nombre necesita entre 1 y 40 letras." };
  return name;
}

export function createService(slice: Slice, rawName: unknown): Slice | { error: string } {
  const name = cleanName(rawName);
  if (typeof name !== "string") return name;
  if (slice.services.length >= 20) return { error: "Hay demasiados servicios." };
  const id = uniqueId(name, new Set(slice.services.map((service) => service.id)));
  const sort = slice.services.reduce((max, service) => Math.max(max, service.sort), -1) + 1;
  return { ...slice, services: [...slice.services, { id, name, sort, active: true }] };
}

export function renameService(slice: Slice, id: string, rawName: unknown): Slice | { error: string } {
  const name = cleanName(rawName);
  if (typeof name !== "string") return name;
  if (!slice.services.some((service) => service.id === id)) return { error: "No está ese servicio." };
  return {
    ...slice,
    services: slice.services.map((service) => (service.id === id ? { ...service, name } : service)),
  };
}

export function saveButton(
  slice: Slice,
  input: {
    id?: string;
    serviceId?: string;
    name?: unknown;
    priceCents?: unknown;
    category?: unknown;
    image?: unknown;
    scales?: unknown;
    hideOnMoto?: unknown;
    active?: unknown;
  },
): Slice | { error: string } {
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  const priceCents = Number(input.priceCents);
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_00) {
    return { error: "El precio no es válido." };
  }
  const serviceId = typeof input.serviceId === "string" ? input.serviceId : "";
  if (!slice.services.some((service) => service.id === serviceId && service.active)) {
    return { error: "Elige un servicio." };
  }
  const image = cleanImage(input.image);
  if (typeof image !== "string") return image;
  const category = typeof input.category === "string" ? input.category.trim().slice(0, 32) : "";
  const scales = input.scales === true;
  const kinds: VehicleKind[] = input.hideOnMoto === true ? ["sedan", "suv", "pickup"] : [];
  if (input.id) {
    if (!ID.test(input.id) || !slice.buttons.some((button) => button.id === input.id)) {
      return { error: "No está ese botón." };
    }
    return {
      ...slice,
      buttons: slice.buttons.map((button) =>
        button.id === input.id
          ? { ...button, serviceId, name, priceCents, category, image, scales, kinds, active: input.active !== false }
          : button,
      ),
    };
  }
  if (slice.buttons.length >= 200) return { error: "Hay demasiados botones." };
  const id = uniqueId(name, new Set([...slice.buttons.map((button) => button.id), ...slice.services.map((service) => service.id)]));
  const sort = slice.buttons.reduce((max, button) => Math.max(max, button.sort), -1) + 1;
  return {
    ...slice,
    buttons: [
      ...slice.buttons,
      { id, serviceId, name, priceCents, category, image, scales, kinds, sort, active: true },
    ],
  };
}

export function setMenu(slice: Slice, day: string, buttonIds: unknown): Slice | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "El día no es válido." };
  if (!Array.isArray(buttonIds)) return { error: "Falta el menú." };
  const allowed = new Set(slice.buttons.filter((button) => button.active).map((button) => button.id));
  const ids = [...new Set(buttonIds.filter((id): id is string => typeof id === "string" && allowed.has(id)))];
  return {
    ...slice,
    menu: [...slice.menu.filter((item) => item.day !== day), ...ids.map((buttonId) => ({ day, buttonId }))],
  };
}

function vehicleOf(key: string): VehicleKind {
  const part = key.split(":")[1];
  return VEHICLES.has(part as VehicleKind) ? (part as VehicleKind) : "sedan";
}

export function reprice(slice: Slice, lines: CartLine[], day: string, previous?: Sale): CartLine[] | { error: string } {
  const menu = new Set(slice.menu.filter((item) => item.day === day).map((item) => item.buttonId));
  const next: CartLine[] = [];
  for (const line of lines.slice(0, 80)) {
    const button = slice.buttons.find((item) => item.id === line.productId && item.active);
    if (!button) return { error: "Hay un producto que ya no está en el menú." };
    const prior = previous?.lines.find((item) => item.key === line.key);
    if (!previous && !menu.has(button.id)) return { error: "Ese producto no está en el menú de hoy." };
    const qty = Math.max(1, Math.min(99, Math.round(Number(line.qty))));
    if (!Number.isInteger(qty)) return { error: "La cantidad no es válida." };
    const vehicle = vehicleOf(line.key || `${button.id}:${button.scales ? "sedan" : "-"}:0`);
    if (button.kinds.length && !button.kinds.includes(vehicle)) return { error: `${button.name} no aplica a ese vehículo.` };
    const product = toProduct(button);
    const unit = prior ? prior.unitCents : unitCents(product, vehicle);
    const key = prior?.key ?? `${button.id}:${button.scales ? vehicle : "-"}:${unit}`;
    const name = prior?.name ?? (button.scales ? `${button.name} · ${vehicleLabel(vehicle)}` : button.name);
    const found = next.find((item) => item.key === key);
    if (found) found.qty = Math.min(99, found.qty + qty);
    else next.push({ key, productId: button.id, service: button.serviceId, name, qty, unitCents: unit });
  }
  if (next.length === 0) return { error: "La cuenta está vacía." };
  return next;
}

function vehicleLabel(vehicle: VehicleKind): string {
  if (vehicle === "moto") return "Moto";
  if (vehicle === "suv") return "SUV";
  if (vehicle === "pickup") return "Pickup";
  return "Sedán";
}

export function openServices(slice: Slice, day: string): ServiceRef[] {
  const ids = new Set(slice.menu.filter((item) => item.day === day).map((item) => item.buttonId));
  const used = new Set(slice.buttons.filter((button) => ids.has(button.id)).map((button) => button.serviceId));
  return activeServices(slice).filter((service) => used.has(service.id));
}

export function charge(slice: Slice, lines: CartLine[], pay: Pay, tendered: number | null, at: string, day: string): { slice: Slice; sale: Sale } | { error: string } {
  const priced = reprice(slice, lines, day);
  if ("error" in priced) return priced;
  const services = openServices(slice, day);
  const result = closeSale(priced, pay, tendered, at, slice.nextNumber, services);
  if ("error" in result) return result;
  return {
    slice: { ...slice, sales: [result, ...slice.sales].slice(0, 500), nextNumber: slice.nextNumber + 1 },
    sale: result,
  };
}

export function editSale(
  slice: Slice,
  number: string,
  lines: CartLine[],
  pay: Pay,
  tendered: number | null,
): { slice: Slice; sale: Sale } | { error: string } {
  const current = slice.sales.find((sale) => sale.number === number);
  if (!current) return { error: "No está esa venta." };
  const priced = reprice(slice, lines, todayISO(), current);
  if ("error" in priced) return priced;
  const services = current.services.map((service) => {
    const fresh = slice.services.find((item) => item.id === service.id);
    return { id: service.id, name: fresh?.name ?? service.name };
  });
  for (const line of priced) {
    if (services.some((service) => service.id === line.service)) continue;
    const fresh = slice.services.find((item) => item.id === line.service);
    if (fresh) services.push({ id: fresh.id, name: fresh.name });
  }
  const result = closeSale(priced, pay, tendered, current.at, Number(current.number), services.length ? services : current.services);
  if ("error" in result) return result;
  const sale = { ...result, number: current.number };
  return { slice: { ...slice, sales: slice.sales.map((item) => (item.number === number ? sale : item)) }, sale };
}

export function deleteSale(slice: Slice, number: string): Slice | { error: string } {
  if (!slice.sales.some((sale) => sale.number === number)) return { error: "No está esa venta." };
  return { ...slice, sales: slice.sales.filter((sale) => sale.number !== number) };
}

export function menuIds(slice: Slice, day: string): string[] {
  return slice.menu.filter((item) => item.day === day).map((item) => item.buttonId);
}

export function buttonsFor(slice: Slice, day: string, admin: boolean): StoredButton[] {
  const ids = new Set(menuIds(slice, day));
  return slice.buttons
    .filter((button) => button.active && (admin || ids.has(button.id)))
    .sort((left, right) => left.sort - right.sort);
}
