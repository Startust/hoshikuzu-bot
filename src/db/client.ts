import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

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
