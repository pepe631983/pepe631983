import { useState } from "react";
import { WaveMark } from "../art";
import { SERVICE_LABEL, SERVICES } from "../data";
import { closeText, dayKey, formatDayLabel, formatWhen, moneyExact, report } from "../logic";
import { useStore } from "../store";
import { PrintButton, Tape } from "../tape";

export function Books() {
  const { sales, today, voidSale } = useStore();
  const seen = new Set<string>();
  for (const sale of sales) {
    const day = dayKey(sale.at);
    if (day) seen.add(day);
  }
  const days = [today, ...[...seen].filter((day) => day !== today).sort().reverse()];
  const [day, setDay] = useState(today);
  const books = report(sales, day);
  const sum = books.byService.bar + books.byService.restaurante + books.byService.lavado;
  const listed = sales.filter((sale) => dayKey(sale.at) === day);
  const [pendingVoid, setPendingVoid] = useState<string | null>(null);

  return (
    <div className="sheet">
      <header className="page-head no-print">
        <a className="back" href="#/">
          <WaveMark />
          Caja
        </a>
        <div>
          <h1>Libros</h1>
          <p>Cada servicio cierra por su lado. El total es la suma de los tres.</p>
        </div>
        <p className="when">{formatDayLabel(day)}</p>
      </header>
      <div className="day-row no-print" role="group" aria-label="Día">
        {days.map((item) => (
          <button key={item} type="button" aria-pressed={item === day} onClick={() => setDay(item)}>
            {item === today ? "Hoy" : formatDayLabel(item)}
          </button>
        ))}
      </div>
      <div className="ledgers">
        {SERVICES.map((id) => (
          <article key={id} className={`ledger ${id}`}>
            <p>{SERVICE_LABEL[id]}</p>
            <strong>{moneyExact(books.byService[id])}</strong>
          </article>
        ))}
        <article className="ledger total">
          <p>Total</p>
          <strong>{moneyExact(books.totalCents)}</strong>
        </article>
      </div>
      <p className={sum === books.totalCents ? "check" : "warn"}>
        {moneyExact(books.byService.bar)} + {moneyExact(books.byService.restaurante)} + {moneyExact(books.byService.lavado)} ={" "}
        {moneyExact(sum)}
      </p>
      <p className="muted">
        {books.tickets} tickets · Efectivo {moneyExact(books.cashCents)} · Tarjeta {moneyExact(books.cardCents)} · Anulados{" "}
        {books.voids}
      </p>
      <p className="no-print">
        <a className="btn btn-primary" href="#/cierre">
          Ver cierre térmico
        </a>
      </p>
      <div className="sales no-print">
        {listed.length === 0 ? <p className="empty">Sin tickets en este día.</p> : null}
        {listed.map((sale) => (
          <article key={sale.number} className={sale.voided ? "sale void" : "sale"}>
            <div className="sale-meta">
              <strong>#{sale.number}</strong>
              <span>{formatWhen(sale.at)}</span>
              <span>{sale.voided ? "Anulado" : sale.pay === "efectivo" ? "Efectivo" : "Tarjeta"}</span>
            </div>
            <div className="sale-services">
              {SERVICES.map((id) => (
                <span key={id}>
                  {SERVICE_LABEL[id]} {moneyExact(sale.byService[id])}
                </span>
              ))}
            </div>
            <strong>{moneyExact(sale.totalCents)}</strong>
            <div className="sale-actions">
              <a href={`#/recibo/${sale.number}`}>Reimprimir</a>
              {sale.voided ? null : pendingVoid === sale.number ? (
                <button type="button" onClick={() => voidSale(sale.number)}>
                  Confirmar anulación
                </button>
              ) : (
                <button type="button" onClick={() => setPendingVoid(sale.number)}>
                  Anular
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function ClosePage() {
  const { sales, today } = useStore();
  const books = report(sales, today);
  return (
    <div className="print-page">
      <div className="no-print print-actions">
        <a href="#/libros">Volver a contabilidad</a>
        <PrintButton label="Imprimir cierre en térmica" />
      </div>
      <Tape text={closeText(books)} />
    </div>
  );
}
