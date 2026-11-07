import { useEffect, useState } from "react";
import { ProductArt, WaveMark } from "../art";
import { tone } from "../data";
import { api, type Board } from "../api";
import { fitImage } from "../image";
import { moneyExact, parseMoney } from "../logic";
import { useStore } from "../store";
import type { Product } from "../types";

type Draft = {
  id?: string;
  serviceId: string;
  name: string;
  price: string;
  category: string;
  image: string;
  scales: boolean;
  hideOnMoto: boolean;
  onMenu: boolean;
};

function draftFrom(button: Product | undefined, serviceId: string, onMenu: boolean): Draft {
  return {
    id: button?.id,
    serviceId: button?.service ?? serviceId,
    name: button?.name ?? "",
    price: button ? (button.priceCents !== undefined ? (button.priceCents / 100).toFixed(2) : button.price.toFixed(2)) : "",
    category: button?.category ?? "",
    image: button?.image ?? "",
    scales: button?.scales ?? false,
    hideOnMoto: button?.kinds ? !button.kinds.includes("moto") : false,
    onMenu,
  };
}

export function Admin() {
  const { ready, admin, viewer, allServices, catalog, menuIds, today, mutate } = useStore();
  const [picked, setPicked] = useState<string[]>(menuIds);
  const [serviceName, setServiceName] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<Draft>(() => draftFrom(undefined, allServices[0]?.id ?? "bar", true));
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPicked(menuIds);
  }, [menuIds]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const service of allServices) next[service.id] = service.name;
    setNames(next);
  }, [allServices]);

  async function run(action: () => Promise<{ ok: true } | { ok: false; reason: string }>, done: string) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    setNote(result.ok ? done : result.reason);
    return result.ok;
  }

  async function createService() {
    const ok = await run(() => mutate("/api/service", "POST", { name: serviceName }), "Servicio creado.");
    if (ok) setServiceName("");
  }

  async function rename(id: string) {
    await run(() => mutate("/api/service", "PATCH", { id, name: names[id] ?? "" }), "Nombre guardado.");
  }

  async function chooseImage(file: File | undefined, apply: (image: string) => void) {
    if (!file) return;
    try {
      apply(await fitImage(file));
      setNote(null);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "No se pudo leer la imagen.");
    }
  }

  function payload(item: Draft, includeMenu: boolean): { ok: false; error: string } | { ok: true; body: Record<string, unknown> } {
    const priceCents = parseMoney(item.price);
    if (priceCents === null) return { ok: false, error: "Escribe el precio." };
    return {
      ok: true,
      body: {
        id: item.id,
        serviceId: item.serviceId,
        name: item.name,
        priceCents,
        category: item.category,
        image: item.image,
        scales: item.scales,
        hideOnMoto: item.hideOnMoto,
        onMenu: includeMenu ? item.onMenu : undefined,
      },
    };
  }

  async function saveDraft(item: Draft) {
    const packed = payload(item, !item.id);
    if (!packed.ok) {
      setNote(packed.error);
      return;
    }
    const ok = await run(
      () => mutate(item.id ? "/api/button" : "/api/button", item.id ? "PATCH" : "POST", packed.body),
      item.id ? "Botón guardado." : "Botón creado.",
    );
    if (ok && !item.id) setFresh(draftFrom(undefined, item.serviceId, true));
    if (ok && item.id) setEditDraft(null);
  }

  async function publish() {
    await run(() => mutate("/api/menu", "PUT", { day: today, buttonIds: picked }), "Menú de hoy publicado.");
  }

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function copyYesterday() {
    const [year, month, date] = today.split("-").map(Number);
    const prior = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, date ?? 1));
    prior.setUTCDate(prior.getUTCDate() - 1);
    const day = prior.toISOString().slice(0, 10);
    try {
      const board = await api<Board>(`/api/board?day=${encodeURIComponent(day)}`);
      const ids = board.menuIds.filter((id) => catalog.some((button) => button.id === id));
      setPicked(ids);
      setNote(ids.length === 0 ? "Ayer no hubo menú." : "Menú de ayer listo. Publícalo para usarlo hoy.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "No se pudo copiar el menú.");
    }
  }

  if (!ready) {
    return (
      <div className="sheet">
        <p className="empty">Abriendo la caja…</p>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="sheet">
        <a className="back" href="#/">
          <WaveMark />
          Caja
        </a>
        <h1>Menú</h1>
        <p>Solo el admin arma el menú, cambia los nombres y las fotos, y corrige una venta.</p>
      </div>
    );
  }

  return (
    <div className="sheet admin">
      <header className="page-head">
        <a className="back" href="#/">
          <WaveMark />
          Caja
        </a>
        <div>
          <h1>Menú de hoy</h1>
          <p>
            {viewer ? `${viewer} publica el menú. ` : ""}El cajero cobra. El nombre nuevo entra en las próximas cuentas.
          </p>
        </div>
      </header>
      {note ? <p className="cue">{note}</p> : null}

      <section className="stack">
        <h2>Servicios</h2>
        {allServices.map((service) => (
          <div key={service.id} className="editor">
            <label>
              Nombre de {service.name}
              <input value={names[service.id] ?? service.name} onChange={(event) => setNames((current) => ({ ...current, [service.id]: event.target.value }))} />
            </label>
            <button type="button" className="btn btn-primary" onClick={() => rename(service.id)} disabled={busy}>
              Guardar nombre
            </button>
          </div>
        ))}
        <div className="editor">
          <label>
            Servicio nuevo
            <input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="Terraza" />
          </label>
          <button type="button" className="btn btn-primary" onClick={createService} disabled={busy || serviceName.trim() === ""}>
            Crear servicio
          </button>
        </div>
      </section>

      <section className="stack">
        <h2>Botón nuevo</h2>
        <ButtonForm
          draft={fresh}
          services={allServices}
          busy={busy}
          submitLabel="Crear botón"
          onChange={setFresh}
          onImage={(file) => chooseImage(file, (image) => setFresh((current) => ({ ...current, image })))}
          onSubmit={() => saveDraft(fresh)}
        />
      </section>

      <section className="stack">
        <h2>Botones</h2>
        <div className="row-actions">
          <button type="button" onClick={copyYesterday}>
            Copiar el menú de ayer
          </button>
          <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>
            Publicar menú de hoy
          </button>
        </div>
        <div className="menu-pick">
          {catalog.map((button) => (
            <label key={button.id} className="check">
              <input type="checkbox" checked={picked.includes(button.id)} onChange={() => toggle(button.id)} />
              <ProductArt id={button.id} image={button.image} />
              <span>
                {button.name}
                <small>
                  {allServices.find((service) => service.id === button.service)?.name ?? button.service} · {moneyExact(button.priceCents ?? Math.round(button.price * 100))}
                </small>
              </span>
            </label>
          ))}
        </div>
        {catalog.map((button) =>
          editDraft?.id === button.id ? (
            <ButtonForm
              key={button.id}
              draft={editDraft}
              services={allServices}
              busy={busy}
              submitLabel="Guardar botón"
              onChange={setEditDraft}
              onImage={(file) => chooseImage(file, (image) => setEditDraft((current) => (current ? { ...current, image } : current)))}
              onSubmit={() => saveDraft(editDraft)}
              onClose={() => setEditDraft(null)}
            />
          ) : (
            <div key={button.id} className="editor button-row">
              <ProductArt id={button.id} image={button.image} />
              <div>
                <strong>{button.name}</strong>
                <p className="muted">
                  {allServices.find((service) => service.id === button.service)?.name} · {moneyExact(button.priceCents ?? Math.round(button.price * 100))}
                  {picked.includes(button.id) ? " · en el menú" : " · fuera del menú"}
                </p>
              </div>
              <button type="button" onClick={() => setEditDraft(draftFrom(button, button.service, picked.includes(button.id)))}>
                Editar
              </button>
            </div>
          ),
        )}
      </section>
    </div>
  );
}

function ButtonForm({
  draft,
  services,
  busy,
  submitLabel,
  onChange,
  onImage,
  onSubmit,
  onClose,
}: {
  draft: Draft;
  services: { id: string; name: string }[];
  busy: boolean;
  submitLabel: string;
  onChange: (draft: Draft) => void;
  onImage: (file: File | undefined) => void;
  onSubmit: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="editor">
      <div className="button-row">
        <ProductArt id={draft.id ?? "nuevo"} image={draft.image} />
        <label className="file-btn">
          Cargar foto
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onImage(event.target.files?.[0])} />
        </label>
        {draft.image ? (
          <button type="button" onClick={() => onChange({ ...draft, image: "" })}>
            Quitar foto
          </button>
        ) : null}
      </div>
      <label>
        Nombre
        <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
      </label>
      <label>
        Precio
        <input value={draft.price} onChange={(event) => onChange({ ...draft, price: event.target.value })} inputMode="decimal" />
      </label>
      <label>
        Categoría
        <input value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value })} />
      </label>
      <label>
        Servicio
        <select value={draft.serviceId} onChange={(event) => onChange({ ...draft, serviceId: event.target.value })}>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>
      <div className="checks">
        <label className={`check ${tone(draft.serviceId)}`}>
          <input type="checkbox" checked={draft.scales} onChange={(event) => onChange({ ...draft, scales: event.target.checked })} />
          El precio cambia con el vehículo
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.hideOnMoto} onChange={(event) => onChange({ ...draft, hideOnMoto: event.target.checked })} />
          Ocultar en moto
        </label>
        {draft.id ? null : (
          <label className="check">
            <input type="checkbox" checked={draft.onMenu} onChange={(event) => onChange({ ...draft, onMenu: event.target.checked })} />
            En el menú de hoy
          </label>
        )}
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={busy}>
          {submitLabel}
        </button>
        {onClose ? (
          <button type="button" onClick={onClose}>
            Cerrar
          </button>
        ) : null}
      </div>
    </div>
  );
}
