import { addons, menu, packages, WAITING_ITEMS } from "../data";
import { ActionBar, Adder, DayChips, SectionHead, TimeGrid } from "../components";
import {
  addonCents,
  buildQuote,
  discountNote,
  moneyCents,
  qtyOf,
  scaleCents,
  VEHICLE_LABEL,
  VEHICLE_ORDER,
  vehicleNote,
  visitCount,
  washSlots,
} from "../logic";
import { useStore } from "../store";

export function Wash() {
  const { draft, clock, busyByDate, update, toggleAddon, setQty } = useStore();
  const pkg = packages.find((item) => item.id === draft.washPackageId) ?? null;
  const busy = busyByDate.get(draft.date) ?? [];
  const slots = pkg ? washSlots(draft.date, pkg.minutes, clock.today, clock.nowMin, busy) : [];
  const quote = buildQuote(draft);
  const open = slots.some((slot) => slot.state === "open");
  const visibleAddons = addons.filter((addon) => !addon.kinds || addon.kinds.includes(draft.vehicleKind));

  return (
    <>
      <div className="wrap">
        <SectionHead
          eyebrow="La bahía"
          title="Elige el agua y la hora."
          lede="Tres bahías en este navegador. Una hora aparece llena cuando las tres ya tienen auto."
        />
        <p className="muted">{vehicleNote()}</p>
        <div className="pills" role="radiogroup" aria-label="Tamaño del vehículo">
          {VEHICLE_ORDER.map((kind) => (
            <label key={kind} className={draft.vehicleKind === kind ? "chip is-on" : "chip"}>
              <input
                type="radio"
                name="vehicle"
                value={kind}
                checked={draft.vehicleKind === kind}
                onChange={() => update({ vehicleKind: kind })}
              />
              {VEHICLE_LABEL[kind]}
            </label>
          ))}
        </div>

        <div className="choices" role="radiogroup" aria-label="Tipo de lavado">
          {packages.map((item) => {
            const selected = draft.washPackageId === item.id;
            return (
              <label key={item.id} className={selected ? "choice is-on" : "choice"}>
                <input
                  type="radio"
                  name="wash"
                  value={item.id}
                  checked={selected}
                  onChange={() => update({ washPackageId: item.id })}
                />
                <span className="choice-top">
                  <span>
                    <strong>{item.name}</strong>
                    <em>{item.minutes} min</em>
                  </span>
                  <strong>{moneyCents(scaleCents(item.price, draft.vehicleKind))}</strong>
                </span>
                <span>{item.blurb}</span>
                <span className="includes">{item.includes.join(" · ")}</span>
              </label>
            );
          })}
        </div>
        {pkg ? (
          <button type="button" className="btn btn-ghost" onClick={() => update({ washPackageId: null })}>
            Quitar lavado
          </button>
        ) : null}
        <p className="muted rule">{discountNote()}</p>

        <h2>Extras</h2>
        <div className="choices">
          {visibleAddons.map((addon) => {
            const on = draft.addonIds.includes(addon.id);
            return (
              <label key={addon.id} className={on ? "choice is-on" : "choice"}>
                <input type="checkbox" checked={on} onChange={() => toggleAddon(addon.id)} />
                <span className="choice-top">
                  <strong>{addon.name}</strong>
                  <strong>{moneyCents(addonCents(addon, draft.vehicleKind))}</strong>
                </span>
                <span className="muted">{addon.detail}</span>
              </label>
            );
          })}
        </div>

        <div className="fields">
          <label className="field">
            Placa
            <input
              value={draft.plate}
              onChange={(event) => update({ plate: event.target.value })}
              maxLength={10}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABC 123"
            />
          </label>
          <label className="field">
            Color
            <input
              value={draft.color}
              onChange={(event) => update({ color: event.target.value })}
              maxLength={24}
              placeholder="blanco"
            />
          </label>
        </div>

        {pkg ? (
          <section>
            <h2>Cuándo entra a la bahía</h2>
            <DayChips date={draft.date} today={clock.today} onDate={(date) => update({ date })} />
            {!open ? <p className="warn">No queda horario en este día.</p> : null}
            <TimeGrid slots={slots} time={draft.washTime} onTime={(washTime) => update({ washTime })} label="Hora de la bahía" />
          </section>
        ) : (
          <p className="muted">Sin lavado también se puede venir a comer. La hora de bahía aparece al elegir un paquete.</p>
        )}

        <section>
          <h2>Mientras esperas</h2>
          <ul className="edit-lines">
            {WAITING_ITEMS.map((id) => {
              const item = menu.find((entry) => entry.id === id);
              if (!item) return null;
              return (
                <li key={item.id}>
                  <span>
                    {item.name}
                    <small className="muted"> {moneyCents(item.price * 100)}</small>
                  </span>
                  <Adder value={qtyOf(draft, item.id)} onChange={(qty) => setQty(item.id, qty)} label={item.name} />
                </li>
              );
            })}
          </ul>
          <a href="#/cocina">Ver toda la cocina</a>
        </section>
      </div>
      <ActionBar>
        <span>
          {pkg ? `${pkg.name} · ${pkg.minutes} min` : "Sin lavado"} · {moneyCents(quote.totalCents)}
        </span>
        <span className="inline-actions">
          <a className="btn btn-ghost" href="#/visita">
            Revisar visita
          </a>
          <a className="btn btn-lagoon" href="#/cocina">
            {visitCount(draft) > 0 ? "Seguir a la cocina" : "Ver la cocina"}
          </a>
        </span>
      </ActionBar>
    </>
  );
}
