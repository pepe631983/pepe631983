import { useEffect } from "react";
import { HOUSE } from "./data";
import { Mark } from "./components";
import { Counter } from "./pages/Counter";
import { Home } from "./pages/Home";
import { MenuPage } from "./pages/MenuPage";
import { Ticket } from "./pages/Ticket";
import { Visit } from "./pages/Visit";
import { Wash } from "./pages/Wash";
import {
  BAR_LAST,
  BAY_CLOSE,
  BAY_OPEN,
  bayShort,
  buildQuote,
  formatLongDay,
  KITCHEN_LAST,
  KITCHEN_OPEN,
  kitchenShort,
  minutesToLabel,
  moneyCents,
  visitCount,
} from "./logic";
import { useStore } from "./store";
import type { Route } from "./types";

const TITLES: Record<Route, string> = {
  inicio: "Oleaje",
  lavado: "La bahía · Oleaje",
  cocina: "La cocina · Oleaje",
  barra: "La barra · Oleaje",
  visita: "La visita · Oleaje",
  ticket: "Ticket · Oleaje",
  mostrador: "Mostrador · Oleaje",
};

const LINKS: { id: Route; href: string; label: string }[] = [
  { id: "inicio", href: "#/", label: "Inicio" },
  { id: "lavado", href: "#/lavado", label: "Lavado" },
  { id: "cocina", href: "#/cocina", label: "Cocina" },
  { id: "barra", href: "#/barra", label: "Barra" },
  { id: "mostrador", href: "#/mostrador", label: "Mostrador" },
];

export function App() {
  const { route, draft, clock, visits } = useStore();
  const quote = buildQuote(draft);
  const count = visitCount(draft);

  useEffect(() => {
    document.title = TITLES[route];
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <header className="mast">
        <div className="wrap mast-row">
          <a className="brand" href="#/">
            <Mark />
            <span>Oleaje</span>
          </a>
          <nav className="nav" aria-label="Secciones">
            {LINKS.map((link) => (
              <a key={link.id} href={link.href} aria-current={route === link.id ? "page" : undefined}>
                {link.label}
              </a>
            ))}
          </nav>
          <a className="pill" href="#/visita" aria-current={route === "visita" ? "page" : undefined}>
            <span>Visita</span>
            {count > 0 ? <span className="pill-count">{count}</span> : null}
            <span>{count > 0 ? moneyCents(quote.totalCents) : "vacía"}</span>
          </a>
        </div>
        <div className="wrap statusline">
          <span>
            {formatLongDay(clock.today)} · {bayShort(clock.nowMin)} · {kitchenShort(clock.nowMin)}
          </span>
          {visits.length > 0 ? <a href="#/ticket">Ticket {visits[0]?.code}</a> : <span>{HOUSE.place}</span>}
        </div>
      </header>
      <main id="contenido" className="page" key={route}>
        {route === "inicio" && <Home />}
        {route === "lavado" && <Wash />}
        {route === "cocina" && <MenuPage key="cocina" area="cocina" />}
        {route === "barra" && <MenuPage key="barra" area="barra" />}
        {route === "visita" && <Visit />}
        {route === "ticket" && <Ticket />}
        {route === "mostrador" && <Counter />}
      </main>
      <footer className="footer">
        <div className="wrap footer-grid">
          <div>
            <strong>{HOUSE.name}</strong>
            <p>
              {HOUSE.street}
              <br />
              {HOUSE.place}
            </p>
          </div>
          <div>
            <p>
              Bahía {minutesToLabel(BAY_OPEN)}–{minutesToLabel(BAY_CLOSE)}
            </p>
            <p>
              Cocina {minutesToLabel(KITCHEN_OPEN)}–{minutesToLabel(KITCHEN_LAST)}
            </p>
            <p>Barra hasta las {minutesToLabel(BAR_LAST)}</p>
          </div>
          <div>
            <p>
              Patio de muestra. Las visitas, el nombre y el teléfono se quedan en este navegador. Aquí se confirma la
              reserva; en el patio se cobra al salir.
            </p>
            <a href="#/mostrador">Abrir mostrador</a>
          </div>
        </div>
      </footer>
      <nav className="dock" aria-label="Navegación">
        {LINKS.filter((link) => link.id !== "mostrador").map((link) => (
          <a key={link.id} href={link.href} aria-current={route === link.id ? "page" : undefined}>
            {link.label}
          </a>
        ))}
        <a href="#/visita" aria-current={route === "visita" ? "page" : undefined}>
          Visita
        </a>
      </nav>
    </>
  );
}
