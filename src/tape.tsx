export function Tape({ text }: { text: string }) {
  return <pre className="tape">{text}</pre>;
}

export function PrintButton({ label = "Imprimir en térmica" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      {label}
    </button>
  );
}
