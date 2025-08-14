require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  user: "christinakim",
  host: "localhost",
  database: "clubhouse",
  password: "0805",
  port: 5432,
});

module.exports = {
  pool,
}