export type ServiceId = "bar" | "restaurante" | "lavado";

export type VehicleKind = "moto" | "sedan" | "suv" | "pickup";

export type Pay = "efectivo" | "tarjeta";

export type Route = "caja" | "libros" | "recibo" | "cierre";

export type Product = {
  id: string;
  service: ServiceId;
  category: string;
  name: string;
  price: number;
  scales: boolean;
  kinds?: VehicleKind[];
};

export type CartLine = {
  key: string;
  productId: string;
  service: ServiceId;
  name: string;
  qty: number;
  unitCents: number;
};

export type ServiceTotals = Record<ServiceId, number>;

export type Sale = {
  number: string;
  at: string;
  lines: CartLine[];
  byService: ServiceTotals;
  totalCents: number;
  pay: Pay;
  tenderedCents: number;
  changeCents: number;
  voided: boolean;
};

export type DayReport = {
  day: string;
  tickets: number;
  voids: number;
  byService: ServiceTotals;
  totalCents: number;
  cashCents: number;
  cardCents: number;
};
