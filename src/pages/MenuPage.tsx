import { useState, type ReactNode } from "react";
import { BAR_CATEGORIES, KITCHEN_CATEGORIES, menu } from "../data";
import { ActionBar, Adder, SectionHead } from "../components";
import { buildQuote, moneyCents, qtyOf } from "../logic";
import { useStore } from "../store";
import type { Area } from "../types";

function norm(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function MenuPage({ area }: { area: Area }) {
  const { draft, setQty } = useStore();
  const [category, setCategory] = useState("Todo");
  const [query, setQuery] = useState("");
  const categories = ["Todo", ...(area === "cocina" ? KITCHEN_CATEGORIES : BAR_CATEGORIES)];
  const needle = norm(query.trim());
  const visible = menu.filter((item) => {
    if (item.area !== area) return false;
    if (category !== "Todo" && item.category !== category) return false;
    if (!needle) return true;
    return norm(`${item.name} ${item.description} ${item.category} ${item.tags.join(" ")}`).includes(needle);
  });
  const quote = buildQuote(draft);
  const copy =
    area === "cocina"
      ? {
          eyebrow: "La cocina",
          title: "Pide mientras lavan.",
          lede: "La carta sale con el auto en el agua. La última mesa es a las 22:30.",
          search: "Buscar en la cocina",
          empty: "Nada con ese nombre en la cocina.",
        }
      : {
          eyebrow: "La barra",
          title: "Una copa con la misma cuenta.",
          lede: "Cócteles, barril y algo sin alcohol. Si no hay plato, la barra toma hasta las 23:30.",
          search: "Buscar en la barra",
          empty: "Nada con ese nombre en la barra.",
        };

  const blocks: ReactNode[] = [];
  let last = "";
  for (const item of visible) {
    if (category === "Todo" && item.category !== last) {
      blocks.push(
        <h2 key={`cat-${item.category}`} className="menu-cat">
          {item.category}
        </h2>,
      );
    }
    last = item.category;
    blocks.push(
      <article key={item.id} className="dish">
        <div>
          <div className="dish-top">
            <h3>{item.name}</h3>
            <strong>{moneyCents(item.price * 100)}</strong>
          </div>
          <p>{item.description}</p>
          {item.tags.length > 0 ? (
            <p className="tags">
              {item.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </p>
          ) : null}
        </div>
        <Adder value={qtyOf(draft, item.id)} onChange={(qty) => setQty(item.id, qty)} label={item.name} />
      </article>,
    );
  }

  return (
    <>
      <div className="wrap">
        <SectionHead eyebrow={copy.eyebrow} title={copy.title} lede={copy.lede} />
        <label className="field">
          {copy.search}
          <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} type="search" />
        </label>
        <div className="catbar" role="group" aria-label="Categorías">
          {categories.map((item) => (
            <button key={item} type="button" aria-pressed={item === category} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>
        {visible.length === 0 ? <p className="empty">{copy.empty}</p> : <div className="menu-list">{blocks}</div>}
      </div>
      <ActionBar>
        <span>Visita {moneyCents(quote.totalCents)}</span>
        <a className="btn btn-lagoon" href="#/visita">
          Ver la visita
        </a>
      </ActionBar>
    </>
  );
}
