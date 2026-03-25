import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const migrationPath = path.join(root, "prisma", "migrations", "202602211520_init", "migration.sql");
const dbPath = path.join(root, "prisma", "dev.db");

const sql = fs.readFileSync(migrationPath, "utf8");
const db = new Database(dbPath);

db.exec(sql);
db.close();

console.log(`Initialized database at ${dbPath}`);
