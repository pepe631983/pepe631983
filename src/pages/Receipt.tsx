import { thermalText } from "../logic";
import { PrintButton, Tape } from "../tape";
import { useStore } from "../store";

export function ReceiptPage() {
  const { sales, receiptNumber } = useStore();
  const sale = sales.find((item) => item.number === receiptNumber);

  if (!sale) {
    return (
      <div className="print-page">
        <p className="empty">No está el ticket {receiptNumber ?? ""}.</p>
        <a href="#/">Volver a la caja</a>
      </div>
    );
  }

  return (
    <div className="print-page">
      <div className="no-print print-actions">
        <a href="#/">Nueva cuenta</a>
        <a href="#/libros">Contabilidad</a>
        <PrintButton />
      </div>
      <Tape text={thermalText(sale)} />
      <p className="no-print hint">El ticket sale a 80 mm. En el cuadro de impresión elige la impresora térmica.</p>
    </div>
  );
}
