import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

function resolveDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl?.startsWith("file:")) {
    throw new Error('DATABASE_URL must use SQLite file syntax, for example: file:./dev.db');
  }

  const relativePath = databaseUrl.slice("file:".length);
  const schemaDirectory = path.join(process.cwd(), "prisma");
  return path.resolve(schemaDirectory, relativePath);
}

async function main() {
  const migrationsDirectory = path.join(process.cwd(), "prisma", "migrations");
  const databasePath = resolveDatabasePath();

  await mkdir(path.dirname(databasePath), { recursive: true });

  const bootstrap = spawnSync(
    "sqlite3",
    [databasePath],
    {
      input: `
        CREATE TABLE IF NOT EXISTS "_sql_migrations" (
          "name" TEXT NOT NULL PRIMARY KEY,
          "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `,
      encoding: "utf8",
    },
  );

  if (bootstrap.status !== 0) {
    throw new Error(bootstrap.stderr || "Failed to initialize _sql_migrations table.");
  }

  const applied = spawnSync("sqlite3", [databasePath, 'SELECT "name" FROM "_sql_migrations" ORDER BY "name";'], {
    encoding: "utf8",
  });

  if (applied.status !== 0) {
    throw new Error(applied.stderr || "Failed to read applied migrations.");
  }

  const appliedNames = new Set(
    applied.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

  const existingTablesResult = spawnSync(
    "sqlite3",
    [
      databasePath,
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Paper', 'Tag', 'PaperTag') ORDER BY name;",
    ],
    { encoding: "utf8" },
  );

  if (existingTablesResult.status !== 0) {
    throw new Error(existingTablesResult.stderr || "Failed to inspect existing tables.");
  }

  const existingTables = new Set(
    existingTablesResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

  if (
    !appliedNames.has("0001_init") &&
    existingTables.has("Paper") &&
    existingTables.has("Tag") &&
    existingTables.has("PaperTag")
  ) {
    const markInitial = spawnSync(
      "sqlite3",
      [databasePath, `INSERT OR IGNORE INTO "_sql_migrations" ("name") VALUES ('0001_init');`],
      { encoding: "utf8" },
    );

    if (markInitial.status !== 0) {
      throw new Error(markInitial.stderr || "Failed to mark 0001_init as applied.");
    }

    appliedNames.add("0001_init");
  }

  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isDirectory() && entry.name !== ".DS_Store")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const migrationName of migrationNames) {
    if (appliedNames.has(migrationName)) {
      continue;
    }

    const sqlPath = path.join(migrationsDirectory, migrationName, "migration.sql");
    const sql = await readFile(sqlPath, "utf8");
    const wrappedSql = `BEGIN;\n${sql}\nINSERT INTO "_sql_migrations" ("name") VALUES ('${migrationName}');\nCOMMIT;\n`;
    const result = spawnSync("sqlite3", [databasePath], {
      input: wrappedSql,
      encoding: "utf8",
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || `Failed to apply migration ${migrationName}.`);
    }

    console.log(`Applied migration ${migrationName}`);
  }

  console.log(`SQLite migrations are up to date at ${databasePath}`);
}

main().catch((error) => {
  console.error("SQL migration apply failed", error);
  process.exitCode = 1;
});
