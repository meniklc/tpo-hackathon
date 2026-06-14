const Budget = require("../models/Budget");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const auditLog = require("../utils/auditLogger");
const { cloudinaryService } = require("../services/cloudinaryService");
const ocrService = require("../services/ocrService");
const aiService = require("../services/aiService");
const blockchainService = require("../services/blockchainService");
const { awardBadges } = require("../utils/gamification");

exports.getDashboard = async (req, res) => {
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
};

exports.getBudgetDetails = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const budget = await Budget.findById(req.params.id)
      .populate("creator")
      .populate({
        path: 'departments',
        populate: {
          path: 'projects',
          populate: { path: 'vendors' }
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
};

exports.getBudgetTransactions = async (req, res) => {
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
};

exports.getNewTransaction = async (req, res) => {
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
};

exports.postNewTransaction = async (req, res) => {
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
};

exports.getPendingTransactions = async (req, res) => {
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
};

exports.getReceiptUpload = async (req, res) => {
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
};

exports.postReceiptUpload = async (req, res) => {
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
};
