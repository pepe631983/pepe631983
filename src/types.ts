export type ServiceId = string;

export type VehicleKind = "moto" | "sedan" | "suv" | "pickup";

export type Pay = "efectivo" | "tarjeta";

export type Route = "caja" | "libros" | "recibo" | "cierre" | "admin";

export type ServiceRef = {
  id: string;
  name: string;
};

export type Product = {
  id: string;
  service: ServiceId;
  category: string;
  name: string;
  price: number;
  priceCents?: number;
  scales: boolean;
  kinds?: VehicleKind[];
  image?: string;
};

export type CartLine = {
  key: string;
  productId: string;
  service: ServiceId;
  name: string;
  qty: number;
  unitCents: number;
};

export type ServiceTotals = Record<string, number>;

export type Sale = {
  number: string;
  at: string;
  lines: CartLine[];
  services: ServiceRef[];
  byService: ServiceTotals;
  totalCents: number;
  pay: Pay;
  tenderedCents: number;
  changeCents: number;
};

export type DayReport = {
  day: string;
  tickets: number;
  services: ServiceRef[];
  byService: ServiceTotals;
  totalCents: number;
  cashCents: number;
  cardCents: number;
};
