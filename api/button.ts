import { open } from "../src/server/open.js";

export async function POST(request: Request): Promise<Response> {
  return open(request, "button");
}

export async function PATCH(request: Request): Promise<Response> {
  return open(request, "button");
}
