import { useEffect, useState } from "react";
import { ProductArt } from "../art";
import { HOUSE, SERVICE_LABEL, SERVICES, VEHICLE_LABEL, VEHICLE_ORDER, categoriesFor } from "../data";
import { lineCents, moneyExact, parseMoney, unitCents, vehicleNote, visibleProducts } from "../logic";
import { useStore } from "../store";
import type { Pay } from "../types";

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "⌫"] as const;

export function Register() {
  const { service, vehicle, lines, totals, setService, setVehicle, add, setQty, clearTicket, charge } = useStore();
  const [category, setCategory] = useState("Todo");
  const [pay, setPay] = useState<Pay>("efectivo");
  const [cash, setCash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dockOpen, setDockOpen] = useState(false);
  const categories = categoriesFor(service);
  const products = visibleProducts(service, vehicle).filter(
    (item) => category === "Todo" || item.category === category,
  );
  const tendered = parseMoney(cash);
  const short = pay === "efectivo" && tendered !== null && tendered < totals.totalCents;
  const canCharge =
    totals.totalCents > 0 && (pay === "tarjeta" || (tendered !== null && tendered >= totals.totalCents));

  useEffect(() => {
    setCategory("Todo");
  }, [service]);

  function pushKey(key: string) {
    setError(null);
    setCash((prev) => {
      if (key === "⌫") return prev.slice(0, -1);
      if (key === ".") {
        if (prev.includes(".")) return prev;
        return `${prev || "0"}.`;
      }
      const [whole, fraction] = prev.split(".");
      if (fraction !== undefined && fraction.length >= 2) return prev;
      if ((whole ?? "").replace(/^0+/, "").length >= 6 && fraction === undefined) return prev;
      if (prev === "0") return key;
      return prev + key;
    });
  }

  function takePayment() {
    const result = charge(pay, pay === "efectivo" ? tendered : null);
    if (!result.ok) setError(result.reason);
  }

  return (
    <div className="register">
      <header className="topbar">
        <a className="brand" href="#/">
          {HOUSE.name}
        </a>
        <div className="services" role="tablist" aria-label="Servicio">
          {SERVICES.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={service === id}
              className={`service ${id}`}
              onClick={() => setService(id)}
            >
              <span>{SERVICE_LABEL[id]}</span>
              <strong>{moneyExact(totals.byService[id])}</strong>
            </button>
          ))}
        </div>
        <a className="books-link" href="#/libros">
          Contabilidad
        </a>
      </header>

      <div className="workspace">
        <section className="board">
          {service === "lavado" ? (
            <div className="vehicle" role="radiogroup" aria-label="Tamaño del vehículo">
              {VEHICLE_ORDER.map((kind) => (
                <label key={kind} className={vehicle === kind ? "chip is-on" : "chip"}>
                  <input
                    type="radio"
                    name="vehicle"
                    checked={vehicle === kind}
                    onChange={() => setVehicle(kind)}
                  />
                  {VEHICLE_LABEL[kind]}
                </label>
              ))}
              <p>{vehicleNote()}</p>
            </div>
          ) : null}
          <div className="cats" role="group" aria-label="Categoría">
            {categories.map((item) => (
              <button key={item} type="button" aria-pressed={item === category} onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="tiles">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                className={`tile ${product.service}`}
                onClick={() => add(product.id)}
              >
                <ProductArt id={product.id} />
                <span className="tile-name">{product.name}</span>
                <strong>{moneyExact(unitCents(product, vehicle))}</strong>
              </button>
            ))}
          </div>
        </section>

        <aside className={dockOpen ? "ticket is-open" : "ticket"} aria-label="Cuenta">
          <div className="ticket-head">
            <h1>Cuenta</h1>
            <button type="button" className="text-btn" onClick={clearTicket} disabled={lines.length === 0}>
              Vaciar
            </button>
            <button
              type="button"
              className="dock-toggle"
              aria-expanded={dockOpen}
              onClick={() => setDockOpen((open) => !open)}
            >
              {dockOpen ? "Cerrar" : moneyExact(totals.totalCents)}
            </button>
          </div>
          <div className="ticket-lines">
            {lines.length === 0 ? <p className="empty">Toca un producto para empezar la cuenta.</p> : null}
            {lines.map((line) => (
              <div key={line.key} className="tline">
                <div>
                  <span className={`tag ${line.service}`}>{SERVICE_LABEL[line.service]}</span>
                  <strong>{line.name}</strong>
                  <span className="unit">{moneyExact(line.unitCents)}</span>
                </div>
                <div className="qty">
                  <button type="button" aria-label={`Quitar uno de ${line.name}`} onClick={() => setQty(line.key, line.qty - 1)}>
                    −
                  </button>
                  <span>{line.qty}</span>
                  <button type="button" aria-label={`Agregar otro ${line.name}`} onClick={() => setQty(line.key, line.qty + 1)}>
                    +
                  </button>
                </div>
                <strong className="line-total">{moneyExact(lineCents(line))}</strong>
              </div>
            ))}
          </div>
          <div className="account">
            {SERVICES.map((id) => (
              <div key={id} className="sum">
                <span className={`tag ${id}`}>{SERVICE_LABEL[id]}</span>
                <span>{moneyExact(totals.byService[id])}</span>
              </div>
            ))}
            <div className="grand">
              <span>Total</span>
              <span>{moneyExact(totals.totalCents)}</span>
            </div>
            <div className="pay" role="group" aria-label="Forma de pago">
              <button type="button" aria-pressed={pay === "efectivo"} onClick={() => setPay("efectivo")}>
                Efectivo
              </button>
              <button type="button" aria-pressed={pay === "tarjeta"} onClick={() => setPay("tarjeta")}>
                Tarjeta
              </button>
            </div>
            {pay === "efectivo" ? (
              <>
                <label className="field">
                  Recibido
                  <input value={cash} onChange={(event) => setCash(event.target.value)} inputMode="decimal" />
                </label>
                <div className="pad">
                  {KEYS.map((key) => (
                    <button key={key} type="button" onClick={() => pushKey(key)}>
                      {key}
                    </button>
                  ))}
                </div>
                <div className="quick">
                  <button type="button" onClick={() => setCash((totals.totalCents / 100).toFixed(2))}>
                    Exacto
                  </button>
                  <button type="button" onClick={() => setCash("20")}>
                    $20
                  </button>
                  <button type="button" onClick={() => setCash("50")}>
                    $50
                  </button>
                  <button type="button" onClick={() => setCash("100")}>
                    $100
                  </button>
                </div>
                {tendered !== null && tendered >= totals.totalCents && totals.totalCents > 0 ? (
                  <p className="change">
                    Cambio <strong>{moneyExact(tendered - totals.totalCents)}</strong>
                  </p>
                ) : null}
                {short ? <p className="warn">Faltan {moneyExact(totals.totalCents - (tendered ?? 0))}.</p> : null}
              </>
            ) : null}
            {error ? (
              <p className="warn" role="alert">
                {error}
              </p>
            ) : null}
            <button type="button" className="btn btn-primary charge" onClick={takePayment} disabled={!canCharge}>
              Cobrar
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
