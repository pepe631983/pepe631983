import { useState } from "react";
import { WaveMark } from "../art";
import { VEHICLE_LABEL, VEHICLE_ORDER, tone } from "../data";
import { addProduct, closeText, dayKey, formatDayLabel, formatWhen, moneyExact, parseMoney, report } from "../logic";
import { useStore } from "../store";
import { PrintButton, Tape } from "../tape";
import type { CartLine, Pay, Product, Sale, VehicleKind } from "../types";

export function Books() {
  const { sales, today, services, admin, editSale, deleteSale, catalog } = useStore();
  const seen = new Set<string>();
  for (const sale of sales) {
    const day = dayKey(sale.at);
    if (day) seen.add(day);
  }
  const days = [today, ...[...seen].filter((day) => day !== today).sort().reverse()];
  const [day, setDay] = useState(today);
  const books = report(sales, day);
  const columns = books.services.length > 0 ? books.services : day === today ? services : [];
  const sum = columns.reduce((total, item) => total + (books.byService[item.id] ?? 0), 0);
  const listed = sales.filter((sale) => dayKey(sale.at) === day);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function remove(number: string) {
    const result = await deleteSale(number);
    if (!result.ok) setNotice(result.reason);
    else {
      setPendingDelete(null);
      setEditing(null);
    }
  }

  return (
    <div className="sheet">
      <header className="page-head no-print">
        <a className="back" href="#/">
          <WaveMark />
          Caja
        </a>
        <div>
          <h1>Libros</h1>
          <p>Cada servicio cierra por su lado. El total es la suma de esos servicios.</p>
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
        {columns.map((item) => (
          <article key={item.id} className={`ledger ${tone(item.id)}`}>
            <p>{item.name}</p>
            <strong>{moneyExact(books.byService[item.id] ?? 0)}</strong>
          </article>
        ))}
        <article className="ledger total">
          <p>Total</p>
          <strong>{moneyExact(books.totalCents)}</strong>
        </article>
      </div>
      {columns.length > 0 ? (
        <p className={sum === books.totalCents ? "check" : "warn"}>
          {columns.map((item) => moneyExact(books.byService[item.id] ?? 0)).join(" + ")} = {moneyExact(sum)}
        </p>
      ) : null}
      <p className="muted">
        {books.tickets} tickets · Efectivo {moneyExact(books.cashCents)} · Tarjeta {moneyExact(books.cardCents)}
      </p>
      <p className="no-print">
        <a className="btn btn-primary" href="#/cierre">
          Ver cierre térmico
        </a>
      </p>
      {notice ? <p className="warn">{notice}</p> : null}
      <div className="sales no-print">
        {listed.length === 0 ? <p className="empty">Sin tickets en este día.</p> : null}
        {listed.map((sale) => (
          <article key={sale.number} className="sale">
            <div className="sale-meta">
              <strong>#{sale.number}</strong>
              <span>{formatWhen(sale.at)}</span>
              <span>{sale.pay === "efectivo" ? "Efectivo" : "Tarjeta"}</span>
            </div>
            <div className="sale-services">
              {sale.services.map((item) => (
                <span key={item.id}>
                  {item.name} {moneyExact(sale.byService[item.id] ?? 0)}
                </span>
              ))}
            </div>
            <strong>{moneyExact(sale.totalCents)}</strong>
            <div className="sale-actions">
              <a href={`#/recibo/${sale.number}`}>Reimprimir</a>
              {admin ? (
                <button type="button" onClick={() => setEditing(editing === sale.number ? null : sale.number)}>
                  {editing === sale.number ? "Cerrar" : "Editar"}
                </button>
              ) : null}
              {admin && pendingDelete === sale.number ? (
                <button type="button" onClick={() => remove(sale.number)}>
                  Confirmar eliminación
                </button>
              ) : null}
              {admin && pendingDelete !== sale.number ? (
                <button type="button" onClick={() => setPendingDelete(sale.number)}>
                  Eliminar
                </button>
              ) : null}
            </div>
            {admin && editing === sale.number ? (
              <SaleEditor
                sale={sale}
                catalog={catalog}
                onClose={() => setEditing(null)}
                onSave={editSale}
                onDelete={remove}
                onError={setNotice}
              />
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function SaleEditor({
  sale,
  catalog,
  onClose,
  onSave,
  onDelete,
  onError,
}: {
  sale: Sale;
  catalog: Product[];
  onClose: () => void;
  onSave: (number: string, lines: CartLine[], pay: Pay, tenderedCents: number | null) => Promise<{ ok: true } | { ok: false; reason: string }>;
  onDelete: (number: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [lines, setLines] = useState(sale.lines);
  const [pay, setPay] = useState<Pay>(sale.pay);
  const [cash, setCash] = useState(sale.pay === "efectivo" ? (sale.tenderedCents / 100).toFixed(2) : "");
  const [vehicle, setVehicle] = useState<VehicleKind>("sedan");
  const [adding, setAdding] = useState(catalog[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const picked = catalog.find((item) => item.id === adding);

  function changeQty(key: string, qty: number) {
    setLines((current) => (qty <= 0 ? current.filter((line) => line.key !== key) : current.map((line) => (line.key === key ? { ...line, qty } : line))));
  }

  function addLine() {
    if (!picked) return;
    setLines((current) => addProduct(current, picked, picked.scales ? vehicle : "sedan"));
  }

  async function save() {
    if (lines.length === 0) {
      onError("Elimina la venta si la cuenta queda vacía.");
      return;
    }
    const tendered = pay === "efectivo" ? parseMoney(cash) : null;
    if (pay === "efectivo" && tendered === null) {
      onError("Escribe el efectivo recibido.");
      return;
    }
    setBusy(true);
    const result = await onSave(sale.number, lines, pay, tendered);
    setBusy(false);
    if (!result.ok) onError(result.reason);
    else onClose();
  }

  return (
    <div className="editor">
      {lines.map((line) => (
        <div key={line.key} className="tline">
          <div>
            <strong>{line.name}</strong>
            <span className="unit">{moneyExact(line.unitCents)}</span>
          </div>
          <div className="qty">
            <button type="button" aria-label={`Quitar uno de ${line.name}`} onClick={() => changeQty(line.key, line.qty - 1)}>
              −
            </button>
            <span>{line.qty}</span>
            <button type="button" aria-label={`Agregar otro ${line.name}`} onClick={() => changeQty(line.key, line.qty + 1)}>
              +
            </button>
          </div>
        </div>
      ))}
      {lines.length === 0 ? <p className="muted">La cuenta quedó vacía. Elimínala.</p> : null}
      {catalog.length > 0 ? (
        <div className="row-actions">
          <select value={adding} onChange={(event) => setAdding(event.target.value)} aria-label="Producto para agregar">
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {picked?.scales ? (
            <select value={vehicle} onChange={(event) => setVehicle(event.target.value as VehicleKind)} aria-label="Vehículo">
              {VEHICLE_ORDER.map((kind) => (
                <option key={kind} value={kind}>
                  {VEHICLE_LABEL[kind]}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" onClick={addLine}>
            Agregar
          </button>
        </div>
      ) : null}
      <div className="pay" role="group" aria-label="Forma de pago">
        <button type="button" aria-pressed={pay === "efectivo"} onClick={() => setPay("efectivo")}>
          Efectivo
        </button>
        <button type="button" aria-pressed={pay === "tarjeta"} onClick={() => setPay("tarjeta")}>
          Tarjeta
        </button>
      </div>
      {pay === "efectivo" ? (
        <label className="field">
          Recibido
          <input value={cash} onChange={(event) => setCash(event.target.value)} inputMode="decimal" />
        </label>
      ) : null}
      <div className="row-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || lines.length === 0}>
          Guardar venta
        </button>
        <button type="button" onClick={() => (armed ? onDelete(sale.number) : setArmed(true))} disabled={busy}>
          {armed ? "Confirmar eliminación" : "Eliminar venta"}
        </button>
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
