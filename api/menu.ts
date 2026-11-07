import { open } from "../src/server/open.js";

export async function PUT(request: Request): Promise<Response> {
  return open(request, "menu");
}
