import { handle } from "./handle.js";

export function PUT(request: Request): Promise<Response> {
  return handle(request, "menu");
}
