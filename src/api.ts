import type { Product, ServiceRef } from "./types";

export type Board = {
  admin: boolean;
  day: string;
  services: ServiceRef[];
  allServices: ServiceRef[];
  buttons: Product[];
  catalog: Product[];
  menuIds: string[];
};

export type Session = {
  admin: boolean;
  name: string;
  email: string;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  if (method !== "GET" && method !== "HEAD") headers.set("x-oleaje", "1");
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch {
    throw new Error("La caja no respondió.");
  }
  const text = await response.text();
  let body: { error?: string } = {};
  let parsed = text.length === 0;
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
      parsed = true;
    } catch {
      parsed = false;
    }
  }
  if (!response.ok || !parsed) throw new Error(body.error || `La caja no respondió (${response.status}).`);
  return body as T;
}
