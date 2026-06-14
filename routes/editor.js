const express = require("express");
const router = express.Router();
const editorController = require("../controllers/editorController");
const { requireEditor } = require("../middleware/auth");
const { upload } = require("../services/cloudinaryService");

router.use(requireEditor);

router.get("/dashboard", editorController.getDashboard);
router.get("/budget/:id", editorController.getBudgetDetails);
router.get("/budget/:id/transactions", editorController.getBudgetTransactions);
router.get("/transaction/new", editorController.getNewTransaction);
router.post("/transaction/new", upload.single('receipt'), editorController.postNewTransaction);
router.get("/transactions/pending", editorController.getPendingTransactions);
router.get("/receipts/upload", editorController.getReceiptUpload);
router.post("/receipts/upload", upload.single('receipt'), editorController.postReceiptUpload);

module.exports = router;
