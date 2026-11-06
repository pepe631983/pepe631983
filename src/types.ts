export type VehicleKind = "moto" | "sedan" | "suv" | "pickup";

export type Seat = "patio" | "barra" | "salon" | "llevar";

export type Status = "confirmada" | "en-bahia" | "en-mesa" | "lista" | "cancelada";

export type Area = "cocina" | "barra";

export type Route =
  | "inicio"
  | "lavado"
  | "cocina"
  | "barra"
  | "visita"
  | "ticket"
  | "mostrador";

export type WashPackage = {
  id: string;
  name: string;
  minutes: number;
  price: number;
  blurb: string;
  includes: string[];
};

export type Addon = {
  id: string;
  name: string;
  detail: string;
  price: number;
  scales: boolean;
  kinds?: VehicleKind[];
};

export type MenuItem = {
  id: string;
  area: Area;
  category: string;
  name: string;
  description: string;
  price: number;
  tags: string[];
};

export type DraftLine = {
  itemId: string;
  qty: number;
};

export type Draft = {
  date: string;
  washPackageId: string | null;
  addonIds: string[];
  vehicleKind: VehicleKind;
  plate: string;
  color: string;
  washTime: string | null;
  diningTime: string | null;
  seat: Seat;
  party: number;
  lines: DraftLine[];
  name: string;
  phone: string;
  note: string;
};

export type QuoteKind = "wash" | "addon" | "item" | "discount";

export type QuoteLine = {
  id: string;
  label: string;
  amountCents: number;
  kind: QuoteKind;
};

export type Quote = {
  lines: QuoteLine[];
  washCents: number;
  foodCents: number;
  drinkCents: number;
  discountCents: number;
  totalCents: number;
};

export type Visit = {
  code: string;
  createdAt: string;
  status: Status;
  draft: Draft;
  lines: QuoteLine[];
  totalCents: number;
};

export type SlotState = "open" | "past" | "full";

export type Slot = {
  time: string;
  state: SlotState;
};

export type Busy = {
  start: number;
  end: number;
};

export type Clock = {
  today: string;
  nowMin: number;
};
