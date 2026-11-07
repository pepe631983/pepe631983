import { requireIdentity, type VerifiedIdentity } from "../cursor/identity.js";
import { route, type Viewer } from "../src/server/routes.js";

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
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  return route(request, name, viewerFrom(identity));
}
