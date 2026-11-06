import { STATUS_COPY } from "../data";
import { Receipt, SectionHead } from "../components";
import { formatStamp } from "../logic";
import { useStore } from "../store";

export function Ticket() {
  const { visits, activeCode, setStatus, repeatVisit, removeVisit, clearDraft, focusVisit } = useStore();
  const visit = visits.find((item) => item.code === activeCode) ?? visits[0];

  if (!visit) {
    return (
      <div className="wrap">
        <SectionHead
          eyebrow="Ticket"
          title="Todavía no hay una visita."
          lede="Cuando confirmes, el código queda en este navegador."
        />
        <a className="btn btn-lagoon" href="#/lavado">
          Armar una visita
        </a>
      </div>
    );
  }

  const others = visits.filter((item) => item.code !== visit.code);
  const canCancel = visit.status === "confirmada" || visit.status === "en-bahia";

  return (
    <div className="wrap ticket">
      <p className="eyebrow">Ticket</p>
      <h1 className="code">{visit.code}</h1>
      <p>{STATUS_COPY[visit.status]}</p>
      <p className="muted">Anotada {formatStamp(visit.createdAt)}</p>
      <div className="inline-actions no-print">
        {canCancel ? (
          <button type="button" className="btn btn-ghost" onClick={() => setStatus(visit.code, "cancelada")}>
            Cancelar visita
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={() => repeatVisit(visit.code)}>
          Repetir
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          Imprimir
        </button>
        <button
          type="button"
          className="btn btn-lagoon"
          onClick={() => {
            clearDraft();
            window.location.hash = "#/lavado";
          }}
        >
          Nueva visita
        </button>
        {visit.status === "cancelada" ? (
          <button type="button" className="btn btn-ghost" onClick={() => removeVisit(visit.code)}>
            Quitar del libro
          </button>
        ) : null}
        <a className="btn btn-ghost" href="#/mostrador">
          Mostrador
        </a>
      </div>
      <Receipt draft={visit.draft} lines={visit.lines} totalCents={visit.totalCents} />
      {others.length > 0 ? (
        <section className="no-print">
          <h2>Otras visitas en este navegador</h2>
          <ul className="edit-lines">
            {others.map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    focusVisit(item.code);
                    window.scrollTo(0, 0);
                  }}
                >
                  {item.code} · {item.draft.name} · {STATUS_COPY[item.status]}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
