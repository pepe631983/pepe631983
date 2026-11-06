import { useMemo } from "react";
import { BOARD_ITEMS, menu, packages, PATIO_ITEMS, PATIO_WASH } from "../data";
import { Tide } from "../components";
import { buildQuote, dayChip, discountNote, emptyDraft, moneyCents, nextBay } from "../logic";
import { useStore } from "../store";

export function Home() {
  const { clock, busyByDate, addPatio } = useStore();
  const opening = nextBay(clock.today, clock.nowMin, busyByDate, 20);
  const patio = useMemo(
    () =>
      buildQuote({
        ...emptyDraft(clock.today),
        washPackageId: PATIO_WASH,
        lines: PATIO_ITEMS.map((itemId) => ({ itemId, qty: 1 })),
      }),
    [clock.today],
  );
  const board = BOARD_ITEMS.flatMap((id) => {
    const item = menu.find((entry) => entry.id === id);
    return item ? [item] : [];
  });
  const signature = menu.find((item) => item.id === "oleaje");
  const chicken = menu.find((item) => item.id === "pollo");

  return (
    <>
      <div className="wrap">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Patio de lavado, cocina y barra</p>
            <h1>
              Deja el auto.
              <br />
              <em>Quédate a la mesa.</em>
            </h1>
            <p className="lede">
              Tres oficios, una cuenta. Entregas las llaves en la bahía, pides en la cocina o en la barra, y el auto
              queda listo mientras comes.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#/visita">
                Armar la visita
              </a>
              <a className="btn btn-ghost" href="#/cocina">
                Ver la carta
              </a>
            </div>
            <ul className="facts">
              <li>
                <strong>3</strong>
                <span>bahías</span>
              </li>
              <li>
                <strong>8–18</strong>
                <span>lavado</span>
              </li>
              <li>
                <strong>12–22:30</strong>
                <span>cocina</span>
              </li>
            </ul>
          </div>
          <aside className="board">
            <p className="eyebrow">Carta de hoy</p>
            <h2>Lo que sale del patio</h2>
            <ol>
              {board.map((item) => (
                <li key={item.id}>
                  <span>{item.name}</span>
                  <span>{moneyCents(item.price * 100)}</span>
                </li>
              ))}
            </ol>
            <div className="next-bay">
              <p className="eyebrow">Siguiente hueco para un enjuague</p>
              <strong>
                {opening ? `${dayChip(opening.date, clock.today)} · ${opening.time}` : "Sin hueco en siete días"}
              </strong>
            </div>
          </aside>
        </section>

        <Tide />

        <ol className="ritual">
          <li>
            <span>01</span>
            <h2>Llegas</h2>
            <p>Dejas el auto en una bahía y dices el nombre que va en el ticket.</p>
          </li>
          <li>
            <span>02</span>
            <h2>Pides</h2>
            <p>La cocina y la barra salen en la misma cuenta. No hay dos filas.</p>
          </li>
          <li>
            <span>03</span>
            <h2>Esperas sentado</h2>
            <p>El lavado corre mientras llega el plato o la copa.</p>
          </li>
          <li>
            <span>04</span>
            <h2>Sales</h2>
            <p>Una sola cuenta. El auto, seco. Aquí se reserva; en el patio se cobra.</p>
          </li>
        </ol>

        <section>
          <p className="eyebrow">Los tres oficios</p>
          <div className="places">
            <article className="place place-bay">
              <h3>La bahía</h3>
              <p>Del enjuague de veinte minutos al detalle de dos horas.</p>
              <ul className="mini">
                {packages.map((pkg) => (
                  <li key={pkg.id}>
                    <a href={`#/lavado?paquete=${pkg.id}`}>{pkg.name}</a>
                    <span>{moneyCents(pkg.price * 100)}</span>
                  </li>
                ))}
              </ul>
              <p className="muted">Tarifa de sedán. El tamaño del auto mueve el precio.</p>
              <a className="btn btn-lagoon" href="#/lavado">
                Reservar bahía
              </a>
            </article>
            <article className="place place-kitchen">
              <h3>La cocina</h3>
              <p>Fuego, mar y algo frío para picar mientras esperas.</p>
              {chicken ? (
                <ul className="mini">
                  <li>
                    <span>{chicken.name}</span>
                    <span>{moneyCents(chicken.price * 100)}</span>
                  </li>
                  <li>
                    <span>Última mesa</span>
                    <span>22:30</span>
                  </li>
                </ul>
              ) : null}
              <a className="btn btn-lagoon" href="#/cocina">
                Ver la cocina
              </a>
            </article>
            <article className="place place-bar">
              <h3>La barra</h3>
              {signature ? (
                <>
                  <p>
                    {signature.name}. {signature.description}
                  </p>
                  <p className="price-line">{moneyCents(signature.price * 100)}</p>
                </>
              ) : null}
              <p className="muted">Si no hay plato, la barra toma hasta las 23:30.</p>
              <a className="btn btn-paper" href="#/barra">
                Ver la barra
              </a>
            </article>
          </div>
        </section>
      </div>

      <section className="offer">
        <div className="wrap offer-grid">
          <div className="offer-copy">
            <p className="eyebrow">Menú del patio</p>
            <h2>Completo, pollo al carbón y agua de jamaica.</h2>
            <p>{discountNote()}</p>
          </div>
          <div className="offer-bill">
            {patio.lines.map((line) => (
              <div key={line.id} className="line">
                <span>{line.label}</span>
                <span>{moneyCents(line.amountCents)}</span>
              </div>
            ))}
            <p className="total">
              <span>Queda</span>
              <span>{moneyCents(patio.totalCents)}</span>
            </p>
            <button type="button" className="btn btn-primary" onClick={addPatio}>
              Sumar a mi visita
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
