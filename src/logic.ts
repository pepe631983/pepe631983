import { HOUSE, SERVICE_LABEL, SERVICES, VEHICLE_LABEL, VEHICLE_PERCENT, catalog } from "./data";
import type { CartLine, DayReport, Pay, Product, Sale, ServiceId, ServiceTotals, VehicleKind } from "./types";

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

export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [dollars, fraction = ""] = cleaned.split(".");
  const cents = Number(dollars) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100_000_00) return null;
  return cents;
}

export function unitCents(product: Product, vehicle: VehicleKind): number {
  if (!product.scales) return product.price * 100;
  return Math.round(product.price * VEHICLE_PERCENT[vehicle]);
}

export function productById(id: string): Product | undefined {
  return catalog.find((item) => item.id === id);
}

export function visibleProducts(service: ServiceId, vehicle: VehicleKind): Product[] {
  return catalog.filter(
    (item) => item.service === service && (!item.kinds || item.kinds.includes(vehicle)),
  );
}

export function vehicleNote(): string {
  const signed = (percent: number) => {
    const delta = percent - 100;
    return delta > 0 ? `+${delta}%` : `${delta}%`;
  };
  return `Lista de sedán. Moto ${signed(VEHICLE_PERCENT.moto)}, SUV ${signed(VEHICLE_PERCENT.suv)}, pickup ${signed(VEHICLE_PERCENT.pickup)}.`;
}

function lineKey(product: Product, vehicle: VehicleKind, cents: number): string {
  const size = product.service === "lavado" && product.scales ? vehicle : "-";
  return `${product.id}:${size}:${cents}`;
}

function lineName(product: Product, vehicle: VehicleKind): string {
  if (product.service === "lavado" && product.scales) return `${product.name} · ${VEHICLE_LABEL[vehicle]}`;
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

export function sumLines(lines: CartLine[]): { byService: ServiceTotals; totalCents: number } {
  const byService = emptyTotals();
  for (const line of lines) byService[line.service] += lineCents(line);
  return {
    byService,
    totalCents: byService.bar + byService.restaurante + byService.lavado,
  };
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

export function closeSale(
  lines: CartLine[],
  pay: Pay,
  tenderedCents: number | null,
  at: string,
  sequence: number,
): Sale | { error: string } {
  if (lines.length === 0) return { error: "La cuenta está vacía." };
  const { byService, totalCents } = sumLines(lines);
  if (totalCents <= 0) return { error: "La cuenta está vacía." };
  if (pay === "efectivo") {
    if (tenderedCents === null) return { error: "Escribe el efectivo recibido." };
    if (tenderedCents < totalCents) return { error: "El efectivo no cubre el total." };
    return {
      number: ticketNumber(sequence),
      at,
      lines: lines.map((line) => ({ ...line })),
      byService: { ...byService },
      totalCents,
      pay,
      tenderedCents,
      changeCents: tenderedCents - totalCents,
      voided: false,
    };
  }
  return {
    number: ticketNumber(sequence),
    at,
    lines: lines.map((line) => ({ ...line })),
    byService: { ...byService },
    totalCents,
    pay,
    tenderedCents: totalCents,
    changeCents: 0,
    voided: false,
  };
}

export function report(sales: Sale[], day: string): DayReport {
  const byService = emptyTotals();
  let totalCents = 0;
  let cashCents = 0;
  let cardCents = 0;
  let tickets = 0;
  let voids = 0;
  for (const sale of sales) {
    if (dayKey(sale.at) !== day) continue;
    if (sale.voided) {
      voids += 1;
      continue;
    }
    tickets += 1;
    byService.bar += sale.byService.bar;
    byService.restaurante += sale.byService.restaurante;
    byService.lavado += sale.byService.lavado;
    totalCents += sale.totalCents;
    if (sale.pay === "efectivo") cashCents += sale.totalCents;
    else cardCents += sale.totalCents;
  }
  return { day, tickets, voids, byService, totalCents, cashCents, cardCents };
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
  const out = [center(HOUSE.name.toUpperCase()), center(HOUSE.street), center(HOUSE.place), rule()];
  if (sale.voided) out.push(center("ANULADO"));
  out.push(row("Ticket", sale.number), row("Fecha", formatWhen(sale.at)), rule());
  for (const service of SERVICES) {
    const group = sale.lines.filter((line) => line.service === service);
    if (group.length === 0) continue;
    out.push(SERVICE_LABEL[service].toUpperCase());
    for (const line of group) out.push(...itemRows(line));
  }
  out.push(rule());
  for (const service of SERVICES) out.push(row(SERVICE_LABEL[service], moneyExact(sale.byService[service])));
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
    row("Anulados", String(dayReport.voids)),
    rule(),
  ];
  for (const service of SERVICES) out.push(row(SERVICE_LABEL[service], moneyExact(dayReport.byService[service])));
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

const SERVICES_SET = new Set<ServiceId>(SERVICES);
const PAYS = new Set<Pay>(["efectivo", "tarjeta"]);

export function normalizeLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];
  const lines: CartLine[] = [];
  for (const item of input.slice(0, 80)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<CartLine>;
    if (typeof raw.key !== "string" || typeof raw.productId !== "string" || typeof raw.name !== "string") continue;
    if (!SERVICES_SET.has(raw.service as ServiceId)) continue;
    const qty = Number(raw.qty);
    const unitCents = Number(raw.unitCents);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) continue;
    if (!Number.isInteger(unitCents) || unitCents < 0 || unitCents > 100_000_00) continue;
    lines.push({
      key: raw.key.slice(0, 80),
      productId: raw.productId.slice(0, 40),
      service: raw.service as ServiceId,
      name: raw.name.slice(0, 80),
      qty,
      unitCents,
    });
  }
  return lines;
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
    const lines = normalizeLines(raw.lines);
    if (lines.length === 0) continue;
    const summed = sumLines(lines);
    const byService = raw.byService && typeof raw.byService === "object" ? raw.byService : summed.byService;
    const read = (service: ServiceId) => {
      const value = Number(byService[service]);
      return Number.isInteger(value) ? value : summed.byService[service];
    };
    const stored: ServiceTotals = { bar: read("bar"), restaurante: read("restaurante"), lavado: read("lavado") };
    const totalCents = Number.isInteger(raw.totalCents) ? Number(raw.totalCents) : summed.totalCents;
    const tenderedCents = Number.isInteger(raw.tenderedCents) ? Number(raw.tenderedCents) : totalCents;
    const changeCents = Number.isInteger(raw.changeCents) ? Number(raw.changeCents) : 0;
    if (Math.abs(totalCents) > 100_000_00) continue;
    sales.push({
      number: raw.number,
      at: raw.at,
      lines,
      byService: stored,
      totalCents,
      pay: raw.pay as Pay,
      tenderedCents,
      changeCents,
      voided: raw.voided === true,
    });
  }
  return sales;
}
