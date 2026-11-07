import { HOUSE, SERVICE_LABEL, SERVICES, VEHICLE_LABEL, VEHICLE_PERCENT, catalog } from "./data.js";
import type { CartLine, DayReport, Pay, Product, Sale, ServiceId, ServiceTotals, VehicleKind } from "./types.js";

export const TIME_ZONE = "America/Grand_Turk";
export const TAPE_WIDTH = 32;

export function emptyTotals(): ServiceTotals {
  return { bar: 0, restaurante: 0, lavado: 0 };
}

export function moneyExact(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.trunc(abs / 100);
  const rem = abs % 100;
  const grouped = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `$${grouped}.${String(rem).padStart(2, "0")}`;
  return negative ? `−${body}` : body;
}

export type CashIdea = { label: string; cents: number };

export function cashSuggestions(totalCents: number): CashIdea[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) return [];
  const ideas: CashIdea[] = [{ label: "Exacto", cents: totalCents }];
  const nextDollar = Math.ceil(totalCents / 100) * 100;
  const pool = [nextDollar, 500, 1000, 2000, 5000, 10000, 20000].filter(
    (cents) => cents > totalCents && cents <= 100_000_00,
  );
  for (const cents of pool) {
    if (ideas.some((idea) => idea.cents === cents)) continue;
    ideas.push({ label: cents % 100 === 0 ? `$${cents / 100}` : moneyExact(cents), cents });
    if (ideas.length === 3) break;
  }
  return ideas;
}

export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [dollars, fraction = ""] = cleaned.split(".");
  const cents = Number(dollars) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100_000_00) return null;
  return cents;
}

export function buttonCents(product: Product): number {
  return product.priceCents ?? Math.round(product.price * 100);
}

export function unitCents(product: Product, vehicle: VehicleKind): number {
  const base = buttonCents(product);
  if (!product.scales) return base;
  return Math.round((base * VEHICLE_PERCENT[vehicle]) / 100);
}

export function productById(id: string, buttons: Product[] = catalog): Product | undefined {
  return buttons.find((item) => item.id === id);
}

export function visibleProducts(service: ServiceId, vehicle: VehicleKind, buttons: Product[] = catalog): Product[] {
  return buttons.filter((item) => item.service === service && (!item.kinds || item.kinds.includes(vehicle)));
}

export function vehicleNote(): string {
  const signed = (percent: number) => {
    const delta = percent - 100;
    return delta > 0 ? `+${delta}%` : `${delta}%`;
  };
  return `Lista de sedán. Moto ${signed(VEHICLE_PERCENT.moto)}, SUV ${signed(VEHICLE_PERCENT.suv)}, pickup ${signed(VEHICLE_PERCENT.pickup)}.`;
}

function lineKey(product: Product, vehicle: VehicleKind, cents: number): string {
  const size = product.scales ? vehicle : "-";
  return `${product.id}:${size}:${cents}`;
}

function lineName(product: Product, vehicle: VehicleKind): string {
  if (product.scales) return `${product.name} · ${VEHICLE_LABEL[vehicle]}`;
  return product.name;
}

export function addProduct(lines: CartLine[], product: Product, vehicle: VehicleKind): CartLine[] {
  const cents = unitCents(product, vehicle);
  const key = lineKey(product, vehicle, cents);
  const found = lines.find((line) => line.key === key);
  if (found) {
    if (found.qty >= 99) return lines;
    return lines.map((line) => (line.key === key ? { ...line, qty: line.qty + 1 } : line));
  }
  return [
    ...lines,
    {
      key,
      productId: product.id,
      service: product.service,
      name: lineName(product, vehicle),
      qty: 1,
      unitCents: cents,
    },
  ];
}

export function setLineQty(lines: CartLine[], key: string, qty: number): CartLine[] {
  const next = Math.max(0, Math.min(99, Math.round(qty)));
  if (next === 0) return lines.filter((line) => line.key !== key);
  return lines.map((line) => (line.key === key ? { ...line, qty: next } : line));
}

export function lineCents(line: CartLine): number {
  return line.unitCents * line.qty;
}

export function sumLines(lines: CartLine[], serviceIds: string[] = []): { byService: ServiceTotals; totalCents: number } {
  const byService: ServiceTotals = {};
  for (const id of serviceIds) byService[id] = 0;
  for (const line of lines) byService[line.service] = (byService[line.service] ?? 0) + lineCents(line);
  const totalCents = Object.values(byService).reduce((sum, value) => sum + value, 0);
  return { byService, totalCents };
}

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("day")}/${pick("month")}/${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

export function formatDayLabel(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const [year, month, date] = day.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function ticketNumber(n: number): string {
  return String(Math.max(1, Math.trunc(n))).padStart(4, "0");
}

const DEFAULT_SERVICES = SERVICES.map((id) => ({ id, name: SERVICE_LABEL[id] }));

export function closeSale(
  lines: CartLine[],
  pay: Pay,
  tenderedCents: number | null,
  at: string,
  sequence: number,
  services = DEFAULT_SERVICES,
): Sale | { error: string } {
  if (lines.length === 0) return { error: "La cuenta está vacía." };
  const { byService, totalCents } = sumLines(lines, services.map((service) => service.id));
  if (totalCents <= 0) return { error: "La cuenta está vacía." };
  const snapshot = services.map((service) => ({ ...service }));
  if (pay === "efectivo") {
    if (tenderedCents === null) return { error: "Escribe el efectivo recibido." };
    if (tenderedCents < totalCents) return { error: "El efectivo no cubre el total." };
    return {
      number: ticketNumber(sequence),
      at,
      lines: lines.map((line) => ({ ...line })),
      services: snapshot,
      byService: { ...byService },
      totalCents,
      pay,
      tenderedCents,
      changeCents: tenderedCents - totalCents,
    };
  }
  return {
    number: ticketNumber(sequence),
    at,
    lines: lines.map((line) => ({ ...line })),
    services: snapshot,
    byService: { ...byService },
    totalCents,
    pay,
    tenderedCents: totalCents,
    changeCents: 0,
  };
}

export function report(sales: Sale[], day: string): DayReport {
  const byService: ServiceTotals = {};
  const services: { id: string; name: string }[] = [];
  let totalCents = 0;
  let cashCents = 0;
  let cardCents = 0;
  let tickets = 0;
  for (const sale of sales) {
    if (dayKey(sale.at) !== day) continue;
    tickets += 1;
    for (const service of sale.services) {
      if (!services.some((item) => item.id === service.id)) services.push({ ...service });
      else {
        const found = services.find((item) => item.id === service.id);
        if (found) found.name = service.name;
      }
      byService[service.id] = (byService[service.id] ?? 0) + (sale.byService[service.id] ?? 0);
    }
    totalCents += sale.totalCents;
    if (sale.pay === "efectivo") cashCents += sale.totalCents;
    else cardCents += sale.totalCents;
  }
  return { day, tickets, services, byService, totalCents, cashCents, cardCents };
}

function center(text: string): string {
  const value = text.slice(0, TAPE_WIDTH);
  const pad = Math.max(0, TAPE_WIDTH - value.length);
  return `${" ".repeat(Math.floor(pad / 2))}${value}`;
}

function row(left: string, right: string): string {
  const value = right.slice(0, 12);
  const room = TAPE_WIDTH - value.length - 1;
  const label = left.slice(0, Math.max(0, room));
  return `${label}${" ".repeat(Math.max(1, TAPE_WIDTH - label.length - value.length))}${value}`;
}

function rule(): string {
  return "-".repeat(TAPE_WIDTH);
}

function itemRows(line: CartLine): string[] {
  const right = moneyExact(lineCents(line));
  const left = `${line.qty} ${line.name}`;
  if (left.length + right.length + 1 <= TAPE_WIDTH) return [row(left, right)];
  return [left.slice(0, TAPE_WIDTH), row("", right)];
}

export function thermalText(sale: Sale): string {
  const services = sale.services.length ? sale.services : DEFAULT_SERVICES;
  const out = [center(HOUSE.name.toUpperCase()), center(HOUSE.street), center(HOUSE.place), rule()];
  out.push(row("Ticket", sale.number), row("Fecha", formatWhen(sale.at)), rule());
  for (const service of services) {
    const group = sale.lines.filter((line) => line.service === service.id);
    if (group.length === 0) continue;
    out.push(service.name.toUpperCase());
    for (const line of group) out.push(...itemRows(line));
  }
  out.push(rule());
  for (const service of services) out.push(row(service.name, moneyExact(sale.byService[service.id] ?? 0)));
  out.push(rule(), row("TOTAL", moneyExact(sale.totalCents)));
  if (sale.pay === "efectivo") {
    out.push(row("Efectivo", moneyExact(sale.tenderedCents)), row("Cambio", moneyExact(sale.changeCents)));
  } else {
    out.push(row("Tarjeta", moneyExact(sale.totalCents)));
  }
  out.push(rule(), center("Gracias"), center("Comprobante de caja"));
  return out.join("\n");
}

export function closeText(dayReport: DayReport): string {
  const out = [
    center(HOUSE.name.toUpperCase()),
    center("CIERRE DEL DIA"),
    center(formatDayLabel(dayReport.day)),
    rule(),
    row("Tickets", String(dayReport.tickets)),
    rule(),
  ];
  for (const service of dayReport.services) {
    out.push(row(service.name, moneyExact(dayReport.byService[service.id] ?? 0)));
  }
  out.push(
    rule(),
    row("TOTAL", moneyExact(dayReport.totalCents)),
    row("Efectivo", moneyExact(dayReport.cashCents)),
    row("Tarjeta", moneyExact(dayReport.cardCents)),
    rule(),
    center("Cierre de caja"),
  );
  return out.join("\n");
}

const SERVICE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PAYS = new Set<Pay>(["efectivo", "tarjeta"]);

export function normalizeLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];
  const lines: CartLine[] = [];
  for (const item of input.slice(0, 80)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<CartLine>;
    if (typeof raw.key !== "string" || typeof raw.productId !== "string" || typeof raw.name !== "string") continue;
    if (typeof raw.service !== "string" || !SERVICE_ID.test(raw.service)) continue;
    const qty = Number(raw.qty);
    const unitCents = Number(raw.unitCents);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) continue;
    if (!Number.isInteger(unitCents) || unitCents < 0 || unitCents > 100_000_00) continue;
    lines.push({
      key: raw.key.slice(0, 80),
      productId: raw.productId.slice(0, 40),
      service: raw.service,
      name: raw.name.slice(0, 80),
      qty,
      unitCents,
    });
  }
  return lines;
}

function normalizeServices(input: unknown, lines: CartLine[]): { id: string; name: string }[] {
  const services: { id: string; name: string }[] = [];
  if (Array.isArray(input)) {
    for (const item of input.slice(0, 40)) {
      if (!item || typeof item !== "object") continue;
      const raw = item as { id?: unknown; name?: unknown };
      if (typeof raw.id !== "string" || !SERVICE_ID.test(raw.id)) continue;
      if (typeof raw.name !== "string" || raw.name.trim() === "") continue;
      if (services.some((service) => service.id === raw.id)) continue;
      services.push({ id: raw.id, name: raw.name.trim().slice(0, 40) });
    }
  }
  if (services.length > 0) return services;
  for (const line of lines) {
    if (services.some((service) => service.id === line.service)) continue;
    services.push({ id: line.service, name: SERVICE_LABEL[line.service as keyof typeof SERVICE_LABEL] ?? line.service });
  }
  return services;
}

export function normalizeSales(input: unknown): Sale[] {
  if (!Array.isArray(input)) return [];
  const sales: Sale[] = [];
  for (const item of input.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<Sale>;
    if (typeof raw.number !== "string" || !/^\d{4,6}$/.test(raw.number)) continue;
    if (typeof raw.at !== "string" || Number.isNaN(Date.parse(raw.at))) continue;
    if (!PAYS.has(raw.pay as Pay)) continue;
    if ((raw as { voided?: boolean }).voided === true) continue;
    const lines = normalizeLines(raw.lines);
    if (lines.length === 0) continue;
    const services = normalizeServices(raw.services, lines);
    const summed = sumLines(lines, services.map((service) => service.id));
    const byService: ServiceTotals = {};
    const rawTotals = raw.byService && typeof raw.byService === "object" ? raw.byService : {};
    for (const service of services) {
      const value = Number(rawTotals[service.id]);
      byService[service.id] = Number.isInteger(value) ? value : (summed.byService[service.id] ?? 0);
    }
    const totalCents = Number.isInteger(raw.totalCents) ? Number(raw.totalCents) : summed.totalCents;
    const tenderedCents = Number.isInteger(raw.tenderedCents) ? Number(raw.tenderedCents) : totalCents;
    const changeCents = Number.isInteger(raw.changeCents) ? Number(raw.changeCents) : 0;
    if (Math.abs(totalCents) > 100_000_00) continue;
    sales.push({
      number: raw.number,
      at: raw.at,
      lines,
      services,
      byService,
      totalCents,
      pay: raw.pay as Pay,
      tenderedCents,
      changeCents,
    });
  }
  return sales;
}
