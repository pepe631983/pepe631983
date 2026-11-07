import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  closeSale,
  normalizeLines,
  normalizeSales,
  productById,
  addProduct,
  setLineQty,
  sumLines,
  todayISO,
} from "./logic";
import type { CartLine, Pay, Route, Sale, ServiceId, VehicleKind } from "./types";

const STORAGE_KEY = "oleaje.pos.v1";

type Persisted = {
  lines: CartLine[];
  sales: Sale[];
  nextNumber: number;
  service: ServiceId;
  vehicle: VehicleKind;
};

type StoreValue = {
  route: Route;
  receiptNumber: string | null;
  service: ServiceId;
  vehicle: VehicleKind;
  lines: CartLine[];
  sales: Sale[];
  totals: ReturnType<typeof sumLines>;
  today: string;
  setService: (service: ServiceId) => void;
  setVehicle: (vehicle: VehicleKind) => void;
  add: (productId: string) => void;
  setQty: (key: string, qty: number) => void;
  clearTicket: () => void;
  charge: (pay: Pay, tenderedCents: number | null) => { ok: true; number: string } | { ok: false; reason: string };
  voidSale: (number: string) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

const SERVICES = new Set<ServiceId>(["bar", "restaurante", "lavado"]);
const VEHICLES = new Set<VehicleKind>(["moto", "sedan", "suv", "pickup"]);

function load(): Persisted {
  const empty: Persisted = { lines: [], sales: [], nextNumber: 1, service: "bar", vehicle: "sedan" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const sales = normalizeSales(parsed.sales);
    const max = sales.reduce((highest, sale) => Math.max(highest, Number(sale.number) || 0), 0);
    const requested = Number(parsed.nextNumber);
    return {
      lines: normalizeLines(parsed.lines),
      sales,
      nextNumber: Math.max(Number.isInteger(requested) ? requested : 1, max + 1),
      service: SERVICES.has(parsed.service as ServiceId) ? (parsed.service as ServiceId) : "bar",
      vehicle: VEHICLES.has(parsed.vehicle as VehicleKind) ? (parsed.vehicle as VehicleKind) : "sedan",
    };
  } catch {
    return empty;
  }
}

function parseHash(hash = window.location.hash): { route: Route; receiptNumber: string | null } {
  const path = hash.replace(/^#/, "");
  if (path.startsWith("/recibo/")) return { route: "recibo", receiptNumber: path.slice("/recibo/".length) };
  if (path === "/libros") return { route: "libros", receiptNumber: null };
  if (path === "/cierre") return { route: "cierre", receiptNumber: null };
  return { route: "caja", receiptNumber: null };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState(() => load());
  const [routeState, setRouteState] = useState(() => parseHash());
  const [service, setServiceState] = useState<ServiceId>(loaded.service);
  const [vehicle, setVehicleState] = useState<VehicleKind>(loaded.vehicle);
  const [lines, setLines] = useState<CartLine[]>(loaded.lines);
  const [sales, setSales] = useState<Sale[]>(loaded.sales);
  const [nextNumber, setNextNumber] = useState(loaded.nextNumber);
  const linesRef = useRef(lines);
  const salesRef = useRef(sales);
  const numberRef = useRef(nextNumber);
  const lock = useRef(false);
  linesRef.current = lines;
  salesRef.current = sales;
  numberRef.current = nextNumber;
  const totals = useMemo(() => sumLines(lines), [lines]);
  const today = todayISO();

  useEffect(() => {
    const sync = () => setRouteState(parseHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    const payload: Persisted = { lines, sales, nextNumber, service, vehicle };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* the register stays in memory if storage is full */
    }
  }, [lines, sales, nextNumber, service, vehicle]);

  function add(productId: string) {
    const product = productById(productId);
    if (!product) return;
    if (product.kinds && !product.kinds.includes(vehicle)) return;
    if (product.service !== service) setServiceState(product.service);
    setLines((current) => addProduct(current, product, vehicle));
  }

  function charge(pay: Pay, tenderedCents: number | null) {
    if (lock.current) return { ok: false as const, reason: "Espera un momento." };
    const result = closeSale(linesRef.current, pay, tenderedCents, new Date().toISOString(), numberRef.current);
    if ("error" in result) return { ok: false as const, reason: result.error };
    lock.current = true;
    window.setTimeout(() => {
      lock.current = false;
    }, 400);
    setSales((current) => [result, ...current].slice(0, 500));
    setNextNumber((current) => current + 1);
    setLines([]);
    window.location.hash = `#/recibo/${result.number}`;
    return { ok: true as const, number: result.number };
  }

  function voidSale(number: string) {
    setSales((current) => current.map((sale) => (sale.number === number ? { ...sale, voided: true } : sale)));
  }

  const value: StoreValue = {
    route: routeState.route,
    receiptNumber: routeState.receiptNumber,
    service,
    vehicle,
    lines,
    sales,
    totals,
    today,
    setService: setServiceState,
    setVehicle: setVehicleState,
    add,
    setQty: (key, qty) => setLines((current) => setLineQty(current, key, qty)),
    clearTicket: () => setLines([]),
    charge,
    voidSale,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("La caja no está lista.");
  return value;
}
