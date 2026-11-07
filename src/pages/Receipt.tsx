import { WaveMark } from "../art";
import { thermalText } from "../logic";
import { useStore } from "../store";
import { PrintButton, Tape } from "../tape";

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
        <a className="back" href="#/">
          <WaveMark />
          Nueva cuenta
        </a>
        <a href="#/libros">Libros</a>
        <PrintButton />
      </div>
      <div className="printer">
        <Tape text={thermalText(sale)} />
      </div>
      <p className="no-print hint">Sale a 80 mm. En el cuadro de impresión elige la impresora térmica.</p>
    </div>
  );
}
