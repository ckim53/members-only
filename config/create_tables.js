require("dotenv").config();
const { Client } = require("pg");

const client = new Client({
  connectionString:
    "postgresql://" +
    process.env.DB_USER +
    ":" +
    process.env.DB +
    "@localhost:5432/" +
    process.env.DB_NAME,
});

async function run() {
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        membership BOOLEAN DEFAULT false,
        admin BOOLEAN DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS authors (
        id SERIAL PRIMARY KEY,
        author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE
      );
    `);
    await client.end();
    console.log("Tables created");
  } catch (e) {
    console.error("Migration failed:", e);
  }
}

run();
