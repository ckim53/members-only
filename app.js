const path = require("node:path");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
const flash = require("connect-flash");
const PgSession = require("connect-pg-simple")(session);
const pool = require("./config/pool");
require("dotenv").config();
const { body, validationResult } = require("express-validator");

const app = express();
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(flash());

const sessionStore = new PgSession({
  pool,
  tableName: "session",
  createTableIfMissing: true,
});

app.use(
  session({
    store: sessionStore,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.errorMessages = req.flash("error");
  res.locals.successMessages = req.flash("success");
  next();
});

app.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.title, m.text, m.time, u.username AS author
      FROM messages m
      JOIN authors a ON m.id = a.message_id
      JOIN users u ON a.author_id = u.id`
    );
    const display = req.isAuthenticated()
      ? rows
      : rows.map((m) => ({ title: m.title, text: m.text }));
    res.render("index", { messages: display });
  } catch (err) {
    next(err);
  }
});

app.post("/messages/:id/delete", async (req, res, next) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM messages WHERE id = $1", [id]);
    req.flash("success", "Message deleted.");
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

app.get("/sign-up", (req, res) =>
  res.render("sign-up-form", { errors: {}, data: {} })
);
app.post(
  "/sign-up",
  [
    body("username")
      .trim()
      .escape()
      .isLength({ min: 3 })
      .withMessage("Username must be at least 3 characters")
      .custom(async (value) => {
        const { rows } = await pool.query(
          "SELECT 1 FROM users WHERE username = $1",
          [value]
        );
        if (rows.length > 0) {
          throw new Error("Username is already taken");
        }
        return true;
      }),
    body("password")
      .trim()
      .isLength({ min: 4 })
      .withMessage("Password must be at least 4 characters"),
    body("passwordConfirmation")
      .custom((value, { req }) => value === req.body.password)
      .withMessage("Passwords must match."),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render("sign-up-form", {
        errors: errors.mapped(),
        data: req.body,
      });
    }
    try {
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const isAdmin = req.body.isAdmin === "true";
      await pool.query(
        "INSERT INTO users (username, password, admin) VALUES ($1, $2, $3)",
        [req.body.username, hashedPassword, isAdmin]
      );
      res.render("membership-form", { username: req.body.username, fail: "" });
    } catch (err) {
      return next(err);
    }
  }
);

app.get("membership", (req, res) => {
  res.render("membership-form", { username: req.body.username });
});

app.post("/membership", async (req, res) => {
  if (req.body.membershipSecret == process.env.MEMBERSHIP_PASSCODE) {
    await pool.query(
      "UPDATE users SET membership = true WHERE username LIKE $1",
      [req.body.username]
    );
    res.redirect("/");
  } else {
    res.render("membership-form", { username: req.body.username, fail: true });
  }
});

app.get("/log-out", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE username = $1",
        [username]
      );
      const user = rows[0];

      if (!user) {
        return done(null, false, { message: "Incorrect username" });
      }
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return done(null, false, { message: "Incorrect password" });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

app.get("/new-message", (req, res) => {
  res.render("new-message");
});

app.post("/new-message", async (req, res) => {
  const { title, text } = req.body;
  try {
    await pool.query(
      `WITH new_msg AS (INSERT INTO messages (title, text) 
    VALUES ($1, $2) RETURNING id) 
    INSERT INTO authors (author_id, message_id) 
    VALUES ($3, (SELECT id FROM new_msg));`,
      [title, text, req.user.id]
    );
    res.redirect("/");
  } catch (err) {
    console.error("new-message error:", err);
    req.flash("error", "Could not post message.");
    return res.redirect("/new-message");
  }
});

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [
      id,
    ]);
    if (!rows.length) return done(null, false);
    return done(null, rows[0]);
  } catch (err) {
    return done(err);
  }
});

app.get("/log-in", (req, res) => {
  res.render("log-in");
});

app.post(
  "/log-in",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/log-in",
    failureFlash: true,
  })
);

app.listen(3000, () => console.log("app listening on port 3000!"));
