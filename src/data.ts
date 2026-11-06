import type { Addon, MenuItem, Seat, Status, WashPackage } from "./types";

export const HOUSE = {
  name: "Oleaje",
  street: "Malecón 18",
  place: "Bahía Salada",
};

export const packages: WashPackage[] = [
  {
    id: "enjuague",
    name: "Enjuague",
    minutes: 20,
    price: 18,
    blurb: "Agua, jabón y secado. Para el auto que solo trae polvo del camino.",
    includes: ["Exterior", "Llantas", "Secado a mano"],
  },
  {
    id: "completo",
    name: "Completo",
    minutes: 45,
    price: 36,
    blurb: "El lavado con el que se pide la mesa. Exterior, cabina y vidrios.",
    includes: ["Exterior", "Aspirado", "Tablero", "Vidrios"],
  },
  {
    id: "premium",
    name: "Premium",
    minutes: 75,
    price: 58,
    blurb: "Completo, más cera y un interior que parece de salida.",
    includes: ["Todo el Completo", "Cera", "Marcos de puerta", "Alfombras"],
  },
  {
    id: "detalle",
    name: "Detalle",
    minutes: 120,
    price: 96,
    blurb: "Dos horas en bahía. Interior profundo, cuando el auto lo pide de verdad.",
    includes: ["Premium", "Tapicería", "Ozono corto", "Rines a mano"],
  },
];

export const addons: Addon[] = [
  {
    id: "cera",
    name: "Cera extra",
    detail: "Otra capa, aunque el paquete ya traiga cera.",
    price: 14,
    scales: true,
  },
  {
    id: "motor",
    name: "Motor",
    detail: "Desengrasado superficial. No es una reparación.",
    price: 16,
    scales: false,
    kinds: ["sedan", "suv", "pickup"],
  },
  {
    id: "tapiz",
    name: "Tapicería",
    detail: "Manchas de asiento y piso.",
    price: 22,
    scales: true,
  },
  {
    id: "ozono",
    name: "Ozono",
    detail: "Quita olor de humedad o de mascota.",
    price: 12,
    scales: false,
  },
];

export const menu: MenuItem[] = [
  {
    id: "tostada",
    area: "cocina",
    category: "Para picar",
    name: "Tostada de sardina",
    description: "Aguacate, sardina ahumada y cebolla encurtida.",
    price: 9,
    tags: [],
  },
  {
    id: "papas",
    area: "cocina",
    category: "Para picar",
    name: "Papas del patio",
    description: "Crujientes, ají y alioli de lima.",
    price: 7,
    tags: ["para compartir"],
  },
  {
    id: "ceviche",
    area: "cocina",
    category: "Del mar",
    name: "Ceviche de día",
    description: "Pescado, leche de tigre, camote y cilantro.",
    price: 16,
    tags: ["picante suave"],
  },
  {
    id: "arroz",
    area: "cocina",
    category: "Del mar",
    name: "Arroz meloso",
    description: "Mariscos, un azafrán modesto y limón.",
    price: 22,
    tags: [],
  },
  {
    id: "pollo",
    area: "cocina",
    category: "Del fuego",
    name: "Pollo al carbón",
    description: "Medio pollo, mojo de naranja y ensalada.",
    price: 18,
    tags: ["menú del patio"],
  },
  {
    id: "costilla",
    area: "cocina",
    category: "Del fuego",
    name: "Costilla corta",
    description: "Salsa de panela, pepino y pan tostado.",
    price: 21,
    tags: [],
  },
  {
    id: "hinojo",
    area: "cocina",
    category: "Del huerto",
    name: "Hinojo y cítricos",
    description: "Ensalada fría, oliva y queso salado.",
    price: 11,
    tags: ["ligero"],
  },
  {
    id: "flan",
    area: "cocina",
    category: "Para cerrar",
    name: "Flan de coco",
    description: "Caramelo oscuro y coco tostado.",
    price: 7,
    tags: [],
  },
  {
    id: "oleaje",
    area: "barra",
    category: "Cócteles",
    name: "Alto oleaje",
    description: "Ron, maracuyá, chile y sal de costa.",
    price: 12,
    tags: ["firma"],
  },
  {
    id: "bahia",
    area: "barra",
    category: "Cócteles",
    name: "Bahía",
    description: "Ginebra, pepino, salvia y tónica corta.",
    price: 12,
    tags: [],
  },
  {
    id: "negroni",
    area: "barra",
    category: "Cócteles",
    name: "Negroni del malecón",
    description: "Bitter y naranja asada. Poco hielo.",
    price: 13,
    tags: [],
  },
  {
    id: "barril",
    area: "barra",
    category: "Cerveza",
    name: "Clara de barril",
    description: "Media pinta, fría, sin ceremonia.",
    price: 5,
    tags: [],
  },
  {
    id: "ambar",
    area: "barra",
    category: "Cerveza",
    name: "Ámbar",
    description: "Botella, más cuerpo y menos prisa.",
    price: 6,
    tags: [],
  },
  {
    id: "blanco",
    area: "barra",
    category: "Vino",
    name: "Blanco de la casa",
    description: "Copa fría. Pregunta cuál está abierto.",
    price: 8,
    tags: [],
  },
  {
    id: "tinto",
    area: "barra",
    category: "Vino",
    name: "Tinto corto",
    description: "Copa de fruta roja, sin roble pesado.",
    price: 8,
    tags: [],
  },
  {
    id: "jamaica",
    area: "barra",
    category: "Sin alcohol",
    name: "Agua de jamaica",
    description: "Flor, jengibre y cáscara de naranja.",
    price: 4,
    tags: ["menú del patio"],
  },
  {
    id: "limonada",
    area: "barra",
    category: "Sin alcohol",
    name: "Limonada salada",
    description: "Limón, sal y hierbabuena.",
    price: 4,
    tags: [],
  },
  {
    id: "cafe",
    area: "barra",
    category: "Café",
    name: "Café frío",
    description: "Prensa, naranja y hielo grande.",
    price: 4,
    tags: [],
  },
];

export const KITCHEN_CATEGORIES = [
  "Para picar",
  "Del mar",
  "Del fuego",
  "Del huerto",
  "Para cerrar",
];

export const BAR_CATEGORIES = [
  "Cócteles",
  "Cerveza",
  "Vino",
  "Sin alcohol",
  "Café",
];

export const PATIO_WASH = "completo";
export const PATIO_ITEMS = ["pollo", "jamaica"] as const;
export const BOARD_ITEMS = ["ceviche", "pollo", "oleaje", "jamaica"] as const;
export const WAITING_ITEMS = ["ceviche", "pollo", "oleaje"] as const;

export const SEATS: { id: Seat; name: string; detail: string }[] = [
  { id: "patio", name: "Patio", detail: "Aire, sombra y vista a las bahías." },
  { id: "barra", name: "Barra", detail: "Si vienes solo o de a dos." },
  { id: "salon", name: "Salón", detail: "Mesa adentro, más quieta." },
  { id: "llevar", name: "Para llevar", detail: "Recoges al salir de la bahía." },
];

export const STATUSES: { id: Status; label: string }[] = [
  { id: "confirmada", label: "Confirmada" },
  { id: "en-bahia", label: "En bahía" },
  { id: "en-mesa", label: "En mesa" },
  { id: "lista", label: "Lista" },
  { id: "cancelada", label: "Cancelada" },
];

export const STATUS_COPY: Record<Status, string> = {
  confirmada: "Reservada. Te esperamos con este código.",
  "en-bahia": "El auto ya está en la bahía.",
  "en-mesa": "La mesa está en curso.",
  lista: "Listo para salir.",
  cancelada: "Esta visita quedó cancelada.",
};
