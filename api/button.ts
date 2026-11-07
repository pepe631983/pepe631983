import { handle } from "./handle.js";

export function POST(request: Request): Promise<Response> {
  return handle(request, "button");
}

export function PATCH(request: Request): Promise<Response> {
  return handle(request, "button");
}
