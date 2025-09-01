import "reflect-metadata";
import { DataSource } from "typeorm";
import { Contact } from "./entity/Contact";
import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var ${name}. Please set it in .env or Render env vars.`);
  }
  return v;
}

const DB_HOST = required("DB_HOST");
const DB_PORT = Number(process.env.DB_PORT ?? "5432");
const DB_USER = required("DB_USER");
const DB_PASS = required("DB_PASS");
const DB_NAME = required("DB_NAME");
// Enable SSL in cloud (Render): set DB_USE_SSL=true in env
const DB_USE_SSL = (process.env.DB_USE_SSL ?? "false").trim().toLowerCase() === "true";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  synchronize: true, // ok for this challenge
  logging: true,
  entities: [Contact],
  // ✅ Important: don't pass `undefined`. Use boolean false when not using SSL.
  ssl: DB_USE_SSL ? { rejectUnauthorized: false } : false,
});
