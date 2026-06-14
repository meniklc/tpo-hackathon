require("dotenv").config();
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const User = require("./models/User");
const Budget = require("./models/Budget");
const Department = require("./models/Department");
const Project = require("./models/Project");
const Vendor = require("./models/Vendor");
const Transaction = require("./models/Transaction");
const AuditLog = require("./models/AuditLog");
const Editor = require("./models/Editor");
const Anomaly = require("./models/Anomaly");
const Feedback = require("./models/Feedback");
const aiService = require("./services/aiService");
const visualizationService = require("./services/visualizationService");
const { cloudinaryService, upload } = require("./services/cloudinaryService");
const ocrService = require("./services/ocrService");
const anomalyService = require("./services/anomalyService");
const blockchainService = require("./services/blockchainService");
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 8080;

mongoose
  .connect(process.env.MONGO_URI, { dbName: "bnb-fund-management" })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "public/views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secretkey",
    resave: false,
    saveUninitialized: false,
  })
);

const indianStates = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
  "Chandigarh",
  "Daman and Diu",
  "Dadra and Nagar Haveli",
  "Lakshadweep",
  "Andaman and Nicobar Islands",
];

const auditLog = async (action, entityType, entityId, entityName, req, oldData = null, newData = null) => {
  try {
    if (req.session.userId) {
      const user = await User.findById(req.session.userId);
      const audit = new AuditLog({
        action,
        entityType,
        entityId,
        entityName,
        userId: req.session.userId,
        userName: user.name,
        oldData,
        newData,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      await audit.save();
    }
  } catch (error) {
    console.error('Audit logging error:', error);
  }
};

app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

app.get("/", async (req, res) => {
  try {
    
    const query = { type: "Public" };
    const searchQuery = req.query.q || "";
    const department = req.query.department || "";
    const status = req.query.status || "";
    const userState = req.query.state || "";
    const userCity = req.query.city || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 8;     const skip = (page - 1) * limit;

    const searchConditions = [];
    
    if (status) {
      searchConditions.push({ status: { $regex: status, $options: "i" } });
    }
    
    if (searchQuery) {
            const searchTerms = searchQuery.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      const fuzzyConditions = [];
      
      searchTerms.forEach(term => {
                const variations = [term];
        
                if (term.length > 3) {
                    for (let i = 0; i < term.length; i++) {
            const variation = term.slice(0, i) + '.' + term.slice(i + 1);
            variations.push(variation);
          }
        }
        
        const termConditions = variations.map(variation => ({
        $or: [
            { name: { $regex: variation, $options: "i" } },
            { department: { $regex: variation, $options: "i" } },
            { state: { $regex: variation, $options: "i" } },
            { city: { $regex: variation, $options: "i" } },
            { description: { $regex: variation, $options: "i" } }
          ]
        }));
        
        fuzzyConditions.push({ $or: termConditions });
      });
      
      if (fuzzyConditions.length > 0) {
        searchConditions.push({ $and: fuzzyConditions });
      }
    }
    
    if (department) {
      searchConditions.push({ department: { $regex: department, $options: "i" } });
    }
    
    if (userState) {
      searchConditions.push({ state: { $regex: userState, $options: "i" } });
    }
    
    if (userCity) {
      searchConditions.push({ city: { $regex: userCity, $options: "i" } });
    }

    if (searchConditions.length > 0) {
      query.$and = searchConditions;
    }

        const totalBudgets = await Budget.countDocuments(query);
    const totalPages = Math.ceil(totalBudgets / limit);

    const budgets = await Budget.find(query).populate("creator").sort({ createdAt: -1 }).skip(skip).limit(limit);
    
    for (let budget of budgets) {
      if (!budget.aiSummary && budget.status === 'approved') {
        try {
          const summary = await aiService.generateBudgetSummary(budget);
          if (summary && summary.headline) {
            budget.aiSummary = summary.headline + " " + summary.bullets.join(" ");
            await budget.save();
          }
        } catch (error) {
          console.error('Error generating AI summary:', error);
        }
      }
    }
    
    const departments = await Budget.distinct("department", { type: "Public" });
    const states = indianStates;
    const cities = await Budget.distinct("city", { type: "Public" });
    
        const budgetsWithTransactions = await Promise.all(budgets.map(async (budget) => {
      const budgetTransactions = await Transaction.find({ budgetId: budget._id })
        .sort({ createdAt: -1 })
        .limit(3);
      
      return {
        ...budget.toObject(),
        recentTransactions: budgetTransactions
      };
    }));
    
    res.render("home", {
      title: "BNB Fund Management",
      budgets: budgetsWithTransactions,
      departments,
      states,
      cities,
      searchQuery,
      department,
      status,
      userState,
      userCity,
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
  } catch (err) {
    console.log(err);
    res.status(500).send("Server Error");
  }
});


app.get("/login", (req, res) =>
  res.render("login", { title: "Login", error: null })
);
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (user && (await bcrypt.compare(password, user.password))) {
    req.session.userId = user._id;
    req.session.isAdmin = user.isAdmin || user.role === "admin";
    req.session.userRole = user.role;
    req.session.userName = user.name;
    
    await auditLog("login", "User", user._id, user.name, req);
    
    if (user.role === "admin" || user.isAdmin) return res.redirect("/admin/dashboard");
    if (user.role === "editor") return res.redirect("/editor/dashboard");
    if (user.role === "manager") return res.redirect("/dashboard");
    return res.redirect("/");
  }
  res.render("login", { title: "Login", error: "Invalid credentials" });
});

app.get("/register", (req, res) =>
  res.render("register", { title: "Register", error: null })
);
app.post("/register", async (req, res) => {
  const { name, email, password, confirmPassword, role } = req.body;
  if (password !== confirmPassword)
    return res.render("register", {
      title: "Register",
      error: "Passwords do not match",
    });
  if (await User.findOne({ email }))
    return res.render("register", {
      title: "Register",
      error: "Email already exists",
    });
  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ 
    name, 
    email, 
    password: hashed, 
    role: role || "public",
    isAdmin: role === "admin"
  });
  await user.save();
  req.session.userId = user._id;
  req.session.isAdmin = user.isAdmin;
  req.session.userRole = user.role;
  req.session.userName = user.name;
  
  await auditLog("register", "User", user._id, user.name, req);
  
  if (user.role === "admin" || user.isAdmin) return res.redirect("/admin/dashboard");
  if (user.role === "manager") return res.redirect("/dashboard");
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

app.get("/budget/new", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.render("addBudget", {
    title: "Create Budget",
    error: null,
    states: indianStates,
  });
});

app.get("/admin/editors", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const editors = await Editor.find({ isActive: true })
      .populate('assignedBudgets')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.render("editorManagement", {
      title: "Editor Management",
      editors
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.get("/admin/editors/new", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
        const budgets = await Budget.find({}).populate('departments');
    const departments = await Department.find({});
  
  res.render("createEditor", {
    title: "Create New Editor",
      error: null,
      budgets,
      departments
    });
  } catch (error) {
    console.error(error);
    res.render("createEditor", {
      title: "Create New Editor",
      error: "Failed to load data"
    });
  }
});

app.post("/admin/editors/new", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const { name, email, password, role, permissions, assignedDepartments } = req.body;
    
    const existingEditor = await Editor.findOne({ email });
    if (existingEditor) {
      const budgets = await Budget.find({}).populate('departments');
      const departments = await Department.find({});
      return res.render("createEditor", {
        title: "Create New Editor",
        error: "Editor with this email already exists",
        budgets,
        departments
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const editor = new Editor({
      name,
      email,
      password: hashedPassword,
      role: role || 'editor',
      permissions: permissions || {
        canCreateTransactions: true,
        canUploadReceipts: true,
        canEditBudgets: false,
        canApproveTransactions: false
      },
      assignedDepartments: assignedDepartments || [],
      createdBy: req.session.userId
    });
    
    await editor.save();
    
        const user = new User({
      name,
      email,
      password: hashedPassword,
      role: 'editor',
      assignedBudgets: [],       assignedDepartments: assignedDepartments || []
    });
    
    await user.save();
    
        editor.userId = user._id;
    await editor.save();
    
    await auditLog("create", "Editor", editor._id, editor.name, req, null, editor.toObject());
    
    res.redirect("/admin/editors");
  } catch (error) {
    console.error(error);
    const budgets = await Budget.find({}).populate('departments');
    const departments = await Department.find({});
    res.render("createEditor", {
      title: "Create New Editor",
      error: "Failed to create editor",
      budgets,
      departments
    });
  }
});

app.post("/admin/editors/generate-multiple", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const { budgetId, departmentCount } = req.body;
    const budget = await Budget.findById(budgetId).populate('departments');
    
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    const editors = [];
    const users = [];
    
        for (let i = 1; i <= departmentCount; i++) {
      const editorName = `Editor ${i}`;
      const editorEmail = `editor${i}_${Date.now()}@bnb.com`;
      const editorPassword = Math.random().toString(36).slice(-8);
      
      const hashedPassword = await bcrypt.hash(editorPassword, 10);
      
            const editor = new Editor({
        name: editorName,
        email: editorEmail,
        password: hashedPassword,
        role: 'editor',
        permissions: {
          canCreateTransactions: true,
          canUploadReceipts: true,
          canEditBudgets: false,
          canApproveTransactions: false
        },
        assignedDepartments: budget.departments.slice(i-1, i).map(d => d._id),
        createdBy: req.session.userId
      });
      
      await editor.save();
      
            const user = new User({
        name: editorName,
        email: editorEmail,
        password: hashedPassword,
        role: 'editor',
        assignedBudgets: [budgetId],
        assignedDepartments: budget.departments.slice(i-1, i).map(d => d._id)
      });
      
      await user.save();
      
            editor.userId = user._id;
      await editor.save();
      
      editors.push({
        name: editorName,
        email: editorEmail,
        password: editorPassword,
        department: budget.departments[i-1]?.name || 'General'
      });
      
      await auditLog("create", "Editor", editor._id, editor.name, req, null, editor.toObject());
    }
    
    res.json({
      success: true,
      message: `Generated ${editors.length} editors successfully`,
      editors
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate editors" });
  }
});

app.post("/budget/:id/assign-editor", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const { editorId } = req.body;
    const budget = await Budget.findById(req.params.id);
    const editor = await Editor.findById(editorId);
    
    if (!budget || !editor) {
      return res.status(404).json({ error: "Budget or Editor not found" });
    }
    
    if (!budget.assignedEditors.includes(editorId)) {
      budget.assignedEditors.push(editorId);
      await budget.save();
    }
    
    if (!editor.assignedBudgets.includes(req.params.id)) {
      editor.assignedBudgets.push(req.params.id);
      await editor.save();
    }
    
    await auditLog("assign", "Budget", budget._id, budget.name, req, null, { editorId, editorName: editor.name });
    
    res.json({ success: true, message: "Editor assigned successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to assign editor" });
  }
});
app.post("/budget/new", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const {
    name,
    department,
    state,
    city,
    country,
    totalBudget,
    fiscalYear,
    approvedBy,
    type,
    vendorNames,
    vendorEmails,
    projectType,
    nationality,
    collegeName,
    collegeType
  } = req.body;
  
    let validationError = false;
  let errorMessage = "All fields required";
  
  if (!name || !department || !state || !totalBudget || !fiscalYear || !approvedBy || !type) {
    validationError = true;
  }
  
  if (projectType === 'government') {
          } else if (projectType === 'college') {
    if (!collegeName || !collegeType) {
      validationError = true;
    }
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
    name,
    department,
    state,
    city,
    country,
    projectType: projectType || 'government',
    nationality,
    collegeName,
    collegeType,
    totalBudget,
    fiscalYear,
    approvedBy,
    type,
    creator: req.session.userId,
    editorEmail,
    editorPassword,
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
});

app.get("/budget/:id", async (req, res) => {
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
    
        const actualSpent = transactions.reduce((sum, transaction) => {
      return sum + (transaction.amount || 0);
    }, 0);
    
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
});

app.get("/budget/:id/edit", async (req, res) => {
  const budget = await Budget.findById(req.params.id);
  if (!budget) return res.status(404).send("Budget not found");
  if (req.session.userId != budget.creator.toString())
    return res.status(403).send("Unauthorized");
  res.render("editBudget", {
    title: `Edit ${budget.name}`,
    budget,
    error: null,
  });
});
app.post("/budget/:id/edit", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).send("Budget not found");
    if (req.session.userId != budget.creator.toString())
      return res.status(403).send("Unauthorized");
    
    const {
      name,
      department,
      state,
      city,
      totalBudget,
      fiscalYear,
      approvedBy,
      type,
      projectType,
      status,
      visibility,
      priority,
      additionalBudget,
      budgetReason,
      collegeName,
      collegeType,
      editorEmail,
      editorPassword
    } = req.body;
    
    // Store old values for audit log
    const oldData = budget.toObject();
    
    // Update basic information
    budget.name = name;
    budget.department = department;
    budget.state = state;
    budget.city = city;
    budget.fiscalYear = fiscalYear;
    budget.approvedBy = approvedBy;
    budget.type = type;
    budget.projectType = projectType;
    budget.status = status;
    
    // Handle additional budget allocation
    if (additionalBudget && parseFloat(additionalBudget) > 0) {
      const additionalAmount = parseFloat(additionalBudget);
      budget.totalBudget += additionalAmount;
      budget.remaining = budget.totalBudget - budget.spent;
      
      // Log budget change
      await auditLog("budget_increase", "Budget", budget._id, budget.name, req, 
        { oldBudget: oldData.totalBudget }, 
        { newBudget: budget.totalBudget, reason: budgetReason, additionalAmount });
    } else {
      // Update total budget if changed
      const newTotalBudget = parseFloat(totalBudget);
      if (newTotalBudget !== budget.totalBudget) {
        budget.totalBudget = newTotalBudget;
        budget.remaining = budget.totalBudget - budget.spent;
      }
    }
    
    // Update college information if applicable
    if (projectType === 'college') {
      budget.collegeName = collegeName;
      budget.collegeType = collegeType;
    }
    
    // Update editor credentials if provided
    if (editorEmail && editorPassword) {
      budget.editorEmail = editorEmail;
      budget.editorPassword = editorPassword;
    }
    
    await budget.save();
    
    // Log the edit action
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
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  
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
});

app.get("/admin/dashboard", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Unauthorized");
  
  try {
    // Get only admin's own budgets
    const budgets = await Budget.find({ creator: req.session.userId })
      .populate("creator")
      .populate("assignedEditors")
      .sort({ createdAt: -1 });
    
    // Get budget IDs for filtering
    const budgetIds = budgets.map(b => b._id);
    
    // Get editor stats for editors assigned to admin's budgets
    const editorStats = await User.aggregate([
      { 
        $match: { 
          role: "editor",
          assignedBudgets: { $in: budgetIds }
        } 
      },
      {
        $group: {
          _id: null,
          totalEditors: { $sum: 1 },
          activeEditors: { $sum: { $cond: [{ $ne: ["$assignedBudgets", []] }, 1, 0] } }
        }
      }
    ]);
    
    // Get recent transactions only for admin's budgets
    const recentTransactions = await Transaction.find({ budgetId: { $in: budgetIds } })
      .populate('createdBy', 'name email')
      .populate('budgetId', 'name department')
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get total transactions count for admin's budgets only
    const totalTransactions = await Transaction.countDocuments({ budgetId: { $in: budgetIds } });
    
    const stats = editorStats[0] || { totalEditors: 0, activeEditors: 0 };
    stats.totalTransactions = totalTransactions;
    
    res.render("adminDashboard", { 
      title: "Admin Dashboard", 
      budgets,
      stats,
      recentTransactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.get("/admin/transactions/pending", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const pendingTransactions = await Transaction.find({ status: 'pending' })
      .populate('createdBy', 'name email')
      .populate('budgetId', 'name department')
      .sort({ createdAt: -1 });
    
    res.render("adminPendingTransactions", {
      title: "Pending Transactions - Admin",
      transactions: pendingTransactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.post("/admin/budget/:id/status", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  try {
    const { status } = req.body;
    const validStatuses = ["draft", "pending", "approved", "rejected", "ongoing", "finished"];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    
    const budget = await Budget.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    res.json({ success: true, status: budget.status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

app.post("/admin/transaction/new", upload.single('receipt'), async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ success: false, error: "Admin access required" });
  }
  
  try {
    const { description, amount, budgetId, notes, category, vendor } = req.body;
    
    if (!description || !amount || !budgetId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    
        const budget = await Budget.findById(budgetId);
    if (!budget) {
      return res.status(404).json({ success: false, error: "Budget not found" });
    }
    
    let receiptData = {};
    if (req.file) {
      try {
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
        } else {
          console.error('Cloudinary upload failed:', uploadResult.error);
                  }
      } catch (uploadError) {
        console.error('Receipt upload error:', uploadError);
              }
    }
    
    const transaction = new Transaction({
      description,
      amount: parseFloat(amount),
      budgetId,
      notes,
      category,
      receipt: receiptData,
      createdBy: req.session.userId,
      status: 'approved'     });
    
    await transaction.save();
    
        budget.spent += parseFloat(amount);
    budget.remaining = budget.totalBudget - budget.spent;
    await budget.save();
    
        try {
      const blockchainResult = await blockchainService.storeTransaction(transaction);
      if (blockchainResult.success) {
        transaction.blockchainId = blockchainResult.transactionId;
        transaction.blockHash = blockchainResult.blockHash;
        transaction.blockIndex = blockchainResult.blockIndex;
        await transaction.save();
        console.log('Transaction stored in blockchain:', blockchainResult.transactionId);
      }
    } catch (blockchainError) {
      console.error('Blockchain storage error:', blockchainError);
          }
    
    await auditLog("create", "Transaction", transaction._id, transaction.description, req, null, transaction.toObject());
    
    res.json({ success: true, transactionId: transaction._id });
  } catch (error) {
    console.error('Error creating admin transaction:', error);
    res.status(500).json({ success: false, error: "Server Error" });
  }
});

app.get("/api/budget/:id/charts/spending", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const data = {
      type: 'doughnut',
      data: {
        labels: ['Spent', 'Remaining'],
        datasets: [{
          data: [budget.spent, budget.remaining],
          backgroundColor: ['#ef4444', '#10b981'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    };

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

app.get("/api/budget/:id/charts/departments", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    let labels = ['General Operations'];
    let data = [budget.totalBudget];

    if (budget.departments && budget.departments.length > 0) {
      labels = budget.departments.map(dept => dept.name);
      data = budget.departments.map(dept => dept.allocatedBudget || 0);
    }

    const chartData = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Allocated Budget',
          data: data,
          backgroundColor: '#3b82f6',
          borderColor: '#1d4ed8',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    };

    res.json(chartData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

app.get("/api/budget/:id/charts/timeline", async (req, res) => {
  try {
    const transactions = await Transaction.find({ budgetId: req.params.id })
      .sort({ createdAt: 1 });

        const monthlyData = {};
    transactions.forEach(transaction => {
      const month = new Date(transaction.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!monthlyData[month]) {
        monthlyData[month] = 0;
      }
      monthlyData[month] += transaction.amount;
    });

    const labels = Object.keys(monthlyData);
    const data = Object.values(monthlyData);

    const chartData = {
      type: 'line',
      data: {
        labels: labels.length > 0 ? labels : ['No Data'],
        datasets: [{
          label: 'Monthly Spending',
          data: data.length > 0 ? data : [0],
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    };

    res.json(chartData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

app.get("/api/budget/:id/sankey", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const transactions = await Transaction.find({ budgetId: req.params.id });
    
    const budgetContext = {
      transactions: transactions.map(t => ({
        description: t.description,
        amount: t.amount,
        category: t.category || 'General'
      }))
    };

    const sankeyData = await aiService.generateSankeyData(budget, budgetContext);
    res.json(sankeyData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

app.get("/budget/:id/departments", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const budget = await Budget.findById(req.params.id);
  if (!budget) return res.status(404).send("Budget not found");
  if (req.session.userId != budget.creator.toString() && !req.session.isAdmin)
    return res.status(403).send("Unauthorized");
  
  const departments = await Department.find({ budgetId: req.params.id });
  res.render("departments", { title: "Departments", budget, departments });
});

app.post("/budget/:id/departments", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const { name, budget } = req.body;
  
  try {
        const parentBudget = await Budget.findById(req.params.id);
    if (!parentBudget) return res.status(404).send("Budget not found");
    
        const existingDepartments = await Department.find({ budgetId: req.params.id });
    const totalAllocated = existingDepartments.reduce((sum, dept) => sum + (dept.budget || 0), 0);
    const requestedAmount = parseFloat(budget);
    
        if (totalAllocated + requestedAmount > parentBudget.totalBudget) {
      const availableAmount = parentBudget.totalBudget - totalAllocated;
      return res.status(400).send(`Budget exceeded! You can only allocate ₹${availableAmount.toLocaleString()} more. Current allocation: ₹${totalAllocated.toLocaleString()}, Total budget: ₹${parentBudget.totalBudget.toLocaleString()}`);
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
});

app.get("/department/:id/projects", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const department = await Department.findById(req.params.id).populate("budgetId");
  if (!department) return res.status(404).send("Department not found");
  
  const projects = await Project.find({ departmentId: req.params.id });
  res.render("projects", { title: "Projects", department, projects });
});

app.post("/department/:id/projects", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const { name, description, budget, startDate, endDate } = req.body;
  
  const project = new Project({
    name,
    description,
    budget: parseFloat(budget),
    departmentId: req.params.id,
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    createdBy: req.session.userId
  });
  await project.save();
  
  await auditLog("create", "Project", project._id, project.name, req, null, project.toObject());
  
  res.redirect(`/department/${req.params.id}/projects`);
});

app.get("/project/:id/vendors", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const project = await Project.findById(req.params.id).populate("departmentId");
  if (!project) return res.status(404).send("Project not found");
  
  const vendors = await Vendor.find({ projectId: req.params.id });
  res.render("vendors", { title: "Vendors", project, vendors });
});

app.post("/project/:id/vendors", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const { name, contactPerson, email, phone, address, allocatedAmount } = req.body;
  
  const vendor = new Vendor({
    name,
    contactPerson,
    email,
    phone,
    address,
    allocatedAmount: parseFloat(allocatedAmount),
    projectId: req.params.id,
    createdBy: req.session.userId
  });
  await vendor.save();
  
  await auditLog("create", "Vendor", vendor._id, vendor.name, req, null, vendor.toObject());
  
  res.redirect(`/project/${req.params.id}/vendors`);
});

app.get("/vendor/:id/transactions", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const vendor = await Vendor.findById(req.params.id).populate("projectId");
  if (!vendor) return res.status(404).send("Vendor not found");
  
  const transactions = await Transaction.find({ vendorId: req.params.id });
  res.render("transactions", { title: "Transactions", vendor, transactions });
});

app.post("/vendor/:id/transactions", async (req, res) => {
  if (!req.session.userId) return res.status(403).send("Login required");
  const { description, amount, notes } = req.body;
  
  const vendor = await Vendor.findById(req.params.id).populate("projectId");
  const project = await Project.findById(vendor.projectId._id).populate("departmentId");
  
  const transaction = new Transaction({
    description,
    amount: parseFloat(amount),
    vendorId: req.params.id,
    projectId: vendor.projectId._id,
    departmentId: project.departmentId._id,
    budgetId: project.departmentId.budgetId,
    notes,
    createdBy: req.session.userId
  });
  await transaction.save();
  
    const budget = await Budget.findById(project.departmentId.budgetId);
  if (budget) {
    budget.spent += parseFloat(amount);
    budget.remaining = budget.totalBudget - budget.spent;
    await budget.save();
  }
  
  await auditLog("create", "Transaction", transaction._id, transaction.description, req, null, transaction.toObject());
  
  res.redirect(`/vendor/${req.params.id}/transactions`);
});

app.post("/transaction/:id/approve", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).send("Transaction not found");
  
  const oldData = transaction.toObject();
  transaction.status = "approved";
  transaction.approvedBy = req.session.userId;
  transaction.approvedAt = new Date();
  await transaction.save();
  
  await auditLog("approve", "Transaction", transaction._id, transaction.description, req, oldData, transaction.toObject());
  
    res.redirect("/admin/transactions/pending");
});

app.post("/transaction/:id/reject", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).send("Transaction not found");
  
  const oldData = transaction.toObject();
  transaction.status = "rejected";
  transaction.approvedBy = req.session.userId;
  transaction.approvedAt = new Date();
  await transaction.save();
  
  await auditLog("reject", "Transaction", transaction._id, transaction.description, req, oldData, transaction.toObject());
  
    res.redirect("/admin/transactions/pending");
});

app.post("/budget/:id/approve", async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).send("Admin access required");
  
  const budget = await Budget.findById(req.params.id);
  if (!budget) return res.status(404).send("Budget not found");
  
  const oldData = budget.toObject();
  budget.status = "approved";
  await budget.save();
  
  await auditLog("approve", "Budget", budget._id, budget.name, req, oldData, budget.toObject());
  
  res.redirect(`/budget/${budget._id}`);
});

async function awardBadges(user) {
  const badges = [];
  
  if (user.transactionsSubmitted === 1 && !user.badges.some(b => b.name === 'First Transaction')) {
    badges.push({
      name: 'First Transaction',
      description: 'Submitted your first transaction',
      icon: '🎯',
      earnedAt: new Date()
    });
  }
  
  if (user.receiptsUploaded >= 10 && !user.badges.some(b => b.name === 'Receipt Master')) {
    badges.push({
      name: 'Receipt Master',
      description: 'Uploaded 10+ receipts',
      icon: '📄',
      earnedAt: new Date()
    });
  }
  
  if (user.transactionsSubmitted >= 50 && !user.badges.some(b => b.name === 'Transaction Pro')) {
    badges.push({
      name: 'Transaction Pro',
      description: 'Submitted 50+ transactions',
      icon: '💼',
      earnedAt: new Date()
    });
  }
  
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentTransactions = await Transaction.countDocuments({
    createdBy: user._id,
    createdAt: { $gte: weekAgo }
  });
  
  if (recentTransactions >= 7 && !user.badges.some(b => b.name === 'Perfect Week')) {
    badges.push({
      name: 'Perfect Week',
      description: 'Submitted transactions every day for a week',
      icon: '⭐',
      earnedAt: new Date()
    });
  }
  
  if (badges.length > 0) {
    user.badges.push(...badges);
    user.points += badges.length * 10;
    
    const newLevel = Math.floor(user.points / 100) + 1;
    if (newLevel > user.level) {
      user.level = newLevel;
      badges.push({
        name: `Level ${newLevel}`,
        description: `Reached level ${newLevel}`,
        icon: '🏆',
        earnedAt: new Date()
      });
    }
    
    await user.save();
  }
  
  return badges;
}

app.get("/editor/dashboard", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const assignedBudgets = await Budget.find({ 
      _id: { $in: user.assignedBudgets } 
    }).populate("creator");
    
    const pendingTransactions = await Transaction.countDocuments({ 
      createdBy: req.session.userId,
      status: "pending" 
    });
    
    const approvedToday = await Transaction.countDocuments({ 
      createdBy: req.session.userId,
      status: "approved",
      approvedAt: { $gte: new Date().setHours(0, 0, 0, 0) }
    });
    
    const recentTransactions = await Transaction.find({ 
      createdBy: req.session.userId 
    })
    .populate('budgetId')
    .populate('vendorId')
    .sort({ createdAt: -1 })
    .limit(5);
    
    res.render("editorDashboard", { 
      title: "Editor Dashboard", 
      user,
      assignedBudgets,
      pendingTransactions,
      approvedToday,
      recentTransactions
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.get("/editor/budget/:id", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const budget = await Budget.findById(req.params.id)
      .populate("creator")
      .populate({
        path: 'departments',
        populate: {
          path: 'projects',
          populate: {
            path: 'vendors'
          }
        }
      });
    
    if (!budget || !user.assignedBudgets.includes(budget._id)) {
      return res.status(403).send("Unauthorized access to this budget");
    }
    
    res.render("editorBudgetDetails", { 
      title: `Manage ${budget.name}`, 
      budget,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.get("/editor/transaction/new", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const assignedBudgets = await Budget.find({ 
      _id: { $in: user.assignedBudgets } 
    });
    
    res.render("editorTransactionForm", { 
      title: "Add New Transaction", 
      assignedBudgets,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.get("/editor/budget/:id/transactions", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const budget = await Budget.findById(req.params.id);
    
    if (!budget || !user.assignedBudgets.includes(req.params.id)) {
      return res.status(403).send("Unauthorized access to this budget");
    }
    
        const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    res.render("editorBudgetTransactions", {
      title: `Transactions - ${budget.name}`,
      budget,
      transactions,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.get("/editor/transactions/pending", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const pendingTransactions = await Transaction.find({ 
      createdBy: req.session.userId,
      status: 'pending'
    })
    .populate('budgetId', 'name department')
    .sort({ createdAt: -1 });
    
    res.render("editorPendingTransactions", {
      title: "Pending Transactions",
      transactions: pendingTransactions,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.post("/editor/transaction/new", upload.single('receipt'), async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  
  try {
    const { description, amount, budgetId, vendorId, projectId, departmentId, notes, category } = req.body;
    
    if (!description || !amount || !budgetId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    
        const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    
    if (!user.assignedBudgets.includes(budgetId)) {
      return res.status(403).json({ success: false, error: "Unauthorized access to this budget" });
    }
    
    let receiptData = {};
    if (req.file) {
      try {
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
        } else {
          console.error('Cloudinary upload failed:', uploadResult.error);
                  }
      } catch (uploadError) {
        console.error('Receipt upload error:', uploadError);
              }
    }
    
    const transaction = new Transaction({
      description,
      amount: parseFloat(amount),
      budgetId,
      vendorId: vendorId || undefined,
      projectId: projectId || undefined,
      departmentId: departmentId || undefined,
      notes,
      category,
      receipt: receiptData,
      createdBy: req.session.userId
    });
    
    await transaction.save();
    
        const budget = await Budget.findById(budgetId);
    if (budget) {
      budget.spent += parseFloat(amount);
      budget.remaining = budget.totalBudget - budget.spent;
      await budget.save();
    }
    
        try {
      const blockchainResult = await blockchainService.storeTransaction(transaction);
      if (blockchainResult.success) {
        transaction.blockchainId = blockchainResult.transactionId;
        transaction.blockHash = blockchainResult.blockHash;
        transaction.blockIndex = blockchainResult.blockIndex;
        await transaction.save();
        console.log('Transaction stored in blockchain:', blockchainResult.transactionId);
      }
    } catch (blockchainError) {
      console.error('Blockchain storage error:', blockchainError);
          }
    
                                                
        try {
      user.transactionsSubmitted = (user.transactionsSubmitted || 0) + 1;
      if (req.file) user.receiptsUploaded = (user.receiptsUploaded || 0) + 1;
      await user.save();
    } catch (userError) {
      console.error('User stats update error:', userError);
          }
    
        try {
      await awardBadges(user);
    } catch (badgeError) {
      console.error('Badge awarding error:', badgeError);
          }
    
        try {
      await auditLog("create", "Transaction", transaction._id, transaction.description, req, null, transaction.toObject());
    } catch (auditError) {
      console.error('Audit log error:', auditError);
          }
    
    res.json({ success: true, message: "Transaction created successfully", transactionId: transaction._id });
  } catch (error) {
    console.error('Transaction creation error:', error);
    res.status(500).json({ success: false, error: "Failed to create transaction: " + error.message });
  }
});

app.get("/editor/receipts/upload", async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    const user = await User.findById(req.session.userId);
    const assignedBudgets = await Budget.find({ 
      _id: { $in: user.assignedBudgets } 
    });
    
    res.render("receiptUpload", { 
      title: "Upload Receipt",
      assignedBudgets
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

app.post("/editor/receipts/upload", upload.single('receipt'), async (req, res) => {
  if (!req.session.userId || req.session.userRole !== 'editor') {
    return res.redirect("/login");
  }
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    
        const uploadResult = await cloudinaryService.uploadReceipt(req.file, Date.now());
    
    if (!uploadResult.success) {
      return res.status(500).json({ success: false, error: uploadResult.error });
    }
    
        const ocrResult = await ocrService.processReceiptFromUrl(uploadResult.url);
    
        const verification = await aiService.verifyReceipt(uploadResult.url);
    
    res.json({
      success: true,
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      verification: verification,
      ocrData: ocrResult.success ? ocrResult.data : null,
      ocrError: ocrResult.success ? null : ocrResult.error
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/ocr/process", upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    
    const ocrResult = await ocrService.processReceipt(req.file.path);
    
    res.json(ocrResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/ocr/process-url", async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ success: false, error: "Image URL required" });
    }
    
    const ocrResult = await ocrService.processReceiptFromUrl(imageUrl);
    
    res.json(ocrResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    if (!process.env.CLOUD_KEY_NAME) {
      return res.status(500).json({ 
        error: 'Cloudinary not configured. Please add CLOUD_KEY_NAME, COUD_API_KEY, and CLOUD_API_SECRET to your .env file' 
      });
    }
    
    const result = await cloudinary.uploader.upload(req.file.path);
    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

app.post("/budget/:id/add-expense", upload.single('receipt'), async (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: "Login required" });
  
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
        const user = await User.findById(req.session.userId);
    const isCreator = budget.creator.toString() === req.session.userId;
    const isAssignedEditor = budget.assignedEditors.some(editor => 
      typeof editor === 'string' ? editor === req.session.userId : editor.toString() === req.session.userId
    );
    const hasPermission = req.session.isAdmin || 
                         user.role === 'editor' || 
                         isCreator ||
                         isAssignedEditor;
    
    if (!hasPermission) {
      return res.status(403).json({ error: "No permission to add expenses to this budget" });
    }
    
    const { description, amount, category, vendor, notes } = req.body;
    
    if (!description || !amount) {
      return res.status(400).json({ error: "Description and amount are required" });
    }
    
    let receiptData = {};
    if (req.file) {
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
});

app.get("/fix-data", async (req, res) => {
  try {
        await Budget.updateMany(
      { creator: { $type: "string" } },
      { $set: { creator: new mongoose.Types.ObjectId() } }
    );
    
        await Transaction.updateMany(
      { $or: [
        { vendorId: { $exists: false } },
        { projectId: { $exists: false } },
        { departmentId: { $exists: false } }
      ]},
      { $unset: { vendorId: "", projectId: "", departmentId: "" } }
    );
    
    res.json({ message: "Data migration completed successfully" });
  } catch (error) {
    console.error("Migration error:", error);
    res.status(500).json({ error: "Migration failed" });
  }
});




app.post("/api/chatbot", async (req, res) => {
  const USER_PROMPT = req.body.message;
  if (!USER_PROMPT) return res.json({ reply: "No message provided." });
  
  try {
        const responses = [
      "I can help you understand budget transparency and fund management. What specific information are you looking for?",
      "Budget transparency ensures public funds are used responsibly. You can view detailed breakdowns of spending and allocations.",
      "For budget verification, you can use the verification system to check individual transactions and their authenticity.",
      "The system tracks budget allocations from departments to projects to vendors, providing complete visibility.",
      "You can search budgets by department, state, city, or keywords to find relevant information quickly.",
      "All public budgets are displayed with their current status, spending progress, and remaining allocations.",
      "The system provides real-time updates on budget utilization and spending patterns across different categories."
    ];
    
        const lowerPrompt = USER_PROMPT.toLowerCase();
    let reply = responses[Math.floor(Math.random() * responses.length)];
    
    if (lowerPrompt.includes('verify') || lowerPrompt.includes('verification')) {
      reply = "You can verify transactions using the verification system. Each transaction has a unique hash that can be checked for authenticity.";
    } else if (lowerPrompt.includes('budget') || lowerPrompt.includes('fund')) {
      reply = "Budgets are organized by department and show total allocation, spent amount, and remaining funds. You can view detailed breakdowns and spending patterns.";
    } else if (lowerPrompt.includes('search') || lowerPrompt.includes('find')) {
      reply = "Use the search filters to find budgets by department, location, or keywords. The system will show matching public budgets with their current status.";
    } else if (lowerPrompt.includes('help') || lowerPrompt.includes('how')) {
      reply = "I can help you navigate the budget transparency system. You can search budgets, view details, verify transactions, and track spending patterns. What would you like to know?";
    }
    
    res.json({ reply: reply });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.json({
      reply: "I'm here to help with budget transparency questions! How can I assist you today?",
    });
  }
});

app.get("/api/budget/:id/summary", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const summary = await aiService.generateBudgetSummary(budget);
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

app.post("/api/transaction/:id/classify", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).populate('budgetId');
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    
    const classification = await aiService.classifyTransaction(transaction, transaction.budgetId);
    res.json(classification);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to classify transaction" });
  }
});

app.get("/api/budget/:id/faq", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const faq = await aiService.generateFAQ(budget);
    res.json(faq);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate FAQ" });
  }
});

app.get("/api/budget/:id/sankey", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate({
        path: 'departments',
        populate: {
          path: 'projects',
          populate: {
            path: 'vendors'
          }
        }
      });
    
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const sankeyData = await aiService.generateSankeyData(budget);
    res.json(sankeyData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate Sankey data" });
  }
});


app.get("/api/transaction/:id/qr", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    
    const qrCode = await visualizationService.generateQRCode(transaction.transactionHash);
    res.json({ qrCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

app.get("/api/budget/:id/charts/spending", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const chartConfig = visualizationService.generateSpendingChart(budget);
    res.json(chartConfig);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate spending chart" });
  }
});

app.get("/api/budget/:id/charts/departments", async (req, res) => {
  try {
    const departments = await Department.find({ budgetId: req.params.id });
    const chartConfig = visualizationService.generateDepartmentChart(departments);
    res.json(chartConfig);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate department chart" });
  }
});

app.get("/api/budget/:id/charts/timeline", async (req, res) => {
  try {
    const transactions = await Transaction.find({ budgetId: req.params.id });
    const chartConfig = visualizationService.generateTimelineChart(transactions);
    res.json(chartConfig);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate timeline chart" });
  }
});

app.get("/api/budget/:id/charts/vendors", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });

        const transactions = await Transaction.find({ budgetId: req.params.id, status: 'approved' });
    
        const vendorSpending = {};
    transactions.forEach(transaction => {
      const vendor = transaction.notes || 'General';
      vendorSpending[vendor] = (vendorSpending[vendor] || 0) + transaction.amount;
    });

    if (Object.keys(vendorSpending).length > 0) {
      const labels = Object.keys(vendorSpending);
      const data = Object.values(vendorSpending);
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

      const chartData = {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: colors.slice(0, labels.length),
          borderWidth: 1
        }]
      };
      res.json(chartData);
    } else {
            const data = {
        labels: ['Spent', 'Remaining'],
        datasets: [{
          data: [budget.spent, budget.remaining],
          backgroundColor: ['#ef4444', '#10b981']
        }]
      };
      res.json(data);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

app.get("/api/budget/:id/transactions", async (req, res) => {
  try {
    const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json({ transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

app.post("/api/chatbot/ask", async (req, res) => {
  try {
    const { message, budgetId, context } = req.body;
    
    if (!message || !budgetId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    
        const budget = await Budget.findById(budgetId);
    if (!budget) {
      return res.status(404).json({ success: false, error: "Budget not found" });
    }
    
        const transactions = await Transaction.find({ budgetId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('createdBy', 'name');
    
        const budgetContext = {
      budgetName: budget.name,
      department: budget.department,
      state: budget.state,
      city: budget.city,
      totalBudget: budget.totalBudget,
      spent: budget.spent,
      remaining: budget.remaining,
      status: budget.status,
      fiscalYear: budget.fiscalYear,
      recentTransactions: transactions.map(t => ({
        description: t.description,
        amount: t.amount,
        date: t.createdAt,
        createdBy: t.createdBy?.name || 'Unknown'
      }))
    };
    
        let response = generateAIResponse(message, budgetContext);
    
    res.json({ success: true, response });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ success: false, error: "Server Error" });
  }
});

function generateAIResponse(message, context) {
  const lowerMessage = message.toLowerCase();
  
    if (lowerMessage.includes('budget') && (lowerMessage.includes('overview') || lowerMessage.includes('summary'))) {
    return `Here's an overview of the ${context.budgetName} budget:

📊 **Budget Details:**
- Department: ${context.department}
- Location: ${context.city}, ${context.state}
- Total Budget: ₹${context.totalBudget.toLocaleString()}
- Amount Spent: ₹${context.spent.toLocaleString()}
- Remaining: ₹${context.remaining.toLocaleString()}
- Status: ${context.status}
- Fiscal Year: ${context.fiscalYear}

The budget is ${((context.spent / context.totalBudget) * 100).toFixed(1)}% utilized.`;
  }
  
    if (lowerMessage.includes('spent') || lowerMessage.includes('spending')) {
    return `Current spending for ${context.budgetName}:

💰 **Spending Summary:**
- Total Spent: ₹${context.spent.toLocaleString()}
- Remaining Budget: ₹${context.remaining.toLocaleString()}
- Utilization Rate: ${((context.spent / context.totalBudget) * 100).toFixed(1)}%

${context.spent > context.totalBudget * 0.8 ? '⚠️ **Warning:** Budget utilization is over 80%. Consider monitoring expenses closely.' : '✅ Budget utilization is within normal limits.'}`;
  }
  
    if (lowerMessage.includes('transaction') || lowerMessage.includes('expense')) {
    if (context.recentTransactions.length > 0) {
      let response = `Recent transactions for ${context.budgetName}:\n\n`;
      context.recentTransactions.slice(0, 5).forEach((tx, index) => {
        response += `${index + 1}. ${tx.description} - ₹${tx.amount.toLocaleString()} (${new Date(tx.date).toLocaleDateString()})\n`;
      });
      return response;
    } else {
      return `No recent transactions found for ${context.budgetName}. The budget shows ₹${context.spent.toLocaleString()} spent, but no individual transactions are recorded.`;
    }
  }
  
    if (lowerMessage.includes('status') || lowerMessage.includes('state')) {
    return `The current status of ${context.budgetName} is **${context.status}**.

${context.status === 'draft' ? 'This budget is still in draft mode and not yet approved.' : ''}
${context.status === 'pending' ? 'This budget is pending approval.' : ''}
${context.status === 'approved' ? 'This budget has been approved and is active.' : ''}
${context.status === 'ongoing' ? 'This budget is currently ongoing and active.' : ''}
${context.status === 'finished' ? 'This budget has been completed.' : ''}
${context.status === 'rejected' ? 'This budget has been rejected.' : ''}`;
  }
  
    if (lowerMessage.includes('department')) {
    return `The ${context.budgetName} budget belongs to the **${context.department}** department.

📍 **Location:** ${context.city}, ${context.state}
📅 **Fiscal Year:** ${context.fiscalYear}`;
  }
  
    if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
    return `I can help you with information about this budget! Here's what I can tell you about:

🔍 **Budget Information:**
- Ask about budget overview, spending, or status
- Get details about recent transactions
- Learn about department and location details

💡 **Try asking:**
- "What's the budget overview?"
- "How much has been spent?"
- "Show me recent transactions"
- "What's the current status?"
- "Tell me about the department"

What would you like to know?`;
  }
  
    return `I understand you're asking about "${message}". 

For the ${context.budgetName} budget, I can help you with:
- Budget overview and spending details
- Recent transactions
- Current status and department information
- Spending patterns and analysis

Could you be more specific about what you'd like to know? For example, try asking "What's the budget overview?" or "How much has been spent?"`;
}

app.get("/api/budget/:id/export/pdf", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }

        const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

        const doc = new PDFDocument();
    
        res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="budget-report-${budget.name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf"`);
    
        doc.pipe(res);

        doc.fontSize(20).text('Budget Report', 50, 50);
    doc.fontSize(16).text(budget.name, 50, 80);
    doc.fontSize(12).text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 100);

        doc.fontSize(14).text('Budget Details', 50, 130);
    doc.fontSize(10).text(`Department: ${budget.department}`, 50, 150);
    doc.text(`Location: ${budget.city}, ${budget.state}`, 50, 165);
    doc.text(`Fiscal Year: ${budget.fiscalYear}`, 50, 180);
    doc.text(`Status: ${budget.status}`, 50, 195);
    doc.text(`Total Budget: ₹${budget.totalBudget.toLocaleString()}`, 50, 210);
    doc.text(`Amount Spent: ₹${budget.spent.toLocaleString()}`, 50, 225);
    doc.text(`Remaining: ₹${budget.remaining.toLocaleString()}`, 50, 240);
    doc.text(`Utilization: ${((budget.spent / budget.totalBudget) * 100).toFixed(1)}%`, 50, 255);

        if (transactions.length > 0) {
      doc.fontSize(14).text('Recent Transactions', 50, 285);
      
      let yPosition = 305;
      transactions.slice(0, 20).forEach((transaction, index) => {
        if (yPosition > 700) {
          doc.addPage();
          yPosition = 50;
        }
        
        doc.fontSize(10).text(`${index + 1}. ${transaction.description}`, 50, yPosition);
        doc.text(`   Amount: ₹${transaction.amount.toLocaleString()}`, 70, yPosition + 15);
        doc.text(`   Date: ${new Date(transaction.createdAt).toLocaleDateString()}`, 70, yPosition + 30);
        doc.text(`   Created by: ${transaction.createdBy?.name || 'Unknown'}`, 70, yPosition + 45);
        doc.text(`   Status: ${transaction.status}`, 70, yPosition + 60);
        
        yPosition += 80;
      });
    } else {
      doc.fontSize(12).text('No transactions found for this budget.', 50, 285);
    }

    let summaryY = yPosition + 20;
    if (transactions.length === 0) {
      summaryY = 285 + 20;
    }
    
    doc.fontSize(14).text('Summary', 50, summaryY);
    doc.fontSize(10).text(`This budget has ${transactions.length} transactions totaling ₹${budget.spent.toLocaleString()}.`, 50, summaryY + 20);
    doc.text(`The budget is ${((budget.spent / budget.totalBudget) * 100).toFixed(1)}% utilized.`, 50, summaryY + 35);
    
    if (budget.spent > budget.totalBudget * 0.8) {
      doc.text('⚠️ Warning: Budget utilization is over 80%.', 50, summaryY + 50);
    }

    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

app.get("/verify/:hash", async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ transactionHash: req.params.hash })
      .populate('budgetId')
      .populate('departmentId')
      .populate('projectId')
      .populate('vendorId');
    
    if (!transaction) {
      return res.render("verification", { 
        title: "Transaction Verification", 
        transaction: null, 
        error: "Transaction not found" 
      });
    }
    
    res.render("verification", { 
      title: "Transaction Verification", 
      transaction, 
      error: null 
    });
  } catch (error) {
    console.error(error);
    res.render("verification", { 
      title: "Transaction Verification", 
      transaction: null, 
      error: "Verification failed" 
    });
  }
});

app.get("/budget/:id/enhanced", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate("creator")
      .populate({
        path: 'departments',
        populate: {
          path: 'projects',
          populate: {
            path: 'vendors'
          }
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
});

app.get("/budgets/state/:state", async (req, res) => {
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
});

app.get("/budgets/department/:department", async (req, res) => {
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
});

app.get("/api/budget/:id/export", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate("creator")
      .populate({
        path: 'departments',
        populate: {
          path: 'projects',
          populate: {
            path: 'vendors'
          }
        }
      });
    
    if (!budget) return res.status(404).send("Budget not found");
    
        const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    
        const reportData = {
      budget: {
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
        createdAt: budget.createdAt,
        updatedAt: budget.updatedAt
      },
      transactions: transactions.map(t => ({
        description: t.description,
        amount: t.amount,
        category: t.category,
        status: t.status,
        notes: t.notes,
        createdAt: t.createdAt,
        approvedAt: t.approvedAt,
        createdBy: t.createdBy ? t.createdBy.name : 'Unknown',
        approvedBy: t.approvedBy ? t.approvedBy.name : null,
        receipt: t.receipt ? 'Yes' : 'No',
        transactionHash: t.transactionHash
      })),
      summary: {
        totalTransactions: transactions.length,
        totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
        pendingTransactions: transactions.filter(t => t.status === 'pending').length,
        approvedTransactions: transactions.filter(t => t.status === 'approved').length,
        rejectedTransactions: transactions.filter(t => t.status === 'rejected').length
      },
      generatedAt: new Date().toISOString()
    };
    
        res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="budget-report-${budget.name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.json"`);
    
    res.json(reportData);
  } catch (error) {
    console.error('Error generating export:', error);
    res.status(500).send("Error generating report");
  }
});

app.get("/api/anomalies/:budgetId", async (req, res) => {
  try {
    const anomalies = await anomalyService.getActiveAnomalies(req.params.budgetId);
    res.json({ anomalies });
  } catch (error) {
    console.error("Error fetching anomalies:", error);
    res.status(500).json({ error: "Failed to fetch anomalies" });
  }
});

app.post("/api/anomalies/:anomalyId/resolve", async (req, res) => {
  try {
    const { resolution } = req.body;
    const anomaly = await anomalyService.resolveAnomaly(
      req.params.anomalyId, 
      req.session.userId, 
      resolution
    );
    res.json({ message: "Anomaly resolved successfully", anomaly });
  } catch (error) {
    console.error("Error resolving anomaly:", error);
    res.status(500).json({ error: "Failed to resolve anomaly" });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    const feedbackData = {
      ...req.body,
      userId: req.session.userId || undefined
    };
    
    const feedback = new Feedback(feedbackData);
    await feedback.save();
    
    res.json({ message: "Feedback submitted successfully", feedback });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

app.get("/api/feedback/:budgetId", async (req, res) => {
  try {
    const feedback = await Feedback.find({ 
      budgetId: req.params.budgetId,
      status: { $ne: "rejected" }
    })
    .populate("userId", "name")
    .sort({ createdAt: -1 });
    
    res.json({ feedback });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

app.post("/api/budget/:budgetId/departments", async (req, res) => {
  try {
    const { name, allocatedBudget } = req.body;
    const budget = await Budget.findById(req.params.budgetId);
    
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    budget.departments.push({
      name,
      allocatedBudget: parseFloat(allocatedBudget),
      spent: 0,
      remaining: parseFloat(allocatedBudget)
    });
    
    await budget.save();
    res.json({ message: "Department added successfully", budget });
  } catch (error) {
    console.error("Error adding department:", error);
    res.status(500).json({ error: "Failed to add department" });
  }
});

app.post("/api/budget/:budgetId/departments/:deptIndex/vendors", async (req, res) => {
  try {
    const { name, allocatedBudget, workDescription, contactInfo } = req.body;
    const budget = await Budget.findById(req.params.budgetId);
    
    if (!budget || !budget.departments[req.params.deptIndex]) {
      return res.status(404).json({ error: "Budget or department not found" });
    }
    
    budget.departments[req.params.deptIndex].vendors.push({
      name,
      allocatedBudget: parseFloat(allocatedBudget),
      spent: 0,
      remaining: parseFloat(allocatedBudget),
      workDescription,
      contactInfo: contactInfo || {}
    });
    
    await budget.save();
    res.json({ message: "Vendor added successfully", budget });
  } catch (error) {
    console.error("Error adding vendor:", error);
    res.status(500).json({ error: "Failed to add vendor" });
  }
});

app.post("/api/run-anomaly-detection/:budgetId", async (req, res) => {
  try {
    const anomalies = await anomalyService.runAnomalyDetection(req.params.budgetId);
    res.json({ message: "Anomaly detection completed", anomalies });
  } catch (error) {
    console.error("Error running anomaly detection:", error);
    res.status(500).json({ error: "Failed to run anomaly detection" });
  }
});

app.get("/budget/:id/visualization", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) {
      return res.status(404).send("Budget not found");
    }
    
    res.render("budgetVisualization", {
      title: `Visualization - ${budget.name}`,
      budget
    });
  } catch (error) {
    console.error("Error loading visualization:", error);
    res.status(500).send("Server Error");
  }
});

// API endpoint for budget transactions
app.get("/api/budget/:id/transactions", async (req, res) => {
  try {
    const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json({ transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// API endpoint for budget summary
app.get("/api/budget/:id/summary", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    const transactions = await Transaction.find({ budgetId: req.params.id });
    const totalTransactions = transactions.length;
    const avgTransactionAmount = totalTransactions > 0 ? 
      transactions.reduce((sum, t) => sum + t.amount, 0) / totalTransactions : 0;
    
    const summary = {
      headline: `${budget.name} - Budget Overview`,
      bullets: [
        `Total budget allocated: ₹${budget.totalBudget.toLocaleString()}`,
        `Amount spent: ₹${budget.spent.toLocaleString()} (${((budget.spent / budget.totalBudget) * 100).toFixed(1)}%)`,
        `Remaining budget: ₹${budget.remaining.toLocaleString()}`,
        `Total transactions: ${totalTransactions}`,
        `Average transaction amount: ₹${avgTransactionAmount.toLocaleString()}`
      ],
      numbers: {
        total: `₹${budget.totalBudget.toLocaleString()}`,
        spent: `₹${budget.spent.toLocaleString()}`,
        remaining: `₹${budget.remaining.toLocaleString()}`
      }
    };
    
    res.json(summary);
  } catch (error) {
    console.error("Error generating summary:", error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

// API endpoint for FAQ
app.get("/api/budget/:id/faq", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    const faq = [
      {
        q: "What is the total budget for this project?",
        a: `The total budget allocated for ${budget.name} is ₹${budget.totalBudget.toLocaleString()}.`
      },
      {
        q: "How much has been spent so far?",
        a: `As of now, ₹${budget.spent.toLocaleString()} has been spent, which represents ${((budget.spent / budget.totalBudget) * 100).toFixed(1)}% of the total budget.`
      },
      {
        q: "What is the remaining budget?",
        a: `The remaining budget is ₹${budget.remaining.toLocaleString()}, which is ${((budget.remaining / budget.totalBudget) * 100).toFixed(1)}% of the total allocation.`
      },
      {
        q: "What is the current status of this budget?",
        a: `The budget is currently in "${budget.status}" status and is managed by the ${budget.department} department.`
      },
      {
        q: "Who approved this budget?",
        a: `This budget was approved by ${budget.approvedBy} for the fiscal year ${budget.fiscalYear}.`
      }
    ];
    
    res.json(faq);
  } catch (error) {
    console.error("Error generating FAQ:", error);
    res.status(500).json({ error: "Failed to generate FAQ" });
  }
});

// API endpoint for Sankey diagram data
app.get("/api/budget/:id/sankey", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    const transactions = await Transaction.find({ budgetId: req.params.id });
    
    // Create simple Sankey data structure
    const nodes = [
      { id: "budget", name: budget.name, type: "budget" },
      { id: "department", name: budget.department, type: "department" },
      { id: "spent", name: "Spent", type: "transaction" },
      { id: "remaining", name: "Remaining", type: "transaction" }
    ];
    
    const links = [
      { source: "budget", target: "department", value: budget.totalBudget },
      { source: "department", target: "spent", value: budget.spent },
      { source: "department", target: "remaining", value: budget.remaining }
    ];
    
    res.json({ nodes, links });
  } catch (error) {
    console.error("Error generating Sankey data:", error);
    res.status(500).json({ error: "Failed to generate Sankey data" });
  }
});

// API endpoint for anomalies
app.get("/api/anomalies/:id", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    // Generate mock anomalies based on budget data
    const anomalies = [];
    
    // Check for overspending
    if (budget.spent > budget.totalBudget * 0.9) {
      anomalies.push({
        _id: "anomaly_1",
        title: "High Budget Utilization",
        description: `Budget utilization is at ${((budget.spent / budget.totalBudget) * 100).toFixed(1)}%, which is above the 90% threshold.`,
        severity: budget.spent > budget.totalBudget ? "critical" : "high",
        detectedAt: new Date()
      });
    }
    
    // Check for unusual spending patterns
    if (budget.spent > 0 && budget.remaining < budget.totalBudget * 0.1) {
      anomalies.push({
        _id: "anomaly_2",
        title: "Low Remaining Budget",
        description: `Only ${((budget.remaining / budget.totalBudget) * 100).toFixed(1)}% of the budget remains. Consider reviewing spending patterns.`,
        severity: "medium",
        detectedAt: new Date()
      });
    }
    
    res.json({ anomalies });
  } catch (error) {
    console.error("Error fetching anomalies:", error);
    res.status(500).json({ error: "Failed to fetch anomalies" });
  }
});

// API endpoint for feedback
app.get("/api/feedback/:id", async (req, res) => {
  try {
    // For now, return empty feedback array
    // In a real implementation, you would fetch from a Feedback model
    res.json({ feedback: [] });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// API endpoint for chatbot
app.post("/api/chatbot/ask", async (req, res) => {
  try {
    const { message, budgetId, context } = req.body;
    
    if (!message || !budgetId) {
      return res.status(400).json({ error: "Message and budget ID are required" });
    }
    
    // Simple chatbot responses based on keywords
    let response = "I'm here to help you understand your budget data. ";
    
    if (message.toLowerCase().includes('budget') || message.toLowerCase().includes('total')) {
      response += `Your total budget is ₹${context.totalBudget.toLocaleString()}. `;
    }
    
    if (message.toLowerCase().includes('spent') || message.toLowerCase().includes('expense')) {
      response += `You have spent ₹${context.spent.toLocaleString()} so far. `;
    }
    
    if (message.toLowerCase().includes('remaining') || message.toLowerCase().includes('left')) {
      response += `You have ₹${context.remaining.toLocaleString()} remaining in your budget. `;
    }
    
    if (message.toLowerCase().includes('percentage') || message.toLowerCase().includes('%')) {
      const percentage = ((context.spent / context.totalBudget) * 100).toFixed(1);
      response += `You have used ${percentage}% of your total budget. `;
    }
    
    if (message.toLowerCase().includes('status')) {
      response += `Your budget is currently in "${context.status}" status. `;
    }
    
    if (message.toLowerCase().includes('department')) {
      response += `This budget is managed by the ${context.department} department. `;
    }
    
    // Add some general advice
    if (context.spent > context.totalBudget * 0.8) {
      response += "⚠️ You're approaching your budget limit. Consider reviewing your spending. ";
    } else if (context.spent < context.totalBudget * 0.3) {
      response += "✅ You're doing well with your budget management. ";
    }
    
    response += "Is there anything specific you'd like to know about your budget?";
    
    res.json({ 
      success: true, 
      response: response 
    });
  } catch (error) {
    console.error("Error processing chatbot request:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// API endpoint for department data
app.get("/api/budget/:id/departments", async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    // Generate sample department data based on budget
    const departments = [
      "IT Department",
      "HR Department", 
      "Finance Department",
      "Operations",
      "Marketing",
      "Research & Development",
      "Administration",
      "Customer Service"
    ];

    const departmentData = [];
    let remainingBudget = budget.totalBudget;
    let remainingSpent = budget.spent;

    for (let i = 0; i < departments.length; i++) {
      const dept = departments[i];
      
      // Allocate budget (decreasing amounts)
      const allocated = i === departments.length - 1 ? remainingBudget : 
        Math.floor(remainingBudget * (0.15 + Math.random() * 0.25));
      
      // Calculate spent amount
      const spent = i === departments.length - 1 ? remainingSpent :
        Math.floor(remainingSpent * (0.1 + Math.random() * 0.3));
      
      departmentData.push({
        name: dept,
        allocated: allocated,
        spent: spent,
        remaining: allocated - spent,
        utilization: allocated > 0 ? ((spent / allocated) * 100).toFixed(1) : 0
      });

      remainingBudget -= allocated;
      remainingSpent -= spent;
    }
    
    res.json({ departments: departmentData });
  } catch (error) {
    console.error("Error fetching department data:", error);
    res.status(500).json({ error: "Failed to fetch department data" });
  }
});

app.get("/debug/transaction", async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: "Debug endpoint working",
      timestamp: new Date().toISOString(),
      session: req.session
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
