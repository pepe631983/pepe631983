import { describe, expect, it } from "vitest";
import { catalog } from "./data";
import {
  addProduct,
  closeSale,
  closeText,
  cashSuggestions,
  moneyExact,
  normalizeSales,
  parseMoney,
  report,
  sumLines,
  thermalText,
  unitCents,
  visibleProducts,
} from "./logic";
import type { CartLine } from "./types";

const completo = catalog.find((item) => item.id === "completo");
const clara = catalog.find((item) => item.id === "clara");
const pollo = catalog.find((item) => item.id === "pollo");
const motor = catalog.find((item) => item.id === "motor");

function ring(): CartLine[] {
  if (!completo || !clara || !pollo) throw new Error("Falta el catálogo");
  return addProduct(addProduct(addProduct(addProduct([], clara, "sedan"), clara, "sedan"), pollo, "sedan"), completo, "suv");
}

describe("caja", () => {
  it("muestra el dinero con centavos exactos", () => {
    expect(moneyExact(0)).toBe("$0.00");
    expect(moneyExact(500)).toBe("$5.00");
    expect(moneyExact(4248)).toBe("$42.48");
    expect(moneyExact(-180)).toBe("−$1.80");
    expect(parseMoney("10.50")).toBe(1050);
    expect(parseMoney("10,5")).toBe(1050);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("10.999")).toBeNull();
    const ideas = cashSuggestions(7048);
    expect(ideas.map((idea) => idea.cents)).toEqual([7048, 7100, 10000]);
    expect(ideas[0]?.label).toBe("Exacto");
    expect(ideas.every((idea) => idea.cents >= 7048)).toBe(true);
    expect(cashSuggestions(0)).toEqual([]);
  });

  it("ajusta solo el car wash que depende del tamaño", () => {
    if (!completo || !motor) throw new Error("Falta el catálogo");
    expect(unitCents(completo, "sedan")).toBe(3600);
    expect(unitCents(completo, "suv")).toBe(4248);
    expect(unitCents(completo, "moto")).toBe(2520);
    expect(unitCents(completo, "pickup")).toBe(4608);
    expect(unitCents(motor, "suv")).toBe(1600);
    expect(visibleProducts("lavado", "moto").some((item) => item.id === "motor")).toBe(false);
    expect(visibleProducts("lavado", "suv").some((item) => item.id === "motor")).toBe(true);
  });

  it("suma cada servicio por separado y el total es la suma", () => {
    const lines = ring();
    const claraLine = lines.find((line) => line.productId === "clara");
    expect(claraLine?.qty).toBe(2);
    expect(claraLine?.name).toBe("Clara de barril · vaso");
    const cafe = catalog.find((item) => item.id === "cafe");
    if (!cafe) throw new Error("Falta el catálogo");
    expect(addProduct([], cafe, "sedan")[0]?.name).toBe("Café frío");
    const summed = sumLines(lines);
    expect(summed.byService.bar).toBe(1000);
    expect(summed.byService.restaurante).toBe(1800);
    expect(summed.byService.lavado).toBe(4248);
    expect(summed.totalCents).toBe(7048);
    expect(summed.byService.bar + summed.byService.restaurante + summed.byService.lavado).toBe(summed.totalCents);
  });

  it("cobra efectivo con cambio y rechaza un pago corto", () => {
    const lines = ring();
    expect(closeSale(lines, "efectivo", 7000, "2026-11-07T15:00:00.000Z", 4)).toEqual({
      error: "El efectivo no cubre el total.",
    });
    const sale = closeSale(lines, "efectivo", 10000, "2026-11-07T15:00:00.000Z", 4);
    if ("error" in sale) throw new Error(sale.error);
    expect(sale.number).toBe("0004");
    expect(sale.totalCents).toBe(7048);
    expect(sale.changeCents).toBe(2952);
    expect(sale.byService.bar + sale.byService.restaurante + sale.byService.lavado).toBe(sale.totalCents);

    const text = thermalText(sale);
    const bar = text.lastIndexOf("Bar");
    const restaurant = text.lastIndexOf("Restaurante");
    const wash = text.lastIndexOf("Car wash");
    const total = text.lastIndexOf("TOTAL");
    expect(bar).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(restaurant);
    expect(restaurant).toBeLessThan(wash);
    expect(wash).toBeLessThan(total);
    expect(text).toContain("Clara de barril · vaso");
    expect(text).toContain("$10.00");
    expect(text).toContain("$18.00");
    expect(text).toContain("$42.48");
    expect(text).toContain("$70.48");
    expect(text).toContain("$100.00");
    expect(text).toContain("$29.52");
    expect(text.indexOf("TOTAL")).toBeLessThan(text.indexOf("Efectivo"));
  });

  it("lleva el libro del día y deja fuera otro día", () => {
    const first = closeSale(ring(), "efectivo", 10000, "2026-11-07T15:00:00.000Z", 1);
    const second = closeSale(ring(), "tarjeta", null, "2026-11-07T18:00:00.000Z", 2);
    const otherDay = closeSale(ring(), "tarjeta", null, "2026-11-08T15:00:00.000Z", 3);
    if ("error" in first || "error" in second || "error" in otherDay) throw new Error("cobro");
    const books = report([second, otherDay], "2026-11-07");
    expect(books.tickets).toBe(1);
    expect(books.byService).toEqual(second.byService);
    expect(books.totalCents).toBe(second.totalCents);
    expect(books.cardCents).toBe(second.totalCents);
    expect(books.cashCents).toBe(0);
    expect(books.services.map((service) => service.id)).toEqual(["bar", "restaurante", "lavado"]);
    expect(books.byService.bar + books.byService.restaurante + books.byService.lavado).toBe(books.totalCents);
    expect(closeText(books)).toContain("TOTAL");
    expect(closeText(books)).toContain("$70.48");
    expect(normalizeSales([{ ...first, voided: true }])).toEqual([]);
  });
});
