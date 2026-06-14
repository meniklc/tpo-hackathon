const express = require("express");
const router = express.Router();
const budgetController = require("../controllers/budgetController");
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../services/cloudinaryService");

router.get("/", budgetController.getHome);
router.get("/dashboard", requireAuth, budgetController.getDashboard);
router.get("/budget/new", requireAuth, budgetController.getNewBudget);
router.post("/budget/new", requireAuth, budgetController.postNewBudget);
router.get("/budget/:id", budgetController.getBudgetDetails);
router.get("/budget/:id/edit", requireAuth, budgetController.getEditBudget);
router.post("/budget/:id/edit", requireAuth, budgetController.postEditBudget);
router.get("/budget/:id/departments", requireAuth, budgetController.getDepartments);
router.post("/budget/:id/departments", requireAuth, budgetController.postDepartment);
router.post("/budget/:id/add-expense", requireAuth, upload.single('receipt'), budgetController.addExpense);
router.get("/budget/:id/enhanced", budgetController.getEnhancedBudget);
router.get("/budget/:id/visualization", budgetController.getVisualization);
router.get("/budgets/state/:state", budgetController.getBudgetsByState);
router.get("/budgets/department/:department", budgetController.getBudgetsByDepartment);

module.exports = router;
