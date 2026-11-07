import { open } from "../src/server/open.js";

export async function GET(request: Request): Promise<Response> {
  return open(request, "session");
}
