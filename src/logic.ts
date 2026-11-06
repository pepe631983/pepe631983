import { addons, menu, packages } from "./data";
import type {
  Addon,
  Busy,
  Clock,
  Draft,
  Quote,
  QuoteLine,
  Seat,
  Status,
  VehicleKind,
  Visit,
  Slot,
} from "./types";

export const TIME_ZONE = "America/Grand_Turk";
export const BAYS = 3;
export const BAY_OPEN = 8 * 60;
export const BAY_CLOSE = 18 * 60;
export const KITCHEN_OPEN = 12 * 60;
export const KITCHEN_LAST = 22 * 60 + 30;
export const BAR_LAST = 23 * 60 + 30;
export const DISCOUNT_PERCENT = 10;
export const DISCOUNT_FOOD_CENTS = 1800;
export const DISCOUNT_PACKAGES = new Set(["completo", "premium", "detalle"]);

export const VEHICLE_PERCENT: Record<VehicleKind, number> = {
  moto: 70,
  sedan: 100,
  suv: 118,
  pickup: 128,
};

export const VEHICLE_LABEL: Record<VehicleKind, string> = {
  moto: "Moto",
  sedan: "Sedán",
  suv: "SUV",
  pickup: "Pickup",
};

export const VEHICLE_ORDER: VehicleKind[] = ["moto", "sedan", "suv", "pickup"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;
const SEATS = new Set<Seat>(["patio", "barra", "salon", "llevar"]);
const VEHICLES = new Set<VehicleKind>(["moto", "sedan", "suv", "pickup"]);
const STATUSES = new Set<Status>(["confirmada", "en-bahia", "en-mesa", "lista", "cancelada"]);

export function moneyCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.trunc(abs / 100);
  const rem = abs % 100;
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = rem === 0 ? `$${grouped}` : `$${grouped}.${String(rem).padStart(2, "0")}`;
  return negative ? `−${body}` : body;
}

export function minutesToLabel(mins: number): string {
  const normalized = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function labelToMinutes(label: string): number {
  const [h, m] = label.split(":").map(Number);
  return h * 60 + m;
}

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const yyyy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function datesFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

function dateAtNoon(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDay(iso: string): string {
  const label = new Intl.DateTimeFormat("es", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(dateAtNoon(iso));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatLongDay(iso: string): string {
  const label = new Intl.DateTimeFormat("es", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dateAtNoon(iso));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function dayChip(date: string, today: string): string {
  if (date === today) return "Hoy";
  if (date === addDays(today, 1)) return "Mañana";
  return formatDay(date);
}

export function nowMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

export function bayShort(nowMin: number): string {
  if (nowMin < BAY_OPEN) return "Bahía abre 8:00";
  if (nowMin >= BAY_CLOSE) return "Bahía cerrada";
  return "Bahía abierta";
}

export function kitchenShort(nowMin: number): string {
  if (nowMin < KITCHEN_OPEN) return "Cocina abre 12:00";
  if (nowMin > BAR_LAST) return "Barra cerrada";
  if (nowMin > KITCHEN_LAST) return "Barra aún abierta";
  return "Cocina abierta";
}

export function discountNote(): string {
  return `Con Completo, Premium o Detalle, si la cocina suma ${moneyCents(DISCOUNT_FOOD_CENTS)} o más, el ${DISCOUNT_PERCENT}% de la comida corre por la casa. La barra y el lavado se cobran enteros.`;
}

export function vehicleNote(): string {
  const moto = 100 - VEHICLE_PERCENT.moto;
  const suv = VEHICLE_PERCENT.suv - 100;
  const pickup = VEHICLE_PERCENT.pickup - 100;
  return `La lista es de sedán. Moto −${moto}%, SUV +${suv}%, pickup +${pickup}%.`;
}

export function lastSeating(hasFood: boolean): number {
  return hasFood ? KITCHEN_LAST : BAR_LAST;
}

export function scaleCents(priceDollars: number, kind: VehicleKind): number {
  return Math.round(priceDollars * VEHICLE_PERCENT[kind]);
}

export function addonCents(addon: Addon, kind: VehicleKind): number {
  if (addon.kinds && !addon.kinds.includes(kind)) return 0;
  return addon.scales ? scaleCents(addon.price, kind) : addon.price * 100;
}

export function emptyDraft(date = todayISO()): Draft {
  return {
    date,
    washPackageId: null,
    addonIds: [],
    vehicleKind: "sedan",
    plate: "",
    color: "",
    washTime: null,
    diningTime: null,
    seat: "patio",
    party: 2,
    lines: [],
    name: "",
    phone: "",
    note: "",
  };
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function normalizeDraft(input: unknown, opts: { bumpPastTo?: string } = {}): Draft {
  const today = opts.bumpPastTo ?? todayISO();
  const base = emptyDraft(today);
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<Draft>;
  const vehicleKind = VEHICLES.has(raw.vehicleKind as VehicleKind)
    ? (raw.vehicleKind as VehicleKind)
    : base.vehicleKind;
  const seat = SEATS.has(raw.seat as Seat) ? (raw.seat as Seat) : base.seat;
  let date = typeof raw.date === "string" && ISO_DATE.test(raw.date) ? raw.date : today;
  let washTime = typeof raw.washTime === "string" && CLOCK.test(raw.washTime) ? raw.washTime : null;
  let diningTime = typeof raw.diningTime === "string" && CLOCK.test(raw.diningTime) ? raw.diningTime : null;
  if (opts.bumpPastTo && date < opts.bumpPastTo) {
    date = opts.bumpPastTo;
    washTime = null;
    diningTime = null;
  }
  const washPackageId = packages.some((item) => item.id === raw.washPackageId) ? raw.washPackageId ?? null : null;
  const addonIds = Array.isArray(raw.addonIds)
    ? raw.addonIds.filter((id): id is string => {
        if (typeof id !== "string") return false;
        const addon = addons.find((item) => item.id === id);
        return Boolean(addon && (!addon.kinds || addon.kinds.includes(vehicleKind)));
      })
    : [];
  const merged = new Map<string, number>();
  if (Array.isArray(raw.lines)) {
    for (const line of raw.lines) {
      if (!line || typeof line !== "object") continue;
      const itemId = (line as { itemId?: unknown }).itemId;
      const qty = Number((line as { qty?: unknown }).qty);
      if (typeof itemId !== "string" || !menu.some((item) => item.id === itemId)) continue;
      if (!Number.isFinite(qty)) continue;
      const next = Math.min(12, Math.max(0, Math.round(qty)));
      if (next <= 0) continue;
      merged.set(itemId, Math.min(12, (merged.get(itemId) ?? 0) + next));
    }
  }
  const party = Number.isFinite(Number(raw.party))
    ? Math.min(12, Math.max(1, Math.round(Number(raw.party))))
    : base.party;
  return {
    date,
    washPackageId,
    addonIds: washPackageId ? addonIds : [],
    vehicleKind,
    plate: clip(raw.plate, 10).toUpperCase(),
    color: clip(raw.color, 24),
    washTime: washPackageId ? washTime : null,
    diningTime,
    seat,
    party,
    lines: [...merged.entries()].map(([itemId, qty]) => ({ itemId, qty })),
    name: clip(raw.name, 60),
    phone: clip(raw.phone, 20),
    note: clip(raw.note, 180),
  };
}

function isQuoteLine(value: unknown): value is QuoteLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<QuoteLine>;
  return (
    typeof line.id === "string" &&
    typeof line.label === "string" &&
    Number.isInteger(line.amountCents) &&
    (line.kind === "wash" || line.kind === "addon" || line.kind === "item" || line.kind === "discount")
  );
}

export function normalizeVisits(input: unknown): Visit[] {
  if (!Array.isArray(input)) return [];
  const visits: Visit[] = [];
  for (const item of input.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<Visit>;
    if (typeof raw.code !== "string" || !/^OL-[A-Z0-9]{4,8}$/.test(raw.code)) continue;
    const lines = Array.isArray(raw.lines)
      ? raw.lines.filter(isQuoteLine).slice(0, 40).map((line) => ({
          ...line,
          id: line.id.slice(0, 40),
          label: line.label.slice(0, 80),
        }))
      : [];
    if (lines.length === 0) continue;
    const summed = lines.reduce((sum, line) => sum + line.amountCents, 0);
    const totalCents = Number.isInteger(raw.totalCents) ? Number(raw.totalCents) : summed;
    if (Math.abs(totalCents) > 1_000_000) continue;
    const createdAt =
      typeof raw.createdAt === "string" && !Number.isNaN(Date.parse(raw.createdAt))
        ? raw.createdAt
        : new Date().toISOString();
    visits.push({
      code: raw.code,
      createdAt,
      status: STATUSES.has(raw.status as Status) ? (raw.status as Status) : "confirmada",
      draft: normalizeDraft(raw.draft),
      lines,
      totalCents,
    });
  }
  return visits;
}

export function cartKinds(draft: Draft): { food: boolean; drink: boolean; items: number } {
  let food = false;
  let drink = false;
  let items = 0;
  for (const line of draft.lines) {
    if (line.qty <= 0) continue;
    const item = menu.find((entry) => entry.id === line.itemId);
    if (!item) continue;
    items += line.qty;
    if (item.area === "cocina") food = true;
    else drink = true;
  }
  return { food, drink, items };
}

export function buildQuote(draft: Draft): Quote {
  const lines: QuoteLine[] = [];
  let washCents = 0;
  let foodCents = 0;
  let drinkCents = 0;
  const pkg = packages.find((item) => item.id === draft.washPackageId);
  if (pkg) {
    const amountCents = scaleCents(pkg.price, draft.vehicleKind);
    washCents += amountCents;
    lines.push({
      id: pkg.id,
      label: `${pkg.name} · ${VEHICLE_LABEL[draft.vehicleKind]}`,
      amountCents,
      kind: "wash",
    });
    for (const id of draft.addonIds) {
      const addon = addons.find((item) => item.id === id);
      if (!addon) continue;
      const amount = addonCents(addon, draft.vehicleKind);
      if (amount <= 0) continue;
      washCents += amount;
      lines.push({ id: addon.id, label: addon.name, amountCents: amount, kind: "addon" });
    }
  }
  for (const line of draft.lines) {
    const item = menu.find((entry) => entry.id === line.itemId);
    if (!item || line.qty <= 0) continue;
    const amountCents = item.price * 100 * line.qty;
    if (item.area === "cocina") foodCents += amountCents;
    else drinkCents += amountCents;
    lines.push({
      id: item.id,
      label: line.qty > 1 ? `${item.name} × ${line.qty}` : item.name,
      amountCents,
      kind: "item",
    });
  }
  const eligible = Boolean(pkg && DISCOUNT_PACKAGES.has(pkg.id) && foodCents >= DISCOUNT_FOOD_CENTS);
  const discountCents = eligible ? Math.round((foodCents * DISCOUNT_PERCENT) / 100) : 0;
  if (discountCents > 0) {
    lines.push({
      id: "descuento",
      label: "La casa invita el 10% de la cocina",
      amountCents: -discountCents,
      kind: "discount",
    });
  }
  return {
    lines,
    washCents,
    foodCents,
    drinkCents,
    discountCents,
    totalCents: washCents + foodCents + drinkCents - discountCents,
  };
}

export function freeBays(busy: Busy[], start: number, duration: number): number {
  const end = start + duration;
  let used = 0;
  for (const bay of busy) {
    if (bay.start < end && start < bay.end) used += 1;
  }
  return Math.max(0, BAYS - used);
}

export function washSlots(
  date: string,
  durationMin: number,
  today: string,
  nowMin: number,
  busy: Busy[] = [],
): Slot[] {
  const slots: Slot[] = [];
  for (let t = BAY_OPEN; t + durationMin <= BAY_CLOSE; t += 30) {
    let state: Slot["state"] = "open";
    if (date < today || (date === today && t <= nowMin)) state = "past";
    else if (freeBays(busy, t, durationMin) <= 0) state = "full";
    slots.push({ time: minutesToLabel(t), state });
  }
  return slots;
}

export function diningSlots(date: string, today: string, nowMin: number, lastMin: number): Slot[] {
  const slots: Slot[] = [];
  for (let t = KITCHEN_OPEN; t <= lastMin; t += 30) {
    const past = date < today || (date === today && t <= nowMin);
    slots.push({ time: minutesToLabel(t), state: past ? "past" : "open" });
  }
  return slots;
}

export function busyByDate(visits: Visit[]): Map<string, Busy[]> {
  const map = new Map<string, Busy[]>();
  for (const visit of visits) {
    if (visit.status === "cancelada") continue;
    const pkg = packages.find((item) => item.id === visit.draft.washPackageId);
    if (!pkg || !visit.draft.washTime) continue;
    const start = labelToMinutes(visit.draft.washTime);
    const list = map.get(visit.draft.date) ?? [];
    list.push({ start, end: start + pkg.minutes });
    map.set(visit.draft.date, list);
  }
  return map;
}

export function nextBay(
  today: string,
  nowMin: number,
  busy: Map<string, Busy[]>,
  duration = 20,
): { date: string; time: string } | null {
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(today, index);
    const open = washSlots(date, duration, today, nowMin, busy.get(date) ?? []).find((slot) => slot.state === "open");
    if (open) return { date, time: open.time };
  }
  return null;
}

export function issues(
  draft: Draft,
  clock: Clock,
  busy: Busy[],
): { blocking: string[]; personal: string[] } {
  const blocking: string[] = [];
  const personal: string[] = [];
  const quote = buildQuote(draft);
  const kinds = cartKinds(draft);
  const hasWash = Boolean(draft.washPackageId);
  const hasOrder = kinds.items > 0;
  if (!hasWash && !hasOrder) blocking.push("Elige un lavado, un plato o una copa.");
  if (hasWash) {
    const pkg = packages.find((item) => item.id === draft.washPackageId);
    if (!draft.washTime) {
      blocking.push("Elige la hora de la bahía.");
    } else if (pkg) {
      const slot = washSlots(draft.date, pkg.minutes, clock.today, clock.nowMin, busy).find(
        (item) => item.time === draft.washTime,
      );
      if (!slot || slot.state === "past") blocking.push("Esa hora de bahía ya pasó.");
      else if (slot.state === "full") blocking.push("Esa bahía está llena. Elige otra hora.");
    }
  }
  if (hasOrder && !draft.diningTime) {
    blocking.push(draft.seat === "llevar" ? "Elige la hora para recoger." : "Elige la hora de la mesa.");
  } else if (hasOrder && draft.diningTime) {
    const slot = diningSlots(draft.date, clock.today, clock.nowMin, lastSeating(kinds.food)).find(
      (item) => item.time === draft.diningTime,
    );
    if (!slot || slot.state !== "open") {
      blocking.push(kinds.food ? "Esa hora de cocina ya no está disponible." : "Esa hora de barra ya no está disponible.");
    }
  }
  if (quote.totalCents <= 0) blocking.push("La visita está vacía.");
  if (draft.name.trim().length < 2) personal.push("Escribe el nombre de quien llega.");
  if (draft.phone.trim() && !/^[0-9+\s()-]{7,20}$/.test(draft.phone.trim())) {
    personal.push("Revisa el teléfono.");
  }
  return { blocking, personal };
}

export function validate(
  draft: Draft,
  clock: Clock,
  busy: Busy[],
): { ok: true } | { ok: false; reason: string } {
  const found = issues(draft, clock, busy);
  const reason = found.blocking[0] ?? found.personal[0];
  if (reason) return { ok: false, reason };
  return { ok: true };
}

export function makeCode(taken: Set<string>, rand: () => number = Math.random): string {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const body = Math.floor(rand() * 36 ** 4)
      .toString(36)
      .toUpperCase()
      .padStart(4, "0");
    const code = `OL-${body}`;
    if (!taken.has(code)) return code;
  }
  return `OL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export function qtyOf(draft: Draft, itemId: string): number {
  return draft.lines.find((line) => line.itemId === itemId)?.qty ?? 0;
}

export function visitCount(draft: Draft): number {
  return (draft.washPackageId ? 1 : 0) + cartKinds(draft).items;
}
