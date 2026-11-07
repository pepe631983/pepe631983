import { handle } from "./handle.js";

export function GET(request: Request): Promise<Response> {
  return handle(request, "board");
}
