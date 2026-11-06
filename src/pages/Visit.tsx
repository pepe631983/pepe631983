import { useState, type FormEvent } from "react";
import { menu, packages, SEATS } from "../data";
import { ActionBar, DayChips, Qty, Receipt, SectionHead, TimeGrid } from "../components";
import {
  buildQuote,
  cartKinds,
  diningSlots,
  DISCOUNT_FOOD_CENTS,
  DISCOUNT_PACKAGES,
  issues,
  lastSeating,
  moneyCents,
  washSlots,
} from "../logic";
import { useStore } from "../store";

export function Visit() {
  const { draft, clock, busyByDate, update, setQty, confirmVisit, clearDraft, addPatio } = useStore();
  const [attempted, setAttempted] = useState(false);
  const quote = buildQuote(draft);
  const kinds = cartKinds(draft);
  const pkg = packages.find((item) => item.id === draft.washPackageId) ?? null;
  const busy = busyByDate.get(draft.date) ?? [];
  const wash = pkg ? washSlots(draft.date, pkg.minutes, clock.today, clock.nowMin, busy) : [];
  const dining = kinds.items > 0 ? diningSlots(draft.date, clock.today, clock.nowMin, lastSeating(kinds.food)) : [];
  const found = issues(draft, clock, busy);
  const message = found.blocking[0] ?? (attempted ? found.personal[0] : undefined);
  const missingDiscount =
    pkg && DISCOUNT_PACKAGES.has(pkg.id) && quote.foodCents > 0 && quote.foodCents < DISCOUNT_FOOD_CENTS
      ? DISCOUNT_FOOD_CENTS - quote.foodCents
      : 0;

  if (!pkg && kinds.items === 0) {
    return (
      <div className="wrap">
        <SectionHead
          eyebrow="Visita"
          title="La cuenta está en blanco."
          lede="Elige un lavado, un plato o una copa. Se juntan en un solo ticket."
        />
        <div className="inline-actions">
          <a className="btn btn-lagoon" href="#/lavado">
            Lavado
          </a>
          <a className="btn btn-ghost" href="#/cocina">
            Cocina
          </a>
          <a className="btn btn-ghost" href="#/barra">
            Barra
          </a>
        </div>
        <button type="button" className="btn btn-primary" onClick={addPatio}>
          Sumar el menú del patio
        </button>
      </div>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    const result = confirmVisit();
    if (!result.ok) {
      if (result.reason.toLowerCase().includes("nombre") || result.reason.toLowerCase().includes("tel")) {
        document.getElementById("guest-name")?.focus();
      }
      return;
    }
    window.location.hash = "#/ticket";
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="wrap visit-layout">
        <Receipt draft={draft} lines={quote.lines} totalCents={quote.totalCents} />
        <div>
          <SectionHead
            eyebrow="Visita"
            title="Cierra el ticket."
            lede="Esto reserva el lugar. En el patio se cobra al salir."
          />
          <h2>Día</h2>
          <DayChips date={draft.date} today={clock.today} onDate={(date) => update({ date })} />

          {pkg ? (
            <section>
              <h2>Bahía · {pkg.name}</h2>
              <p className="muted">
                <a href="#/lavado">Cambiar el lavado</a>
              </p>
              {wash.every((slot) => slot.state !== "open") ? <p className="warn">No queda horario en este día.</p> : null}
              <TimeGrid
                slots={wash}
                time={draft.washTime}
                onTime={(washTime) => update({ washTime })}
                label="Hora de la bahía"
              />
            </section>
          ) : (
            <p>
              <a href="#/lavado">Agregar lavado</a>
            </p>
          )}

          {kinds.items > 0 ? (
            <section>
              <h2>{draft.seat === "llevar" ? "Para llevar" : "La mesa"}</h2>
              <div className="seats" role="radiogroup" aria-label="Dónde sentarse">
                {SEATS.map((seat) => (
                  <label key={seat.id} className={draft.seat === seat.id ? "choice is-on" : "choice"}>
                    <input
                      type="radio"
                      name="seat"
                      value={seat.id}
                      checked={draft.seat === seat.id}
                      onChange={() => update({ seat: seat.id })}
                    />
                    <strong>{seat.name}</strong>
                    <span className="muted">{seat.detail}</span>
                  </label>
                ))}
              </div>
              {draft.seat !== "llevar" ? (
                <div className="party">
                  <span>Personas</span>
                  <Qty value={draft.party} min={1} onChange={(party) => update({ party })} label="personas" />
                </div>
              ) : null}
              <TimeGrid
                slots={dining}
                time={draft.diningTime}
                onTime={(diningTime) => update({ diningTime })}
                label={draft.seat === "llevar" ? "Hora para recoger" : "Hora de la mesa"}
              />
              <ul className="edit-lines">
                {draft.lines.map((line) => {
                  const item = menu.find((entry) => entry.id === line.itemId);
                  if (!item) return null;
                  return (
                    <li key={line.itemId}>
                      <span>{item.name}</span>
                      <Qty value={line.qty} onChange={(qty) => setQty(line.itemId, qty)} label={item.name} />
                    </li>
                  );
                })}
              </ul>
              <p className="muted">
                <a href="#/cocina">Cocina</a> · <a href="#/barra">Barra</a>
              </p>
            </section>
          ) : (
            <p>
              <a href="#/cocina">Agregar de la cocina</a>
            </p>
          )}

          {missingDiscount > 0 ? (
            <p className="muted">Faltan {moneyCents(missingDiscount)} de cocina para el 10%.</p>
          ) : null}

          <div className="fields">
            <label className="field" htmlFor="guest-name">
              Nombre
              <input
                id="guest-name"
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
                maxLength={60}
                autoComplete="name"
                aria-invalid={attempted && draft.name.trim().length < 2}
              />
            </label>
            <label className="field" htmlFor="guest-phone">
              Teléfono, si quieres
              <input
                id="guest-phone"
                value={draft.phone}
                onChange={(event) => update({ phone: event.target.value })}
                maxLength={20}
                autoComplete="tel"
                inputMode="tel"
              />
            </label>
          </div>
          <label className="field" htmlFor="guest-note">
            Nota para el patio
            <textarea
              id="guest-note"
              value={draft.note}
              onChange={(event) => update({ note: event.target.value })}
              maxLength={180}
              placeholder="Niño en silla, sin chile, el auto es el blanco de la esquina."
            />
          </label>
          {message ? (
            <p className="warn" role="alert">
              {message}
            </p>
          ) : null}
          <div className="inline-actions">
            <button type="submit" className="btn btn-primary">
              Confirmar visita
            </button>
            <button type="button" className="btn btn-ghost" onClick={clearDraft}>
              Vaciar
            </button>
          </div>
        </div>
      </div>
      <ActionBar>
        <span>{moneyCents(quote.totalCents)} · se cobra al salir</span>
        <button type="submit" className="btn btn-primary">
          Confirmar visita
        </button>
      </ActionBar>
    </form>
  );
}
