const express = require("express");
const router = express.Router();

const authRoutes = require("./auth");
const budgetRoutes = require("./budget");
const adminRoutes = require("./admin");
const editorRoutes = require("./editor");
const apiRoutes = require("./api");

router.use("/", authRoutes);
router.use("/", budgetRoutes);
router.use("/admin", adminRoutes);
router.use("/editor", editorRoutes);
router.use("/api", apiRoutes);

module.exports = router;
