import { useEffect, useMemo, useState } from "react";
import { ProductArt, WaveMark } from "../art";
import { HOUSE, SERVICE_LABEL, SERVICES, VEHICLE_LABEL, VEHICLE_ORDER, categoriesFor } from "../data";
import {
  cashSuggestions,
  dayKey,
  lineCents,
  moneyExact,
  parseMoney,
  productById,
  unitCents,
  vehicleNote,
  visibleProducts,
} from "../logic";
import { useStore } from "../store";
import type { Pay, ServiceId } from "../types";

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "⌫"] as const;

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function Register() {
  const { service, vehicle, lines, totals, sales, today, setService, setVehicle, add, setQty, clearTicket, charge } =
    useStore();
  const [categoryByService, setCategoryByService] = useState<Record<ServiceId, string>>({
    bar: "Todo",
    restaurante: "Todo",
    lavado: "Todo",
  });
  const [query, setQuery] = useState("");
  const [pay, setPay] = useState<Pay>("efectivo");
  const [cash, setCash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dockOpen, setDockOpen] = useState(false);
  const [bumped, setBumped] = useState<string | null>(null);
  const category = categoryByService[service];
  const categories = categoriesFor(service);
  const catalog = visibleProducts(service, vehicle);
  const needle = fold(query.trim());
  const products = catalog.filter((item) => {
    const inCategory = category === "Todo" || item.category === category;
    return inCategory && (needle === "" || fold(item.name).includes(needle));
  });
  const tendered = parseMoney(cash);
  const short = pay === "efectivo" && tendered !== null && tendered < totals.totalCents;
  const canCharge =
    totals.totalCents > 0 && (pay === "tarjeta" || (tendered !== null && tendered >= totals.totalCents));
  const ideas = cashSuggestions(totals.totalCents);
  const quiet = SERVICES.filter((id) => totals.byService[id] === 0).map((id) => SERVICE_LABEL[id]);
  const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);

  const favorites = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sale of sales) {
      if (sale.voided || dayKey(sale.at) !== today) continue;
      for (const line of sale.lines) {
        if (line.service !== service) continue;
        counts.set(line.productId, (counts.get(line.productId) ?? 0) + line.qty);
      }
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 4)
      .flatMap(([id, count]) => {
        const product = productById(id);
        if (!product || !catalog.some((item) => item.id === id)) return [];
        return [{ product, count }];
      });
  }, [sales, today, service, vehicle]);

  useEffect(() => {
    if (!bumped) return;
    const timer = window.setTimeout(() => setBumped(null), 280);
    return () => window.clearTimeout(timer);
  }, [bumped]);

  function cue(): string {
    if (totals.totalCents === 0) {
      return "Toca un vaso, un plato o un auto. Los tres servicios caben en la misma cuenta.";
    }
    if (pay === "efectivo" && short && tendered !== null) {
      return `Faltan ${moneyExact(totals.totalCents - tendered)} para cubrir la cuenta.`;
    }
    if (canCharge && pay === "efectivo" && tendered !== null) {
      return `Listo para cobrar. El cambio es ${moneyExact(tendered - totals.totalCents)}.`;
    }
    if (canCharge && pay === "tarjeta") return "Tarjeta lista: se cobra el total exacto.";
    if (quiet.length > 0) {
      const plural = quiet.length > 1;
      return `${quiet.join(" y ")} ${plural ? "siguen" : "sigue"} en $0.00. Puedes ${plural ? "sumarlos" : "sumarlo"} o cobrar lo que ya está.`;
    }
    return "Los tres servicios ya están en la cuenta. Elige el efectivo o la tarjeta.";
  }

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

  function tapProduct(id: string) {
    add(id);
    setBumped(id);
  }

  function takePayment() {
    const result = charge(pay, pay === "efectivo" ? tendered : null);
    if (!result.ok) setError(result.reason);
  }

  function qtyOf(id: string): number {
    return lines.filter((line) => line.productId === id).reduce((sum, line) => sum + line.qty, 0);
  }

  return (
    <div className={`register service-${service}`}>
      <header className="topbar">
        <a className="brand" href="#/">
          <WaveMark />
          <span>{HOUSE.name}</span>
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
          Libros
        </a>
      </header>

      <div className="workspace">
        <section className="board">
          <p className="cue" aria-live="polite">
            {cue()}
          </p>
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
          <div className="finder">
            <label className="search">
              <span className="sr">Buscar en {SERVICE_LABEL[service]}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Buscar en ${SERVICE_LABEL[service]}`}
                enterKeyHint="search"
              />
            </label>
            <div className="cats" role="group" aria-label="Categoría">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={item === category}
                  onClick={() => setCategoryByService((current) => ({ ...current, [service]: item }))}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          {favorites.length > 0 && needle === "" && category === "Todo" ? (
            <div className="favorites">
              <p>Hoy se pide</p>
              <div>
                {favorites.map(({ product, count }) => (
                  <button key={product.id} type="button" onClick={() => tapProduct(product.id)}>
                    {product.name}
                    <span>
                      {count} · {moneyExact(unitCents(product, vehicle))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="tiles">
            {products.map((product) => {
              const qty = qtyOf(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  className={bumped === product.id ? `tile ${product.service} is-bumped` : `tile ${product.service}`}
                  onClick={() => tapProduct(product.id)}
                >
                  {qty > 0 ? <span className="badge">{qty}</span> : null}
                  <ProductArt id={product.id} />
                  <span className="tile-name">{product.name}</span>
                  <strong>{moneyExact(unitCents(product, vehicle))}</strong>
                </button>
              );
            })}
          </div>
          {products.length === 0 ? <p className="empty">Nada con ese nombre en {SERVICE_LABEL[service]}.</p> : null}
        </section>

        <aside className={dockOpen ? "ticket is-open" : "ticket"} aria-label="Cuenta">
          <div className="ticket-head">
            <div>
              <h1>Cuenta</h1>
              <p>{itemCount === 0 ? "Vacía" : `${itemCount} ${itemCount === 1 ? "producto" : "productos"}`}</p>
            </div>
            <button type="button" className="text-btn" onClick={clearTicket} disabled={lines.length === 0}>
              Vaciar
            </button>
            <button
              type="button"
              className="dock-toggle"
              aria-expanded={dockOpen}
              onClick={() => setDockOpen((open) => !open)}
            >
              <span>{dockOpen ? "Cerrar" : itemCount === 0 ? "Abrir cuenta" : `${itemCount} en la cuenta`}</span>
              <strong>{moneyExact(totals.totalCents)}</strong>
            </button>
          </div>
          <div className="peek">
            {SERVICES.map((id) => (
              <span key={id} className={id}>
                {SERVICE_LABEL[id]}
                <strong>{moneyExact(totals.byService[id])}</strong>
              </span>
            ))}
          </div>
          <div className="ticket-lines">
            {lines.length === 0 ? (
              <p className="empty">
                <WaveMark />
                La cuenta espera el primer toque.
              </p>
            ) : null}
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
                <div className="pad" aria-label="Teclado de efectivo">
                  {KEYS.map((key) => (
                    <button key={key} type="button" onClick={() => pushKey(key)}>
                      {key}
                    </button>
                  ))}
                </div>
                {ideas.length > 0 ? (
                  <div className="quick">
                    {ideas.map((idea) => (
                      <button
                        key={idea.label}
                        type="button"
                        onClick={() => {
                          setError(null);
                          setCash((idea.cents / 100).toFixed(2));
                        }}
                      >
                        {idea.label}
                      </button>
                    ))}
                  </div>
                ) : null}
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
              {totals.totalCents > 0 ? `Cobrar ${moneyExact(totals.totalCents)}` : "Cobrar"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
