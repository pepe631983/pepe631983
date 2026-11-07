import { failure } from "./fail.js";

export async function open(request: Request, name: string): Promise<Response> {
  try {
    const loaded = await import("./http.js");
    return await loaded.handle(request, name);
  } catch (error) {
    return failure(error, "La caja no pudo abrir.");
  }
}
