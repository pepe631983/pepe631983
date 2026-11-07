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
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: "La caja no respondió." };
    }
  }
  if (!response.ok) throw new Error(body.error || "La caja no respondió.");
  return body as T;
}
