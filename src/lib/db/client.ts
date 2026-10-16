import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

let connection: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  if (!database) {
    connection = postgres(process.env.DATABASE_URL, { max: 3, connect_timeout: 5, idle_timeout: 20, onnotice: () => {} });
    database = drizzle(connection, { schema });
  }
  return database;
}
export async function closeDatabase() {
  await connection?.end({ timeout: 5 });
  connection = undefined; database = undefined;
}
