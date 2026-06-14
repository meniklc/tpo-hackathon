const crypto = require("crypto");
const bcrypt = require("bcrypt");
const Budget = require("../models/Budget");
const Department = require("../models/Department");
const Project = require("../models/Project");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const AuditLog = require("../models/AuditLog");
const aiService = require("../services/aiService");
const auditLog = require("../utils/auditLogger");
const { indianStates } = require("../utils/constants");
const homeController = require("./homeController");

exports.getHome = homeController.getHome;

exports.getDashboard = async (req, res) => {
  try {
    const userBudgets = await Budget.find({ creator: req.session.userId }).populate("creator");
    const activeProjects = await Project.countDocuments({ 
      departmentId: { $in: await Department.find({ budgetId: { $in: userBudgets.map(b => b._id) } }).distinct('_id') },
      status: "active" 
    });
    const pendingApprovals = await Transaction.countDocuments({ 
      budgetId: { $in: userBudgets.map(b => b._id) },
      status: "pending" 
    });
    const totalAllocated = userBudgets.reduce((sum, budget) => sum + budget.totalBudget, 0);
    
    const recentActivity = await AuditLog.find({ userId: req.session.userId })
      .sort({ timestamp: -1 })
      .limit(10);
    
    res.render("userDashboard", { 
      title: "My Dashboard", 
      userBudgets,
      activeProjects,
      pendingApprovals,
      totalAllocated,
      recentActivity
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

exports.getNewBudget = (req, res) => {
  res.render("addBudget", {
    title: "Create Budget",
    error: null,
    states: indianStates,
  });
};

exports.postNewBudget = async (req, res) => {
  const {
    name, department, state, city, country, totalBudget, fiscalYear, approvedBy, type,
    vendorNames, vendorEmails, projectType, nationality, collegeName, collegeType
  } = req.body;
  
  let validationError = false;
  let errorMessage = "All fields required";
  
  if (!name || !department || !state || !totalBudget || !fiscalYear || !approvedBy || !type) {
    validationError = true;
  }
  
  if (projectType === 'college' && (!collegeName || !collegeType)) {
    validationError = true;
  }
  
  if (validationError) {
    return res.render("addBudget", {
      title: "Create Budget",
      error: errorMessage,
      states: indianStates,
    });
  }
  
  const editorEmail = `editor_${Date.now()}@bnb.com`;
  const editorPassword = crypto.randomBytes(6).toString("hex");
  
  const hashedPassword = await bcrypt.hash(editorPassword, 10);
  const editorUser = new User({
    name: `Editor for ${name}`,
    email: editorEmail,
    password: hashedPassword,
    role: "editor",
    assignedBudgets: []
  });
  await editorUser.save();
  
  const budget = new Budget({
    name, department, state, city, country,
    projectType: projectType || 'government',
    nationality, collegeName, collegeType,
    totalBudget, fiscalYear, approvedBy, type,
    creator: req.session.userId,
    editorEmail, editorPassword,
    assignedEditors: [editorUser._id],
    expenses: [],
    status: "draft"
  });
  await budget.save();
  
  editorUser.assignedBudgets.push(budget._id);
  await editorUser.save();
  
  if (vendorNames && vendorEmails) {
    const names = vendorNames.split(',').map(name => name.trim());
    const emails = vendorEmails.split(',').map(email => email.trim());
    
    for (let i = 0; i < names.length; i++) {
      if (names[i] && emails[i]) {
        const vendor = new Vendor({
          name: names[i],
          email: emails[i],
          budgetId: budget._id,
          departmentId: null,
          projectId: null
        });
        await vendor.save();
      }
    }
  }
  
  await auditLog("create", "Budget", budget._id, budget.name, req, null, budget.toObject());
  
  res.redirect(`/budget/${budget._id}`);
};

exports.getBudgetDetails = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate("creator")
      .populate("assignedEditors");
    
    if (!budget) return res.status(404).send("Budget not found");
    
    const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    
    const departments = await Department.find({ budgetId: req.params.id });
    
    const actualSpent = transactions.reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
    
    if (budget.spent !== actualSpent) {
      budget.spent = actualSpent;
      budget.remaining = budget.totalBudget - actualSpent;
      await budget.save();
    }
    
    res.render("budgetDetails", { 
      title: budget.name, 
      budget, 
      transactions,
      departments,
      session: req.session 
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

exports.getEditBudget = async (req, res) => {
  const budget = await Budget.findById(req.params.id);
  if (!budget) return res.status(404).send("Budget not found");
  if (req.session.userId != budget.creator.toString()) {
    return res.status(403).send("Unauthorized");
  }
  res.render("editBudget", {
    title: `Edit ${budget.name}`,
    budget,
    error: null,
  });
};

exports.postEditBudget = async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).send("Budget not found");
    if (req.session.userId != budget.creator.toString()) {
      return res.status(403).send("Unauthorized");
    }
    
    const {
      name, department, state, city, totalBudget, fiscalYear, approvedBy, type,
      projectType, status, visibility, priority, additionalBudget, budgetReason,
      collegeName, collegeType, editorEmail, editorPassword
    } = req.body;
    
    const oldData = budget.toObject();
    
    budget.name = name;
    budget.department = department;
    budget.state = state;
    budget.city = city;
    budget.fiscalYear = fiscalYear;
    budget.approvedBy = approvedBy;
    budget.type = type;
    budget.projectType = projectType;
    budget.status = status;
    
    if (additionalBudget && parseFloat(additionalBudget) > 0) {
      const additionalAmount = parseFloat(additionalBudget);
      budget.totalBudget += additionalAmount;
      budget.remaining = budget.totalBudget - budget.spent;
      
      await auditLog("budget_increase", "Budget", budget._id, budget.name, req, 
        { oldBudget: oldData.totalBudget }, 
        { newBudget: budget.totalBudget, reason: budgetReason, additionalAmount });
    } else {
      const newTotalBudget = parseFloat(totalBudget);
      if (newTotalBudget !== budget.totalBudget) {
        budget.totalBudget = newTotalBudget;
        budget.remaining = budget.totalBudget - budget.spent;
      }
    }
    
    if (projectType === 'college') {
      budget.collegeName = collegeName;
      budget.collegeType = collegeType;
    }
    
    if (editorEmail && editorPassword) {
      budget.editorEmail = editorEmail;
      budget.editorPassword = editorPassword;
    }
    
    await budget.save();
    await auditLog("edit", "Budget", budget._id, budget.name, req, oldData, budget.toObject());
    
    res.redirect(`/budget/${budget._id}?success=Budget updated successfully`);
  } catch (error) {
    console.error('Error updating budget:', error);
    res.render("editBudget", {
      title: `Edit ${budget.name}`,
      budget,
      error: "Failed to update budget. Please try again."
    });
  }
};

exports.getDepartments = async (req, res) => {
  const budget = await Budget.findById(req.params.id);
  if (!budget) return res.status(404).send("Budget not found");
  if (req.session.userId != budget.creator.toString() && !req.session.isAdmin) {
    return res.status(403).send("Unauthorized");
  }
  
  const departments = await Department.find({ budgetId: req.params.id });
  res.render("departments", { title: "Departments", budget, departments });
};

exports.postDepartment = async (req, res) => {
  const { name, budget } = req.body;
  
  try {
    const parentBudget = await Budget.findById(req.params.id);
    if (!parentBudget) return res.status(404).send("Budget not found");
    
    const existingDepartments = await Department.find({ budgetId: req.params.id });
    const totalAllocated = existingDepartments.reduce((sum, dept) => sum + (dept.budget || 0), 0);
    const requestedAmount = parseFloat(budget);
    
    if (totalAllocated + requestedAmount > parentBudget.totalBudget) {
      const availableAmount = parentBudget.totalBudget - totalAllocated;
      return res.status(400).send(`Budget exceeded! You can only allocate ₹${availableAmount.toLocaleString()} more.`);
    }
  
    const department = new Department({
      name,
      budget: requestedAmount,
      budgetId: req.params.id,
      createdBy: req.session.userId
    });
    await department.save();
    
    await auditLog("create", "Department", department._id, department.name, req, null, department.toObject());
    
    res.redirect(`/budget/${req.params.id}/departments`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

exports.addExpense = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const user = await User.findById(req.session.userId);
    const isCreator = budget.creator.toString() === req.session.userId;
    const isAssignedEditor = budget.assignedEditors.some(editor => 
      typeof editor === 'string' ? editor === req.session.userId : editor.toString() === req.session.userId
    );
    const hasPermission = req.session.isAdmin || user.role === 'editor' || isCreator || isAssignedEditor;
    
    if (!hasPermission) {
      return res.status(403).json({ error: "No permission to add expenses to this budget" });
    }
    
    const { description, amount, category, vendor, notes } = req.body;
    
    if (!description || !amount) {
      return res.status(400).json({ error: "Description and amount are required" });
    }
    
    let receiptData = {};
    if (req.file) {
      const cloudinaryService = require("../services/cloudinaryService").cloudinaryService;
      const uploadResult = await cloudinaryService.uploadReceipt(req.file, Date.now());
      if (uploadResult.success) {
        receiptData = {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          filename: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          uploadedAt: new Date()
        };
      }
    }
    
    const expense = {
      description,
      amount: parseFloat(amount),
      category: category || 'other',
      vendor: vendor || '',
      notes: notes || '',
      receipt: receiptData,
      addedBy: req.session.userId,
      addedAt: new Date()
    };
    
    budget.expenses.push(expense);
    budget.spent += expense.amount;
    budget.remaining = budget.totalBudget - budget.spent;
    
    await budget.save();
    await auditLog("add_expense", "Budget", budget._id, budget.name, req, null, expense);
    
    res.json({ 
      success: true, 
      message: "Expense added successfully",
      expense: expense
    });
  } catch (error) {
    console.error('Error adding expense:', error);
    res.status(500).json({ error: "Failed to add expense" });
  }
};

exports.getEnhancedBudget = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate("creator")
      .populate({
        path: 'departments',
        populate: {
          path: 'projects',
          populate: { path: 'vendors' }
        }
      });
    
    if (!budget) return res.status(404).send("Budget not found");
    
    const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    
    const budgetContext = {
      name: budget.name,
      department: budget.department,
      state: budget.state,
      city: budget.city,
      country: budget.country,
      totalBudget: budget.totalBudget,
      spent: budget.spent,
      remaining: budget.remaining,
      fiscalYear: budget.fiscalYear,
      approvedBy: budget.approvedBy,
      type: budget.type,
      status: budget.status,
      expenses: budget.expenses,
      departments: budget.departments,
      transactions: transactions.map(t => ({
        description: t.description,
        amount: t.amount,
        category: t.category,
        status: t.status,
        date: t.createdAt,
        receipt: t.receipt ? 'Yes' : 'No'
      }))
    };
    
    const [summary, faq, sankeyData] = await Promise.all([
      aiService.generateBudgetSummary(budget, budgetContext),
      aiService.generateFAQ(budget, budgetContext),
      aiService.generateSankeyData(budget, budgetContext)
    ]);
    
    res.render("enhancedBudgetDetails", { 
      title: budget.name, 
      budget, 
      transactions,
      summary, 
      faq, 
      sankeyData,
      budgetContext: JSON.stringify(budgetContext)
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

exports.getVisualization = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).send("Budget not found");
    
    res.render("budgetVisualization", {
      title: `Visualization - ${budget.name}`,
      budget
    });
  } catch (error) {
    console.error("Error loading visualization:", error);
    res.status(500).send("Server Error");
  }
};

exports.getBudgetsByState = async (req, res) => {
  try {
    const state = req.params.state;
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    
    const query = { 
      type: "Public", 
      state: { $regex: state, $options: "i" } 
    };
    
    const totalBudgets = await Budget.countDocuments(query);
    const totalPages = Math.ceil(totalBudgets / limit);
    const budgets = await Budget.find(query)
      .populate("creator")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.render("stateBudgets", {
      title: `Budgets in ${state}`,
      budgets,
      state,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalBudgets: totalBudgets,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
      }
    });
  } catch (error) {
    console.error('Error fetching state budgets:', error);
    res.status(500).send("Server Error");
  }
};

exports.getBudgetsByDepartment = async (req, res) => {
  try {
    const department = req.params.department;
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    
    const query = { 
      type: "Public", 
      department: { $regex: department, $options: "i" } 
    };
    
    const totalBudgets = await Budget.countDocuments(query);
    const totalPages = Math.ceil(totalBudgets / limit);
    const budgets = await Budget.find(query)
      .populate("creator")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.render("departmentBudgets", {
      title: `${department} Department Budgets`,
      budgets,
      department,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalBudgets: totalBudgets,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page + 1,
        prevPage: page - 1
      }
    });
  } catch (error) {
    console.error('Error fetching department budgets:', error);
    res.status(500).send("Server Error");
  }
};
