const session = require("express-session");

const sessionConfig = {
  secret: process.env.SESSION_SECRET || "secretkey",
  resave: false,
  saveUninitialized: false,
};

module.exports = session(sessionConfig);
