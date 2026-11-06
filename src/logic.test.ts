import { describe, expect, it } from "vitest";
import type { Busy, Visit } from "./types";
import {
  BAR_LAST,
  KITCHEN_LAST,
  addDays,
  buildQuote,
  busyByDate,
  diningSlots,
  emptyDraft,
  makeCode,
  moneyCents,
  nextBay,
  normalizeDraft,
  scaleCents,
  validate,
  washSlots,
} from "./logic";

const clock = { today: "2026-11-06", nowMin: 10 * 60 };

function saved(start: string, status: Visit["status"] = "confirmada"): Visit {
  return {
    code: "OL-TEST",
    createdAt: "2026-11-06T15:00:00.000Z",
    status,
    draft: { ...emptyDraft("2026-11-07"), washPackageId: "completo", washTime: start, name: "Ana" },
    lines: [{ id: "completo", label: "Completo", amountCents: 3600, kind: "wash" }],
    totalCents: 3600,
  };
}

describe("dinero y tarifa", () => {
  it("formatea centavos sin perder el redondeo", () => {
    expect(moneyCents(3600)).toBe("$36");
    expect(moneyCents(4248)).toBe("$42.48");
    expect(moneyCents(-180)).toBe("−$1.80");
    expect(moneyCents(100000)).toBe("$1,000");
  });

  it("ajusta el lavado por tamaño del vehículo", () => {
    expect(scaleCents(36, "sedan")).toBe(3600);
    expect(scaleCents(36, "suv")).toBe(4248);
    expect(scaleCents(36, "moto")).toBe(2520);
    expect(scaleCents(36, "pickup")).toBe(4608);
  });

  it("invita el 10% de la cocina solo en los lavados largos", () => {
    const suv = buildQuote({
      ...emptyDraft("2026-11-06"),
      vehicleKind: "suv",
      washPackageId: "completo",
      addonIds: ["motor"],
      lines: [
        { itemId: "pollo", qty: 1 },
        { itemId: "jamaica", qty: 2 },
      ],
    });
    expect(suv.washCents).toBe(5848);
    expect(suv.foodCents).toBe(1800);
    expect(suv.drinkCents).toBe(800);
    expect(suv.discountCents).toBe(180);
    expect(suv.totalCents).toBe(8268);
    expect(suv.lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(suv.totalCents);

    const enjuague = buildQuote({
      ...emptyDraft("2026-11-06"),
      washPackageId: "enjuague",
      lines: [{ itemId: "pollo", qty: 1 }],
    });
    expect(enjuague.discountCents).toBe(0);
    expect(enjuague.totalCents).toBe(3600);

    const corto = buildQuote({
      ...emptyDraft("2026-11-06"),
      washPackageId: "completo",
      lines: [
        { itemId: "papas", qty: 1 },
        { itemId: "tostada", qty: 1 },
      ],
    });
    expect(corto.foodCents).toBe(1600);
    expect(corto.discountCents).toBe(0);

    const moto = buildQuote({
      ...emptyDraft("2026-11-06"),
      vehicleKind: "moto",
      washPackageId: "enjuague",
      addonIds: ["motor"],
    });
    expect(moto.washCents).toBe(1260);
    expect(moto.lines.some((line) => line.id === "motor")).toBe(false);
  });
});

describe("horarios", () => {
  it("cierra el día de bahía y la última mesa", () => {
    const detalle = washSlots("2026-11-07", 120, "2026-11-06", 10 * 60, []);
    expect(detalle[0]?.time).toBe("08:00");
    expect(detalle.at(-1)?.time).toBe("16:00");
    const enjuague = washSlots("2026-11-07", 20, "2026-11-06", 0, []);
    expect(enjuague.at(-1)?.time).toBe("17:30");

    const ayer = washSlots("2026-11-05", 20, "2026-11-06", 10 * 60, []);
    expect(ayer.every((slot) => slot.state === "past")).toBe(true);
    const hoy = washSlots("2026-11-06", 45, clock.today, clock.nowMin, []);
    expect(hoy.find((slot) => slot.time === "10:00")?.state).toBe("past");
    expect(hoy.find((slot) => slot.time === "10:30")?.state).toBe("open");

    const comida = diningSlots("2026-11-07", "2026-11-06", 0, KITCHEN_LAST);
    expect(comida[0]?.time).toBe("12:00");
    expect(comida.at(-1)?.time).toBe("22:30");
    const barra = diningSlots("2026-11-07", "2026-11-06", 0, BAR_LAST);
    expect(barra.at(-1)?.time).toBe("23:30");
    const tarde = diningSlots("2026-11-06", "2026-11-06", 13 * 60, KITCHEN_LAST);
    expect(tarde.find((slot) => slot.time === "13:00")?.state).toBe("past");
    expect(tarde.find((slot) => slot.time === "13:30")?.state).toBe("open");
  });

  it("llena una hora cuando las tres bahías se solapan", () => {
    const busy: Busy[] = [
      { start: 10 * 60, end: 10 * 60 + 45 },
      { start: 10 * 60, end: 10 * 60 + 45 },
      { start: 10 * 60, end: 10 * 60 + 45 },
    ];
    const slots = washSlots("2026-11-07", 45, "2026-11-06", 0, busy);
    expect(slots.find((slot) => slot.time === "10:00")?.state).toBe("full");
    expect(slots.find((slot) => slot.time === "10:30")?.state).toBe("full");
    expect(slots.find((slot) => slot.time === "11:00")?.state).toBe("open");

    const map = busyByDate([
      saved("10:00"),
      { ...saved("10:00"), code: "OL-TES2" },
      { ...saved("10:00"), code: "OL-TES3" },
      { ...saved("10:00"), code: "OL-TES4", status: "cancelada" },
    ]);
    const fromBook = washSlots("2026-11-07", 45, "2026-11-06", 0, map.get("2026-11-07") ?? []);
    expect(fromBook.find((slot) => slot.time === "10:00")?.state).toBe("full");
  });

  it("busca el siguiente hueco", () => {
    const empty = new Map<string, Busy[]>();
    expect(nextBay("2026-11-06", 8 * 60, empty, 20)).toEqual({ date: "2026-11-06", time: "08:30" });
    expect(nextBay("2026-11-06", 18 * 60, empty, 20)).toEqual({ date: "2026-11-07", time: "08:00" });
  });

  it("suma días de calendario", () => {
    expect(addDays("2026-11-06", 30)).toBe("2026-12-06");
    expect(addDays("2026-11-06", -1)).toBe("2026-11-05");
  });
});

describe("visita", () => {
  it("exige hora y nombre, y acepta una bahía libre", () => {
    const draft = {
      ...emptyDraft("2026-11-06"),
      washPackageId: "completo",
      washTime: "10:30",
      name: "Ana Ruiz",
    };
    expect(validate(draft, clock, [])).toEqual({ ok: true });
    expect(validate({ ...draft, name: "A" }, clock, []).ok).toBe(false);
    expect(validate({ ...draft, washTime: "08:00" }, clock, []).ok).toBe(false);
    expect(validate({ ...draft, washTime: null }, clock, []).ok).toBe(false);
    expect(validate({ ...emptyDraft("2026-11-06"), name: "Ana" }, clock, []).ok).toBe(false);
  });

  it("normaliza un borrador viejo o roto", () => {
    const bumped = normalizeDraft(
      { date: "2020-01-01", name: "Ana", washTime: "09:00", washPackageId: "completo", vehicleKind: "yate" },
      { bumpPastTo: "2026-11-06" },
    );
    expect(bumped.date).toBe("2026-11-06");
    expect(bumped.washTime).toBeNull();
    expect(bumped.name).toBe("Ana");
    expect(bumped.vehicleKind).toBe("sedan");
    expect(normalizeDraft(null).vehicleKind).toBe("sedan");
  });

  it("arma un código corto que no se repite", () => {
    expect(makeCode(new Set(), () => 0)).toBe("OL-0000");
    expect(makeCode(new Set(["OL-0000"]), () => 0)).toMatch(/^OL-[A-Z0-9]{4,8}$/);
    expect(makeCode(new Set(["OL-0000"]), () => 0)).not.toBe("OL-0000");
  });
});
