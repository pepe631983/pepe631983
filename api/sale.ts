import { open } from "../src/server/open.js";

export async function PATCH(request: Request): Promise<Response> {
  return open(request, "sale");
}

export async function DELETE(request: Request): Promise<Response> {
  return open(request, "sale");
}
