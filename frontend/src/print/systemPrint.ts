/** Impresión mediante diálogo del sistema (Windows, macOS, iOS AirPrint vía compartir, Android). */
export function printHtmlViaSystemDialog(html: string, _copies: number): Promise<'sent_to_spooler' | 'unknown'> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      document.body.removeChild(frame);
      reject(new Error('No se pudo abrir la vista de impresión'));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    let settled = false;
    const finish = (status: 'sent_to_spooler' | 'unknown') => {
      if (settled) return;
      settled = true;
      setTimeout(() => {
        document.body.removeChild(frame);
      }, 500);
      resolve(status);
    };

    const onAfterPrint = () => finish('sent_to_spooler');
    win.addEventListener('afterprint', onAfterPrint);

    setTimeout(() => {
      try {
        // Una sola llamada: el usuario elige copias en el diálogo del sistema.
        win.print();
      } catch (err) {
        win.removeEventListener('afterprint', onAfterPrint);
        document.body.removeChild(frame);
        reject(err instanceof Error ? err : new Error('Error al imprimir'));
        return;
      }
      // Si el navegador no dispara afterprint, no reintentamos — estado incierto.
      setTimeout(() => {
        win.removeEventListener('afterprint', onAfterPrint);
        finish('unknown');
      }, 30_000);
    }, 300);
  });
}
