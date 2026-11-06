import { useState } from "react";
import { STATUSES, STATUS_COPY } from "../data";
import { SectionHead } from "../components";
import { formatLongDay, moneyCents } from "../logic";
import { useStore } from "../store";
import type { Visit } from "../types";

type Filter = "curso" | "hoy" | "todas" | "canceladas";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "curso", label: "En curso" },
  { id: "hoy", label: "Hoy" },
  { id: "todas", label: "Todas" },
  { id: "canceladas", label: "Canceladas" },
];

function matches(visit: Visit, filter: Filter, today: string): boolean {
  if (filter === "todas") return true;
  if (filter === "canceladas") return visit.status === "cancelada";
  if (filter === "hoy") return visit.draft.date === today && visit.status !== "cancelada";
  return visit.status !== "lista" && visit.status !== "cancelada";
}

export function Counter() {
  const { visits, clock, setStatus, removeVisit } = useStore();
  const [filter, setFilter] = useState<Filter>("curso");
  const visible = visits.filter((visit) => matches(visit, filter, clock.today));
  const activeToday = visits.filter(
    (visit) => visit.draft.date === clock.today && visit.status !== "cancelada" && visit.status !== "lista",
  ).length;

  return (
    <div className="wrap">
      <SectionHead
        eyebrow="Mostrador"
        title="El libro de hoy."
        lede="Las visitas confirmadas en este navegador. Tres bahías: si las tres coinciden, esa hora se cierra."
      />
      <p className="facts-line">En curso hoy: {activeToday}</p>
      <div className="filters" role="group" aria-label="Filtrar visitas">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="empty">
          No hay visitas en esta vista.{" "}
          <a href="#/lavado">Armar una</a>
        </p>
      ) : (
        <div className="jobs">
          {visible.map((visit) => (
            <article key={visit.code} className="job">
              <header>
                <div>
                  <p className="eyebrow">{visit.code}</p>
                  <h3>{visit.draft.name}</h3>
                </div>
                <strong>{moneyCents(visit.totalCents)}</strong>
              </header>
              <p>
                {formatLongDay(visit.draft.date)}
                {visit.draft.washTime ? ` · bahía ${visit.draft.washTime}` : ""}
                {visit.draft.diningTime ? ` · mesa ${visit.draft.diningTime}` : ""}
                {visit.draft.plate ? ` · ${visit.draft.plate}` : ""}
              </p>
              <p className="muted">{STATUS_COPY[visit.status]}</p>
              <p className="muted">{visit.lines.filter((line) => line.kind !== "discount").map((line) => line.label).join(" · ")}</p>
              <div className="status-row" role="group" aria-label={`Estado de ${visit.code}`}>
                {STATUSES.map((status) => (
                  <button
                    key={status.id}
                    type="button"
                    aria-pressed={visit.status === status.id}
                    onClick={() => setStatus(visit.code, status.id)}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
              {visit.status === "cancelada" ? (
                <button type="button" className="btn btn-ghost" onClick={() => removeVisit(visit.code)}>
                  Quitar del libro
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
