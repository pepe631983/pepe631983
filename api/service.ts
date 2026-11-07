import { handle } from "./handle.js";

export function POST(request: Request): Promise<Response> {
  return handle(request, "service");
}

export function PATCH(request: Request): Promise<Response> {
  return handle(request, "service");
}
