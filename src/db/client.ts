import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

if (!process.env.DB_PATH) {
  console.warn('DB_PATH is not set, using default ./data/bot.sqlite');
}

const dbPath = process.env.DB_PATH ?? './data/bot.sqlite';

let dbPromise: ReturnType<typeof open> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
  }
  return dbPromise;
}
