import { beforeEach, describe, expect, it } from "vitest";
import { todayISO } from "../logic";
import type { CartLine, Sale } from "../types";
import type { Viewer } from "./book";
import { route } from "./routes";
import { useMemoryBook } from "./store";

const image = `data:image/png;base64,${"a".repeat(80)}`;

function person(sub: string, extra: Partial<Viewer> = {}): Viewer {
  return {
    kind: "person",
    sub,
    email: "caja@example.com",
    name: "Caja",
    appVisibility: "private",
    stage: "production",
    ...extra,
  };
}

function line(productId: string, key = `${productId}:-:1`, qty = 1): CartLine {
  return { key, productId, service: "bar", name: "x", qty, unitCents: 1 };
}

async function call(name: string, method: string, viewer: Viewer, body?: unknown, query = "") {
  const response = await route(
    new Request(`http://caja.local/api/${name}${query}`, {
      method,
      headers: method === "GET" || method === "HEAD" ? {} : { "content-type": "application/json", "x-oleaje": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    name,
    viewer,
  );
  return { status: response.status, payload: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  useMemoryBook();
});

describe("acceso", () => {
  it("hace admin a la primera persona y cajero a la siguiente", async () => {
    const owner = person("user:owner", { name: "Otra empresa" });
    const cashier = person("user:cashier");
    const session = await call("session", "GET", owner);
    expect(session.payload.admin).toBe(true);
    expect(session.payload).not.toHaveProperty("name");
    expect(JSON.stringify(session.payload)).not.toContain("Otra empresa");
    expect((await call("session", "GET", cashier)).payload.admin).toBe(false);
    expect((await call("service", "POST", cashier, { name: "Terraza" })).status).toBe(403);
    expect((await call("sale", "DELETE", cashier, undefined, "?number=0001")).status).toBe(403);
  });

  it("reconoce al admin del equipo y deja fuera a la llave y al miembro", async () => {
    const member = person("user:member", { appVisibility: "team", teamRole: "member" });
    const lead = person("user:lead", { appVisibility: "team", teamRole: "admin" });
    expect((await call("session", "GET", member)).payload.admin).toBe(false);
    expect((await call("session", "GET", lead)).payload.admin).toBe(true);
    const key: Viewer = { kind: "key", sub: "key:1", email: "", name: "bot", appVisibility: "private", stage: "production" };
    expect((await call("session", "GET", key)).status).toBe(403);
  });

  it("cobra el precio del menú y rechaza lo que no está publicado", async () => {
    const owner = person("user:owner");
    const cashier = person("user:cashier");
    await call("session", "GET", owner);
    await call("session", "GET", cashier);
    const sold = await call("sales", "POST", cashier, {
      lines: [line("clara", "clara:-:1", 2)],
      pay: "efectivo",
      tenderedCents: 10000,
    });
    const sale = sold.payload as unknown as Sale;
    expect(sold.status).toBe(200);
    expect(sale.totalCents).toBe(1000);
    expect(sale.lines[0]?.unitCents).toBe(500);
    expect(sale.lines[0]?.name).toBe("Clara de barril");
    expect(sale.changeCents).toBe(9000);

    const wash = await call("sales", "POST", cashier, {
      lines: [line("completo", "completo:suv:1")],
      pay: "tarjeta",
    });
    expect((wash.payload as unknown as Sale).totalCents).toBe(4248);

    expect((await call("menu", "PUT", owner, { day: todayISO(), buttonIds: ["clara"] })).status).toBe(200);
    const hidden = await call("sales", "POST", cashier, { lines: [line("pollo")], pay: "tarjeta" });
    expect(hidden.status).toBe(400);
    const bare = await route(
      new Request("http://caja.local/api/sales", { method: "POST", body: JSON.stringify({ lines: [line("clara")], pay: "tarjeta" }) }),
      "sales",
      cashier,
    );
    expect(bare.status).toBe(403);
  });

  it("solo el admin corrige o borra una venta", async () => {
    const owner = person("user:owner");
    const cashier = person("user:cashier");
    await call("session", "GET", owner);
    await call("session", "GET", cashier);
    const sold = await call("sales", "POST", cashier, { lines: [line("clara")], pay: "efectivo", tenderedCents: 500 });
    const sale = sold.payload as unknown as Sale;
    expect((await call("sale", "PATCH", cashier, { number: sale.number, lines: sale.lines, pay: "tarjeta" })).status).toBe(403);

    expect((await call("button", "PATCH", owner, {
      id: "clara",
      serviceId: "bar",
      name: "Clara de barril",
      priceCents: 900,
      category: "Cerveza",
      image: "",
      scales: false,
    })).status).toBe(200);

    const short = await call("sale", "PATCH", owner, {
      number: sale.number,
      lines: [{ ...sale.lines[0], qty: 2 }],
      pay: "efectivo",
      tenderedCents: 100,
    });
    expect(short.status).toBe(400);

    const edited = await call("sale", "PATCH", owner, {
      number: sale.number,
      lines: [{ ...sale.lines[0], qty: 2 }, line("pollo")],
      pay: "efectivo",
      tenderedCents: 3000,
    });
    const next = edited.payload as unknown as Sale;
    expect(edited.status).toBe(200);
    expect(next.lines.find((item) => item.productId === "clara")?.unitCents).toBe(500);
    expect(next.lines.find((item) => item.productId === "pollo")?.unitCents).toBe(1800);
    expect(next.totalCents).toBe(2800);
    expect((await call("sale", "PATCH", owner, { number: sale.number, lines: [], pay: "tarjeta" })).status).toBe(400);
    expect((await call("sale", "DELETE", owner, undefined, `?number=${sale.number}`)).status).toBe(200);
    const books = await call("sales", "GET", cashier);
    expect(books.payload.sales).toEqual([]);
  });

  it("crea un servicio, le cambia el nombre y publica un botón con foto", async () => {
    const owner = person("user:owner");
    const cashier = person("user:cashier");
    await call("session", "GET", owner);
    await call("session", "GET", cashier);
    expect((await call("service", "POST", owner, { name: "Terraza" })).status).toBe(200);
    expect((await call("service", "PATCH", owner, { id: "terraza", name: "Terraza norte" })).status).toBe(200);
    const huge = `data:image/png;base64,${"a".repeat(180_001)}`;
    expect((await call("button", "POST", owner, {
      name: "Agua de coco",
      serviceId: "terraza",
      priceCents: 350,
      category: "Bebidas",
      image: huge,
      onMenu: true,
    })).status).toBe(400);
    expect((await call("button", "POST", owner, {
      name: "Agua de coco",
      serviceId: "terraza",
      priceCents: 350,
      category: "Bebidas",
      image,
      scales: false,
      onMenu: true,
    })).status).toBe(200);
    expect((await call("button", "PATCH", owner, {
      id: "agua-de-coco",
      serviceId: "terraza",
      name: "Agua fresca",
      priceCents: 350,
      category: "Bebidas",
      image,
    })).status).toBe(200);

    const floor = await call("board", "GET", cashier);
    const buttons = floor.payload.buttons as { id: string; name: string; image?: string }[];
    const services = floor.payload.services as { id: string; name: string }[];
    expect(buttons.some((button) => button.id === "agua-de-coco" && button.name === "Agua fresca" && button.image === image)).toBe(true);
    expect(services.some((service) => service.id === "terraza" && service.name === "Terraza norte")).toBe(true);
    expect(floor.payload.catalog).toEqual([]);

    const back = await call("board", "GET", owner);
    const catalog = back.payload.catalog as { id: string }[];
    expect(catalog.some((button) => button.id === "agua-de-coco")).toBe(true);
    expect((await call("service", "POST", cashier, { name: "Otro" })).status).toBe(403);
  });

  it("guarda el preview aparte de la caja real", async () => {
    const owner = person("user:owner");
    const preview = person("user:owner", { stage: "preview" });
    await call("sales", "POST", preview, { lines: [line("clara")], pay: "tarjeta" });
    const live = await call("sales", "GET", owner);
    expect(live.payload.sales).toEqual([]);
  });
});
