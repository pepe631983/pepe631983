import { requireIdentity, type VerifiedIdentity } from "../../cursor/identity.js";
import { failure } from "./fail.js";
import { route, type Viewer } from "./routes.js";

function viewerFrom(identity: VerifiedIdentity): Viewer {
  if (identity.kind === "key") {
    return {
      kind: "key",
      sub: identity.sub,
      email: "",
      name: identity.name,
      appVisibility: identity.appVisibility === "team" ? "team" : "private",
      teamRole: identity.appVisibility === "team" ? identity.teamRole : undefined,
      stage: identity.stage,
    };
  }
  return {
    kind: "person",
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    appVisibility: identity.appVisibility,
    teamRole: identity.appVisibility === "team" ? identity.teamRole : undefined,
    stage: identity.stage,
  };
}

export async function handle(request: Request, name: string): Promise<Response> {
  try {
    const identity = await requireIdentity(request);
    if (identity instanceof Response) return identity;
    return await route(request, name, viewerFrom(identity));
  } catch (error) {
    return failure(error, "La caja no pudo guardar.");
  }
}
