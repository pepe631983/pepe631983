import { handle } from "./handle.js";

export function PATCH(request: Request): Promise<Response> {
  return handle(request, "sale");
}

export function DELETE(request: Request): Promise<Response> {
  return handle(request, "sale");
}
