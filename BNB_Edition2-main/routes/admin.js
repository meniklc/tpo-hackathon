const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { requireAdmin } = require("../middleware/auth");
const { upload } = require("../services/cloudinaryService");

router.use(requireAdmin);

router.get("/dashboard", adminController.getDashboard);
router.get("/transactions/pending", adminController.getPendingTransactions);
router.post("/budget/:id/status", adminController.updateBudgetStatus);
router.post("/transaction/new", upload.single('receipt'), adminController.createTransaction);
router.get("/editors", adminController.getEditors);
router.get("/editors/new", adminController.getNewEditor);
router.post("/editors/new", adminController.postNewEditor);
router.post("/editors/generate-multiple", adminController.generateMultipleEditors);

module.exports = router;
