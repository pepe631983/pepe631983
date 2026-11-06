import type { ReactNode } from "react";
import { SEATS } from "./data";
import { datesFrom, dayChip, formatLongDay, moneyCents } from "./logic";
import type { Draft, QuoteLine, Slot } from "./types";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Mark() {
  return (
    <svg viewBox="0 0 48 24" aria-hidden="true">
      <path
        d="M1 9c5-6 10-6 15 0s10 6 15 0 10-6 16 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M1 17c5-6 10-6 15 0s10 6 15 0 10-6 16 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

export function Tide() {
  return (
    <svg className="tide" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 24c50-16 100-16 150 0s100 16 150 0 100-16 150 0 100 16 150 0 100-16 150 0 100 16 150 0 100-16 150 0 100 16 150 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export function SectionHead({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <header className="section-head">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}

export function Qty({
  value,
  onChange,
  label,
  min = 0,
  max = 12,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="qty">
      <button type="button" aria-label={`Menos ${label}`} onClick={() => onChange(value - 1)} disabled={value <= min}>
        −
      </button>
      <span>{value}</span>
      <button type="button" aria-label={`Más ${label}`} onClick={() => onChange(value + 1)} disabled={value >= max}>
        +
      </button>
    </div>
  );
}

export function Adder({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  if (value <= 0) {
    return (
      <button type="button" className="btn btn-ghost add-btn" onClick={() => onChange(1)}>
        Agregar
      </button>
    );
  }
  return <Qty value={value} onChange={onChange} label={label} />;
}

export function DayChips({ date, today, onDate }: { date: string; today: string; onDate: (value: string) => void }) {
  return (
    <div className="days" role="group" aria-label="Día">
      {datesFrom(today, 7).map((value) => (
        <button key={value} type="button" aria-pressed={value === date} onClick={() => onDate(value)}>
          {dayChip(value, today)}
        </button>
      ))}
    </div>
  );
}

export function TimeGrid({
  slots,
  time,
  onTime,
  label,
}: {
  slots: Slot[];
  time: string | null;
  onTime: (value: string) => void;
  label: string;
}) {
  return (
    <div className="slots" role="group" aria-label={label}>
      {slots.map((slot) => (
        <button
          key={slot.time}
          type="button"
          disabled={slot.state !== "open"}
          aria-pressed={slot.time === time && slot.state === "open"}
          aria-label={slot.state === "open" ? slot.time : `${slot.time}, ${slot.state === "full" ? "llena" : "pasó"}`}
          onClick={() => onTime(slot.time)}
        >
          <span>{slot.time}</span>
          {slot.state !== "open" ? <small>{slot.state === "full" ? "llena" : "pasó"}</small> : null}
        </button>
      ))}
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="actionbar">
      <div className="wrap actionbar-inner">{children}</div>
    </div>
  );
}

export function Receipt({
  draft,
  lines,
  totalCents,
}: {
  draft: Draft;
  lines: QuoteLine[];
  totalCents: number;
}) {
  const seat = SEATS.find((item) => item.id === draft.seat);
  const hasOrder = lines.some((line) => line.kind === "item");
  return (
    <div className="receipt-wrap">
      <article className="receipt">
        {draft.name.trim() ? <h2>{draft.name.trim()}</h2> : null}
        <p>
          {formatLongDay(draft.date)}
          {draft.washTime ? ` · bahía ${draft.washTime}` : ""}
          {draft.diningTime ? ` · ${draft.seat === "llevar" ? "recoger" : "mesa"} ${draft.diningTime}` : ""}
        </p>
        <p className="muted">
          {[
            draft.plate ? `Placa ${draft.plate}` : "",
            draft.color ? draft.color : "",
            hasOrder && seat ? seat.name : "",
            hasOrder && draft.seat !== "llevar" ? `${draft.party} ${draft.party === 1 ? "persona" : "personas"}` : "",
            draft.phone.trim(),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {lines.map((line) => (
          <div key={`${line.kind}-${line.id}`} className={cx("line", line.kind === "discount" && "discount")}>
            <span>{line.label}</span>
            <span>{moneyCents(line.amountCents)}</span>
          </div>
        ))}
        <p className="total">
          <span>Total</span>
          <span>{moneyCents(totalCents)}</span>
        </p>
        {draft.note.trim() ? <p className="muted">Nota: {draft.note.trim()}</p> : null}
      </article>
    </div>
  );
}
