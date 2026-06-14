const bcrypt = require("bcrypt");
const Budget = require("../models/Budget");
const Department = require("../models/Department");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Editor = require("../models/Editor");
const auditLog = require("../utils/auditLogger");
const { cloudinaryService } = require("../services/cloudinaryService");
const blockchainService = require("../services/blockchainService");

exports.getDashboard = async (req, res) => {
  try {
    const budgets = await Budget.find({ creator: req.session.userId })
      .populate("creator")
      .populate("assignedEditors")
      .sort({ createdAt: -1 });
    
    const budgetIds = budgets.map(b => b._id);
    
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
    
    const recentTransactions = await Transaction.find({ budgetId: { $in: budgetIds } })
      .populate('createdBy', 'name email')
      .populate('budgetId', 'name department')
      .sort({ createdAt: -1 })
      .limit(10);
    
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
};

exports.getPendingTransactions = async (req, res) => {
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
};

exports.updateBudgetStatus = async (req, res) => {
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
};

exports.createTransaction = async (req, res) => {
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
      status: 'approved'
    });
    
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
};

exports.getEditors = async (req, res) => {
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
};

exports.getNewEditor = async (req, res) => {
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
};

exports.postNewEditor = async (req, res) => {
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
      assignedBudgets: [],
      assignedDepartments: assignedDepartments || []
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
};

exports.generateMultipleEditors = async (req, res) => {
  try {
    const { budgetId, departmentCount } = req.body;
    const budget = await Budget.findById(budgetId).populate('departments');
    
    if (!budget) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    const editors = [];
    
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
};
