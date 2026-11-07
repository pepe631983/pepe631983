import {
  activeServices,
  buttonsFor,
  charge,
  createService,
  deleteSale,
  editSale,
  menuIds,
  openServices,
  rememberViewer,
  renameService,
  saveButton,
  setMenu,
  toProduct,
  viewerIsAdmin,
  type Viewer,
} from "./book";
import { readSlice, updateSlice } from "./store";
import { dayKey, todayISO } from "../logic";
import type { CartLine, Pay } from "../types";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function requireAdmin(viewer: Viewer): Promise<true | Response> {
  const saved = await updateSlice(viewer.stage, (slice) => {
    const next = rememberViewer(slice, viewer);
    if (!viewerIsAdmin(next, viewer)) return { error: "Solo el admin puede hacer eso." };
    return { slice: next, value: true as const };
  });
  if ("error" in saved) return json(saved, saved.error.includes("admin") ? 403 : 400);
  return true;
}

export async function route(request: Request, name: string, viewer: Viewer): Promise<Response> {
  if (viewer.kind !== "person") return json({ error: "La caja es para personas." }, 403);
  const mutation = request.method !== "GET" && request.method !== "HEAD";
  if (mutation && request.headers.get("x-oleaje") !== "1") return json({ error: "La solicitud no es de la caja." }, 403);
  try {
    if (name === "session" && request.method === "GET") return session(viewer);
    if (name === "board" && request.method === "GET") return board(viewer, request);
    if (name === "sales" && request.method === "GET") return sales(viewer, request);
    if (name === "sales" && request.method === "POST") return create(viewer, request);
    if (name === "sale" && request.method === "PATCH") return edit(viewer, request);
    if (name === "sale" && request.method === "DELETE") return remove(viewer, request);
    if (name === "service" && request.method === "POST") return addService(viewer, request);
    if (name === "service" && request.method === "PATCH") return editService(viewer, request);
    if (name === "button" && request.method === "POST") return addButton(viewer, request);
    if (name === "button" && request.method === "PATCH") return editButton(viewer, request);
    if (name === "menu" && request.method === "PUT") return publishMenu(viewer, request);
    return json({ error: "No está esa acción." }, 404);
  } catch {
    return json({ error: "La caja no pudo guardar." }, 500);
  }
}

async function session(viewer: Viewer): Promise<Response> {
  const saved = await updateSlice(viewer.stage, (slice) => {
    const next = rememberViewer(slice, viewer);
    return { slice: next, value: viewerIsAdmin(next, viewer) };
  });
  if ("error" in saved) return json(saved, 400);
  return json({ admin: saved.value, name: viewer.name, email: viewer.email });
}

async function board(viewer: Viewer, request: Request): Promise<Response> {
  const day = new URL(request.url).searchParams.get("day") || todayISO();
  const slice = await readSlice(viewer.stage);
  const admin = viewerIsAdmin(slice, viewer);
  return json({
    admin,
    day,
    services: openServices(slice, day),
    allServices: activeServices(slice),
    buttons: buttonsFor(slice, day, false).map(toProduct),
    catalog: admin ? slice.buttons.filter((button) => button.active).sort((left, right) => left.sort - right.sort).map(toProduct) : [],
    menuIds: menuIds(slice, day),
  });
}

async function sales(viewer: Viewer, request: Request): Promise<Response> {
  const day = new URL(request.url).searchParams.get("day") || "";
  const slice = await readSlice(viewer.stage);
  const listed = slice.sales.filter((sale) => !day || dayKey(sale.at) === day);
  const days = [...new Set(slice.sales.map((sale) => dayKey(sale.at)).filter(Boolean))].sort().reverse();
  return json({ sales: listed, days });
}

async function create(viewer: Viewer, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const saved = await updateSlice(viewer.stage, (slice) => {
    const result = charge(slice, asLines(body.lines), asPay(body.pay), asCents(body.tenderedCents), new Date().toISOString(), todayISO());
    if ("error" in result) return result;
    return { slice: result.slice, value: result.sale };
  });
  if ("error" in saved) return json(saved, 400);
  return json(saved.value);
}

async function edit(viewer: Viewer, request: Request): Promise<Response> {
  const allowed = await requireAdmin(viewer);
  if (allowed instanceof Response) return allowed;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const number = typeof body.number === "string" ? body.number : "";
  const saved = await updateSlice(viewer.stage, (slice) => {
    const result = editSale(slice, number, asLines(body.lines), asPay(body.pay), asCents(body.tenderedCents));
    if ("error" in result) return result;
    return { slice: result.slice, value: result.sale };
  });
  if ("error" in saved) return json(saved, 400);
  return json(saved.value);
}

async function remove(viewer: Viewer, request: Request): Promise<Response> {
  const allowed = await requireAdmin(viewer);
  if (allowed instanceof Response) return allowed;
  const number = new URL(request.url).searchParams.get("number") ?? "";
  const saved = await updateSlice(viewer.stage, (slice) => {
    const result = deleteSale(slice, number);
    if ("error" in result) return result;
    return { slice: result, value: true };
  });
  if ("error" in saved) return json(saved, 400);
  return json({ ok: true });
}

async function addService(viewer: Viewer, request: Request): Promise<Response> {
  const allowed = await requireAdmin(viewer);
  if (allowed instanceof Response) return allowed;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const saved = await updateSlice(viewer.stage, (slice) => {
    const result = createService(slice, body.name);
    if ("error" in result) return result;
    return { slice: result, value: true };
  });
  if ("error" in saved) return json(saved, 400);
  return json({ ok: true });
}

async function editService(viewer: Viewer, request: Request): Promise<Response> {
  const allowed = await requireAdmin(viewer);
  if (allowed instanceof Response) return allowed;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const saved = await updateSlice(viewer.stage, (slice) => {
    const result = renameService(slice, String(body.id ?? ""), body.name);
    if ("error" in result) return result;
    return { slice: result, value: true };
  });
  if ("error" in saved) return json(saved, 400);
  return json({ ok: true });
}

async function addButton(viewer: Viewer, request: Request): Promise<Response> {
  return writeButton(viewer, request, false);
}

async function editButton(viewer: Viewer, request: Request): Promise<Response> {
  return writeButton(viewer, request, true);
}

async function writeButton(viewer: Viewer, request: Request, editing: boolean): Promise<Response> {
  const allowed = await requireAdmin(viewer);
  if (allowed instanceof Response) return allowed;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const saved = await updateSlice(viewer.stage, (slice) => {
    const result = saveButton(slice, {
      id: editing ? String(body.id ?? "") : undefined,
      serviceId: typeof body.serviceId === "string" ? body.serviceId : "",
      name: body.name,
      priceCents: body.priceCents,
      category: body.category,
      image: body.image,
      scales: body.scales === true,
      hideOnMoto: body.hideOnMoto === true,
      active: body.active !== false,
    });
    if ("error" in result) return result;
    let next = result;
    if (!editing && body.onMenu === true) {
      const created = result.buttons[result.buttons.length - 1];
      const day = todayISO();
      const ids = [...menuIds(result, day), created?.id].filter((id): id is string => Boolean(id));
      const menu = setMenu(next, day, ids);
      if (!("error" in menu)) next = menu;
    }
    return { slice: next, value: true };
  });
  if ("error" in saved) return json(saved, 400);
  return json({ ok: true });
}

async function publishMenu(viewer: Viewer, request: Request): Promise<Response> {
  const allowed = await requireAdmin(viewer);
  if (allowed instanceof Response) return allowed;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const saved = await updateSlice(viewer.stage, (slice) => {
    const result = setMenu(slice, String(body.day ?? ""), body.buttonIds);
    if ("error" in result) return result;
    return { slice: result, value: true };
  });
  if ("error" in saved) return json(saved, 400);
  return json({ ok: true });
}

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "El pedido no es válido." }, 400);
    return body as Record<string, unknown>;
  } catch {
    return json({ error: "El pedido no es válido." }, 400);
  }
}

function asLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is CartLine => Boolean(item) && typeof item === "object");
}

function asPay(input: unknown): Pay {
  return input === "tarjeta" ? "tarjeta" : "efectivo";
}

function asCents(input: unknown): number | null {
  return Number.isInteger(input) ? Number(input) : null;
}

export type { Viewer };
