import { useEffect } from "react";
import { Admin } from "./pages/Admin";
import { Books, ClosePage } from "./pages/Books";
import { ReceiptPage } from "./pages/Receipt";
import { Register } from "./pages/Register";
import { useStore } from "./store";
import type { Route } from "./types";

const TITLES: Record<Route, string> = {
  caja: "Caja · Oleaje",
  libros: "Contabilidad · Oleaje",
  recibo: "Ticket térmico · Oleaje",
  cierre: "Cierre · Oleaje",
  admin: "Menú · Oleaje",
};

export function App() {
  const { route } = useStore();

  useEffect(() => {
    document.title = TITLES[route];
  }, [route]);

  return (
    <main>
      {route === "caja" && <Register />}
      {route === "libros" && <Books />}
      {route === "recibo" && <ReceiptPage />}
      {route === "cierre" && <ClosePage />}
      {route === "admin" && <Admin />}
    </main>
  );
}
