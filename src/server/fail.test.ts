import { afterEach, describe, expect, it } from "vitest";
import { failure } from "./fail";

const original = process.env.DATABASE_URL;

describe("failure", () => {
  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it("responde JSON y omite la cadena de conexión", async () => {
    process.env.DATABASE_URL = "postgres://oleaje:s3cret@db.internal:5432/oleaje";
    const response = failure(new Error(`connect ${process.env.DATABASE_URL} password=s3cret refused`), "La caja no pudo abrir.");
    const body = (await response.json()) as { error: string };
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.error.startsWith("La caja no pudo abrir.")).toBe(true);
    expect(body.error).not.toContain("s3cret");
    expect(body.error).not.toContain("db.internal");
    expect(body.error).not.toContain("postgres://oleaje");
  });
});
