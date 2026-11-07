import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

function readBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    req.on("end", () => {
      const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(body);
    });
    req.on("error", reject);
  });
}

function oleajeApi(): Plugin {
  return {
    name: "oleaje-api",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) {
          next();
          return;
        }
        try {
          const loaded = (await server.ssrLoadModule("/api/handle.ts")) as {
            handle: (request: Request, name: string) => Promise<Response>;
          };
          const host = req.headers.host ?? "127.0.0.1:5173";
          const method = req.method ?? "GET";
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(", "));
          }
          const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
          const request = new Request(`http://${host}${url}`, { method, headers, body });
          const name = url.slice("/api/".length).split("?")[0] ?? "";
          const response = await loaded.handle(request, name);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "La caja no pudo guardar." }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), oleajeApi()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  test: { environment: "node" },
});
