import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Board, type Session } from "./api";
import { normalizeLines, normalizeSales, productById, addProduct, setLineQty, sumLines, todayISO } from "./logic";
import type { CartLine, Pay, Product, Route, Sale, ServiceRef, VehicleKind } from "./types";

const CART_KEY = "oleaje.cart.v2";
const VEHICLES = new Set<VehicleKind>(["moto", "sedan", "suv", "pickup"]);

type StoreValue = {
  route: Route;
  receiptNumber: string | null;
  ready: boolean;
  problem: string | null;
  admin: boolean;
  service: string;
  services: ServiceRef[];
  allServices: ServiceRef[];
  buttons: Product[];
  catalog: Product[];
  menuIds: string[];
  vehicle: VehicleKind;
  lines: CartLine[];
  sales: Sale[];
  totals: ReturnType<typeof sumLines>;
  today: string;
  setService: (service: string) => void;
  setVehicle: (vehicle: VehicleKind) => void;
  add: (productId: string) => void;
  setQty: (key: string, qty: number) => void;
  clearTicket: () => void;
  charge: (pay: Pay, tenderedCents: number | null) => Promise<{ ok: true; number: string } | { ok: false; reason: string }>;
  editSale: (
    number: string,
    lines: CartLine[],
    pay: Pay,
    tenderedCents: number | null,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  deleteSale: (number: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  mutate: (path: string, method: string, body?: unknown) => Promise<{ ok: true } | { ok: false; reason: string }>;
  refresh: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

function loadCart(): { lines: CartLine[]; service: string; vehicle: VehicleKind } {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) ?? "") as { lines?: unknown; service?: unknown; vehicle?: unknown };
    return {
      lines: normalizeLines(parsed.lines),
      service: typeof parsed.service === "string" ? parsed.service : "bar",
      vehicle: VEHICLES.has(parsed.vehicle as VehicleKind) ? (parsed.vehicle as VehicleKind) : "sedan",
    };
  } catch {
    return { lines: [], service: "bar", vehicle: "sedan" };
  }
}

function parseHash(hash = window.location.hash): { route: Route; receiptNumber: string | null } {
  const path = hash.replace(/^#/, "");
  if (path.startsWith("/recibo/")) return { route: "recibo", receiptNumber: path.slice("/recibo/".length) };
  if (path === "/libros") return { route: "libros", receiptNumber: null };
  if (path === "/cierre") return { route: "cierre", receiptNumber: null };
  if (path === "/admin") return { route: "admin", receiptNumber: null };
  return { route: "caja", receiptNumber: null };
}

function oneSale(input: unknown): Sale {
  const [sale] = normalizeSales([input]);
  if (!sale) throw new Error("La caja no devolvió la venta.");
  return sale;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart] = useState(loadCart);
  const [routeState, setRouteState] = useState(() => parseHash());
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [service, setServiceState] = useState(cart.service);
  const [services, setServices] = useState<ServiceRef[]>([]);
  const [allServices, setAllServices] = useState<ServiceRef[]>([]);
  const [buttons, setButtons] = useState<Product[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [menuIds, setMenuIds] = useState<string[]>([]);
  const [vehicle, setVehicleState] = useState<VehicleKind>(cart.vehicle);
  const [lines, setLines] = useState<CartLine[]>(cart.lines);
  const [sales, setSales] = useState<Sale[]>([]);
  const [today, setToday] = useState(todayISO);
  const linesRef = useRef(lines);
  const buttonsRef = useRef(buttons);
  const vehicleRef = useRef(vehicle);
  const serviceRef = useRef(service);
  const lock = useRef(false);
  linesRef.current = lines;
  buttonsRef.current = buttons;
  vehicleRef.current = vehicle;
  serviceRef.current = service;
  const totals = useMemo(() => sumLines(lines, services.map((item) => item.id)), [lines, services]);

  async function refresh() {
    const session = await api<Session>("/api/session");
    const board = await api<Board>(`/api/board?day=${encodeURIComponent(todayISO())}`);
    const book = await api<{ sales: Sale[] }>("/api/sales");
    setAdmin(session.admin);
    setServices(board.services);
    setAllServices(board.allServices);
    setButtons(board.buttons);
    setCatalog(board.catalog);
    setMenuIds(board.menuIds);
    setSales(normalizeSales(book.sales));
    setToday(board.day);
    setProblem(null);
    setReady(true);
  }

  useEffect(() => {
    const sync = () => setRouteState(parseHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    let live = true;
    refresh().catch((error: unknown) => {
      if (!live) return;
      setProblem(error instanceof Error ? error.message : "La caja no respondió.");
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (services.length === 0) return;
    if (!services.some((item) => item.id === service)) setServiceState(services[0]?.id ?? service);
  }, [services, service]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify({ lines, service, vehicle }));
    } catch {
      /* the open ticket stays in memory if storage is full */
    }
  }, [lines, service, vehicle]);

  function add(productId: string) {
    const product = productById(productId, buttonsRef.current);
    if (!product) return;
    if (product.kinds && !product.kinds.includes(vehicleRef.current)) return;
    if (product.service !== serviceRef.current) setServiceState(product.service);
    setLines((current) => addProduct(current, product, vehicleRef.current));
  }

  async function charge(pay: Pay, tenderedCents: number | null) {
    if (lock.current) return { ok: false as const, reason: "Espera un momento." };
    lock.current = true;
    try {
      const sale = oneSale(
        await api<Sale>("/api/sales", {
          method: "POST",
          body: JSON.stringify({ lines: linesRef.current, pay, tenderedCents }),
        }),
      );
      setLines([]);
      setSales((current) => [sale, ...current.filter((item) => item.number !== sale.number)].slice(0, 500));
      window.location.hash = `#/recibo/${sale.number}`;
      return { ok: true as const, number: sale.number };
    } catch (error) {
      return { ok: false as const, reason: error instanceof Error ? error.message : "La caja no respondió." };
    } finally {
      lock.current = false;
    }
  }

  async function editSale(number: string, nextLines: CartLine[], pay: Pay, tenderedCents: number | null) {
    try {
      const sale = oneSale(
        await api<Sale>("/api/sale", {
          method: "PATCH",
          body: JSON.stringify({ number, lines: nextLines, pay, tenderedCents }),
        }),
      );
      setSales((current) => current.map((item) => (item.number === sale.number ? sale : item)));
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: error instanceof Error ? error.message : "La caja no respondió." };
    }
  }

  async function deleteSale(number: string) {
    try {
      await api(`/api/sale?number=${encodeURIComponent(number)}`, { method: "DELETE" });
      setSales((current) => current.filter((item) => item.number !== number));
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: error instanceof Error ? error.message : "La caja no respondió." };
    }
  }

  async function mutate(path: string, method: string, body?: unknown) {
    try {
      await api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      await refresh();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: error instanceof Error ? error.message : "La caja no respondió." };
    }
  }

  const value: StoreValue = {
    route: routeState.route,
    receiptNumber: routeState.receiptNumber,
    ready,
    problem,
    admin,
    service,
    services,
    allServices,
    buttons,
    catalog,
    menuIds,
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
    editSale,
    deleteSale,
    mutate,
    refresh,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("La caja no está lista.");
  return value;
}
