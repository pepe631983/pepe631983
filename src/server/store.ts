import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { emptySlice, ensureSeed, type Slice } from "./book";

type Holder = { slices: Record<string, Slice> };

const locks = new Map<string, Promise<void>>();
let memoryOnly = process.env.OLEAJE_BOOK === "memory" || process.env.VITEST === "true";
const memory: Holder = { slices: {} };

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
    if (process.env.DATABASE_URL && !memoryOnly) return await updatePostgres(key, change);
    return await updateFile(key, change);
  } finally {
    release();
  }
}

export async function readSlice(stage: string): Promise<Slice> {
  const key = stage === "preview" ? "preview" : "production";
  if (memoryOnly) return ensureSeed(memory.slices[key] ?? emptySlice());
  if (process.env.DATABASE_URL) {
    const loaded = await loadPostgres(key);
    return ensureSeed(loaded);
  }
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
    const raw = await readFile(bookPath(), "utf8");
    const parsed = JSON.parse(raw) as Holder;
    if (!parsed || typeof parsed !== "object" || !parsed.slices) return { slices: {} };
    return parsed;
  } catch {
    return { slices: {} };
  }
}

async function saveFile(holder: Holder): Promise<void> {
  const file = bookPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(holder));
}

function bookPath(): string {
  return path.join(process.cwd(), "data", "oleaje-book.json");
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
  poolPromise ??= import("pg").then(({ default: pg }) => {
    const created = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    return created as unknown as PgPool;
  });
  return poolPromise;
}
