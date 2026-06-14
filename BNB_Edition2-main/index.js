require("dotenv").config();
const express = require("express");
const path = require("path");
const connectDB = require("./config/database");
const sessionMiddleware = require("./config/session");
const { attachSession } = require("./middleware/auth");
const routes = require("./routes");

const app = express();
const PORT = process.env.PORT || 8080;

connectDB();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "public/views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(attachSession);

app.use("/", routes);

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
