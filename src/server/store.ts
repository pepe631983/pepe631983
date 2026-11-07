import { emptySlice, ensureSeed, type Slice } from "./book.js";

type Holder = { slices: Record<string, Slice> };

const locks = new Map<string, Promise<void>>();
let memoryOnly = envValue("OLEAJE_BOOK") === "memory" || envValue("VITEST") === "true";
const memory: Holder = { slices: {} };

function envValue(name: string): string {
  if (typeof process === "undefined" || process.env == null) return "";
  const value = process.env[name];
  return typeof value === "string" ? value : "";
}

function hosted(): boolean {
  return envValue("VERCEL") !== "" || envValue("CURSOR_APP_ID") !== "";
}

export function useMemoryBook(): void {
  memoryOnly = true;
  memory.slices = {};
}

export async function updateSlice<T>(
  stage: string,
  change: (slice: Slice) => { slice: Slice; value: T } | { error: string },
): Promise<{ value: T } | { error: string }> {
  const key = stage === "preview" ? "preview" : "production";
  const previous = locks.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, previous.then(() => gate));
  await previous;
  try {
    if (memoryOnly) return await updateFile(key, change);
    if (envValue("DATABASE_URL")) return await updatePostgres(key, change);
    if (hosted()) return { error: "La caja no tiene base de datos." };
    return await updateFile(key, change);
  } finally {
    release();
  }
}

export async function readSlice(stage: string): Promise<Slice> {
  const key = stage === "preview" ? "preview" : "production";
  if (memoryOnly) return ensureSeed(memory.slices[key] ?? emptySlice());
  if (envValue("DATABASE_URL")) return ensureSeed(await loadPostgres(key));
  if (hosted()) throw new Error("La caja no tiene base de datos.");
  const holder = await loadFile();
  return ensureSeed(holder.slices[key] ?? emptySlice());
}

async function updateFile<T>(
  key: string,
  change: (slice: Slice) => { slice: Slice; value: T } | { error: string },
): Promise<{ value: T } | { error: string }> {
  const holder = memoryOnly ? memory : await loadFile();
  const current = ensureSeed(holder.slices[key] ?? emptySlice());
  const result = change(current);
  if ("error" in result) return result;
  holder.slices[key] = result.slice;
  if (!memoryOnly) await saveFile(holder);
  else memory.slices[key] = result.slice;
  return { value: result.value };
}

async function loadFile(): Promise<Holder> {
  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(bookPath(), "utf8");
    const parsed = JSON.parse(raw) as Holder;
    if (!parsed || typeof parsed !== "object" || !parsed.slices) return { slices: {} };
    return parsed;
  } catch {
    return { slices: {} };
  }
}

async function saveFile(holder: Holder): Promise<void> {
  const fs = await import("node:fs/promises");
  const file = bookPath();
  const slash = file.lastIndexOf("/");
  await fs.mkdir(slash >= 0 ? file.slice(0, slash) : ".", { recursive: true });
  await fs.writeFile(file, JSON.stringify(holder));
}

function bookPath(): string {
  const cwd = typeof process !== "undefined" && typeof process.cwd === "function" ? process.cwd() : ".";
  return `${cwd}/data/oleaje-book.json`;
}

async function loadPostgres(key: string): Promise<Slice> {
  const pool = await poolFor();
  await pool.query("create table if not exists oleaje_book (stage text primary key, document jsonb not null)");
  const found = await pool.query("select document from oleaje_book where stage = $1", [key]);
  const document = found.rows[0]?.document as Slice | undefined;
  return document ?? emptySlice();
}

async function updatePostgres<T>(
  key: string,
  change: (slice: Slice) => { slice: Slice; value: T } | { error: string },
): Promise<{ value: T } | { error: string }> {
  const pool = await poolFor();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("create table if not exists oleaje_book (stage text primary key, document jsonb not null)");
    const found = await client.query("select document from oleaje_book where stage = $1 for update", [key]);
    const current = ensureSeed((found.rows[0]?.document as Slice | undefined) ?? emptySlice());
    const result = change(current);
    if (!("error" in result)) {
      await client.query(
        `insert into oleaje_book (stage, document) values ($1, $2::jsonb)
         on conflict (stage) do update set document = excluded.document`,
        [key, JSON.stringify(result.slice)],
      );
    }
    await client.query("commit");
    return "error" in result ? result : { value: result.value };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

type PgPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: { document?: Slice }[] }>;
  connect: () => Promise<{
    query: (text: string, values?: unknown[]) => Promise<{ rows: { document?: Slice }[] }>;
    release: () => void;
  }>;
};

let poolPromise: Promise<PgPool> | null = null;

async function poolFor(): Promise<PgPool> {
  if (poolPromise) return poolPromise;
  const connectionString = envValue("DATABASE_URL");
  const pending = import("pg")
    .then((loaded) => {
      const Pool = poolConstructor(loaded);
      return new Pool({ connectionString, max: 3, connectionTimeoutMillis: 10000 });
    })
    .catch((error: unknown) => {
      poolPromise = null;
      throw error;
    });
  poolPromise = pending;
  return pending;
}

function poolConstructor(loaded: unknown): new (config: { connectionString: string; max: number; connectionTimeoutMillis: number }) => PgPool {
  if (loaded && typeof loaded === "object") {
    const named = (loaded as { Pool?: unknown }).Pool;
    if (typeof named === "function") return named as new (config: { connectionString: string; max: number; connectionTimeoutMillis: number }) => PgPool;
    const fallback = (loaded as { default?: { Pool?: unknown } }).default?.Pool;
    if (typeof fallback === "function") return fallback as new (config: { connectionString: string; max: number; connectionTimeoutMillis: number }) => PgPool;
  }
  throw new Error("No está el cliente de Postgres.");
}
