import type { Product, ServiceId, VehicleKind } from "./types";

export const HOUSE = {
  name: "Oleaje",
  street: "Malecón 18",
  place: "Bahía Salada",
};

export const SERVICE_LABEL: Record<ServiceId, string> = {
  bar: "Bar",
  restaurante: "Restaurante",
  lavado: "Car wash",
};

export const SERVICES: ServiceId[] = ["bar", "restaurante", "lavado"];

export const VEHICLE_LABEL: Record<VehicleKind, string> = {
  moto: "Moto",
  sedan: "Sedán",
  suv: "SUV",
  pickup: "Pickup",
};

export const VEHICLE_ORDER: VehicleKind[] = ["moto", "sedan", "suv", "pickup"];

export const VEHICLE_PERCENT: Record<VehicleKind, number> = {
  moto: 70,
  sedan: 100,
  suv: 118,
  pickup: 128,
};

export const catalog: Product[] = [
  { id: "clara", service: "bar", category: "Cerveza", name: "Clara de barril", price: 5, scales: false },
  { id: "ambar", service: "bar", category: "Cerveza", name: "Ámbar", price: 6, scales: false },
  { id: "oleaje", service: "bar", category: "Cócteles", name: "Alto oleaje", price: 12, scales: false },
  { id: "bahia", service: "bar", category: "Cócteles", name: "Bahía", price: 12, scales: false },
  { id: "negroni", service: "bar", category: "Cócteles", name: "Negroni", price: 13, scales: false },
  { id: "blanco", service: "bar", category: "Vino", name: "Blanco", price: 8, scales: false },
  { id: "tinto", service: "bar", category: "Vino", name: "Tinto", price: 8, scales: false },
  { id: "jamaica", service: "bar", category: "Sin alcohol", name: "Agua de jamaica", price: 4, scales: false },
  { id: "limonada", service: "bar", category: "Sin alcohol", name: "Limonada salada", price: 4, scales: false },
  { id: "cafe", service: "bar", category: "Sin alcohol", name: "Café frío", price: 4, scales: false },

  { id: "tostada", service: "restaurante", category: "Para picar", name: "Tostada de sardina", price: 9, scales: false },
  { id: "papas", service: "restaurante", category: "Para picar", name: "Papas del patio", price: 7, scales: false },
  { id: "ceviche", service: "restaurante", category: "Del mar", name: "Ceviche de día", price: 16, scales: false },
  { id: "arroz", service: "restaurante", category: "Del mar", name: "Arroz meloso", price: 22, scales: false },
  { id: "pollo", service: "restaurante", category: "Del fuego", name: "Pollo al carbón", price: 18, scales: false },
  { id: "costilla", service: "restaurante", category: "Del fuego", name: "Costilla corta", price: 21, scales: false },
  { id: "hinojo", service: "restaurante", category: "Del huerto", name: "Hinojo y cítricos", price: 11, scales: false },
  { id: "flan", service: "restaurante", category: "Para cerrar", name: "Flan de coco", price: 7, scales: false },

  { id: "enjuague", service: "lavado", category: "Lavado", name: "Enjuague", price: 18, scales: true },
  { id: "completo", service: "lavado", category: "Lavado", name: "Completo", price: 36, scales: true },
  { id: "premium", service: "lavado", category: "Lavado", name: "Premium", price: 58, scales: true },
  { id: "detalle", service: "lavado", category: "Lavado", name: "Detalle", price: 96, scales: true },
  { id: "cera", service: "lavado", category: "Extras", name: "Cera", price: 14, scales: true },
  {
    id: "motor",
    service: "lavado",
    category: "Extras",
    name: "Motor",
    price: 16,
    scales: false,
    kinds: ["sedan", "suv", "pickup"],
  },
  { id: "tapiz", service: "lavado", category: "Extras", name: "Tapicería", price: 22, scales: true },
  { id: "ozono", service: "lavado", category: "Extras", name: "Ozono", price: 12, scales: false },
];

export function tone(id: string): string {
  return id === "bar" || id === "restaurante" || id === "lavado" ? id : "otro";
}

export function categoriesFor(service: ServiceId): string[] {
  const found = new Set(catalog.filter((item) => item.service === service).map((item) => item.category));
  return ["Todo", ...found];
}
