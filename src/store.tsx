import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addons, packages, PATIO_ITEMS, PATIO_WASH } from "./data";
import {
  buildQuote,
  busyByDate,
  emptyDraft,
  makeCode,
  normalizeDraft,
  normalizeVisits,
  nowMinutes,
  todayISO,
  validate,
} from "./logic";
import type { Busy, Clock, Draft, Route, Status, Visit } from "./types";

const STORAGE_KEY = "oleaje.v1";

const ROUTES: Record<string, Route> = {
  "/": "inicio",
  "/inicio": "inicio",
  "/lavado": "lavado",
  "/cocina": "cocina",
  "/barra": "barra",
  "/visita": "visita",
  "/ticket": "ticket",
  "/mostrador": "mostrador",
};

export function parseHash(hash = window.location.hash): { route: Route; params: URLSearchParams } {
  const raw = hash.replace(/^#/, "");
  const [pathPart, query] = raw.split("?");
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return { route: ROUTES[path] ?? "inicio", params: new URLSearchParams(query ?? "") };
}

type ConfirmResult = { ok: true; code: string } | { ok: false; reason: string };

type StoreValue = {
  route: Route;
  draft: Draft;
  visits: Visit[];
  clock: Clock;
  busyByDate: Map<string, Busy[]>;
  activeCode: string | null;
  update: (patch: Partial<Draft>) => void;
  setQty: (itemId: string, qty: number) => void;
  toggleAddon: (id: string) => void;
  confirmVisit: () => ConfirmResult;
  setStatus: (code: string, status: Status) => void;
  removeVisit: (code: string) => void;
  repeatVisit: (code: string) => void;
  focusVisit: (code: string) => void;
  clearDraft: () => void;
  addPatio: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function load(): { draft: Draft; visits: Visit[] } {
  const today = todayISO();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { draft: emptyDraft(today), visits: [] };
    const parsed = JSON.parse(raw) as { draft?: unknown; visits?: unknown };
    return {
      draft: normalizeDraft(parsed.draft, { bumpPastTo: today }),
      visits: normalizeVisits(parsed.visits),
    };
  } catch {
    return { draft: emptyDraft(today), visits: [] };
  }
}

function mergeQty(lines: Draft["lines"], itemId: string, add: number): Draft["lines"] {
  const next = lines.map((line) => ({ ...line }));
  const found = next.find((line) => line.itemId === itemId);
  if (found) found.qty = Math.min(12, found.qty + add);
  else next.push({ itemId, qty: add });
  return next;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState(() => load());
  const [route, setRoute] = useState<Route>(() => parseHash().route);
  const [draft, setDraft] = useState<Draft>(loaded.draft);
  const [visits, setVisits] = useState<Visit[]>(loaded.visits);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState(() => nowMinutes());
  const today = todayISO();
  const clock = useMemo<Clock>(() => ({ today, nowMin }), [today, nowMin]);
  const occupancy = useMemo(() => busyByDate(visits), [visits]);
  const draftRef = useRef(draft);
  const visitsRef = useRef(visits);
  const lock = useRef(false);
  draftRef.current = draft;
  visitsRef.current = visits;

  useEffect(() => {
    const id = window.setInterval(() => setNowMin(nowMinutes()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const nextToday = todayISO();
    setDraft((current) =>
      current.date < nextToday ? { ...current, date: nextToday, washTime: null, diningTime: null } : current,
    );
  }, [nowMin]);

  useEffect(() => {
    const sync = () => {
      const next = parseHash();
      setRoute(next.route);
      if (next.route !== "lavado") return;
      const id = next.params.get("paquete");
      if (!id || !packages.some((item) => item.id === id)) return;
      setDraft((current) =>
        current.washPackageId === id ? current : { ...current, washPackageId: id, washTime: null },
      );
    };
    window.addEventListener("hashchange", sync);
    sync();
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ draft, visits }));
    } catch {
      /* the book stays in memory if the browser refuses storage */
    }
  }, [draft, visits]);

  function update(patch: Partial<Draft>) {
    setDraft((prev) => {
      const next: Draft = { ...prev, ...patch };
      if (patch.name !== undefined) next.name = patch.name.slice(0, 60);
      if (patch.phone !== undefined) next.phone = patch.phone.slice(0, 20);
      if (patch.note !== undefined) next.note = patch.note.slice(0, 180);
      if (patch.plate !== undefined) next.plate = patch.plate.toUpperCase().slice(0, 10);
      if (patch.color !== undefined) next.color = patch.color.slice(0, 24);
      if (patch.vehicleKind && patch.vehicleKind !== prev.vehicleKind) {
        next.addonIds = next.addonIds.filter((id) => {
          const addon = addons.find((item) => item.id === id);
          return Boolean(addon && (!addon.kinds || addon.kinds.includes(next.vehicleKind)));
        });
      }
      if (patch.date && patch.date !== prev.date) {
        next.washTime = null;
        next.diningTime = null;
      }
      if (patch.washPackageId !== undefined && patch.washPackageId !== prev.washPackageId) {
        next.washTime = null;
        if (patch.washPackageId === null) next.addonIds = [];
      }
      if (patch.party !== undefined) {
        const party = Math.round(Number(patch.party));
        next.party = Number.isFinite(party) ? Math.min(12, Math.max(1, party)) : prev.party;
      }
      return next;
    });
  }

  function setQty(itemId: string, qty: number) {
    const nextQty = Math.max(0, Math.min(12, Math.round(qty)));
    setDraft((prev) => {
      const lines = prev.lines.filter((line) => line.itemId !== itemId);
      if (nextQty > 0) lines.push({ itemId, qty: nextQty });
      return { ...prev, lines };
    });
  }

  function toggleAddon(id: string) {
    setDraft((prev) => ({
      ...prev,
      addonIds: prev.addonIds.includes(id) ? prev.addonIds.filter((item) => item !== id) : [...prev.addonIds, id],
    }));
  }

  function confirmVisit(): ConfirmResult {
    if (lock.current) return { ok: false, reason: "Espera un momento." };
    const current = draftRef.current;
    const freshClock = { today: todayISO(), nowMin: nowMinutes() };
    const busy = busyByDate(visitsRef.current).get(current.date) ?? [];
    const checked = validate(current, freshClock, busy);
    if (!checked.ok) return checked;
    lock.current = true;
    window.setTimeout(() => {
      lock.current = false;
    }, 500);
    const quote = buildQuote(current);
    const code = makeCode(new Set(visitsRef.current.map((visit) => visit.code)));
    const visit: Visit = {
      code,
      createdAt: new Date().toISOString(),
      status: "confirmada",
      draft: {
        ...current,
        name: current.name.trim(),
        phone: current.phone.trim(),
        note: current.note.trim(),
        plate: current.plate.trim().toUpperCase(),
        color: current.color.trim(),
      },
      lines: quote.lines,
      totalCents: quote.totalCents,
    };
    setVisits((currentVisits) => [visit, ...currentVisits].slice(0, 50));
    setDraft(emptyDraft(freshClock.today));
    setActiveCode(code);
    return { ok: true, code };
  }

  function setStatus(code: string, status: Status) {
    setVisits((current) => current.map((visit) => (visit.code === code ? { ...visit, status } : visit)));
  }

  function removeVisit(code: string) {
    setVisits((current) => current.filter((visit) => visit.code !== code));
    setActiveCode((current) => (current === code ? null : current));
  }

  function repeatVisit(code: string) {
    const visit = visitsRef.current.find((item) => item.code === code);
    if (!visit) return;
    setDraft({ ...visit.draft, date: todayISO(), washTime: null, diningTime: null });
    window.location.hash = "#/visita";
  }

  function focusVisit(code: string) {
    setActiveCode(code);
  }

  function clearDraft() {
    setDraft(emptyDraft(todayISO()));
  }

  function addPatio() {
    setDraft((prev) => {
      let lines = prev.lines;
      for (const itemId of PATIO_ITEMS) lines = mergeQty(lines, itemId, 1);
      return {
        ...prev,
        washPackageId: prev.washPackageId ?? PATIO_WASH,
        washTime: prev.washPackageId ? prev.washTime : null,
        lines,
      };
    });
    window.location.hash = "#/visita";
  }

  const value: StoreValue = {
    route,
    draft,
    visits,
    clock,
    busyByDate: occupancy,
    activeCode,
    update,
    setQty,
    toggleAddon,
    confirmVisit,
    setStatus,
    removeVisit,
    repeatVisit,
    focusVisit,
    clearDraft,
    addPatio,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Oleaje no está listo.");
  return value;
}
