const PDFDocument = require('pdfkit');
const Budget = require("../models/Budget");
const Department = require("../models/Department");
const Transaction = require("../models/Transaction");
const Anomaly = require("../models/Anomaly");
const Feedback = require("../models/Feedback");
const aiService = require("../services/aiService");
const visualizationService = require("../services/visualizationService");
const ocrService = require("../services/ocrService");
const anomalyService = require("../services/anomalyService");

exports.getSpendingChart = async (req, res) => {
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
};

exports.getDepartmentChart = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const departments = await Department.find({ budgetId: req.params.id });

    let labels = [];
    let data = [];

    if (departments.length > 0) {
      labels = departments.map(dept => dept.name);
      data = departments.map(dept => dept.budget || 0);
    } else {
      labels = [budget.department || 'General Operations'];
      data = [budget.totalBudget];
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
};

exports.getTimelineChart = async (req, res) => {
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
};

exports.getVendorChart = async (req, res) => {
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
};

exports.getSankeyData = async (req, res) => {
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
};

exports.getBudgetTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ budgetId: req.params.id })
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json({ transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
};

exports.getBudgetSummary = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const transactions = await Transaction.find({ budgetId: req.params.id });
    const geminiService = require("../services/geminiService");
    
    const aiSummary = await geminiService.generateBudgetSummary(budget, transactions);
    
    const totalTransactions = transactions.length;
    const avgTransactionAmount = totalTransactions > 0 ? 
      transactions.reduce((sum, t) => sum + t.amount, 0) / totalTransactions : 0;
    
    const summary = {
      headline: aiSummary.headline || `${budget.name} - Budget Overview`,
      bullets: aiSummary.bullets || [
        `Total budget allocated: ₹${budget.totalBudget.toLocaleString()}`,
        `Amount spent: ₹${budget.spent.toLocaleString()} (${((budget.spent / budget.totalBudget) * 100).toFixed(1)}%)`,
        `Remaining budget: ₹${budget.remaining.toLocaleString()}`
      ],
      recommendation: aiSummary.recommendation,
      numbers: {
        total: `₹${budget.totalBudget.toLocaleString()}`,
        spent: `₹${budget.spent.toLocaleString()}`,
        remaining: `₹${budget.remaining.toLocaleString()}`,
        transactions: totalTransactions,
        avgTransaction: `₹${avgTransactionAmount.toLocaleString()}`
      }
    };
    
    res.json(summary);
  } catch (error) {
    console.error("Error generating summary:", error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
};

exports.getFAQ = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
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
};

exports.exportBudget = async (req, res) => {
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
};

exports.exportPDF = async (req, res) => {
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
};

exports.getDepartments = async (req, res) => {
  try {
    const Department = require("../models/Department");
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const departments = await Department.find({ budgetId: req.params.id });
    
    if (departments.length === 0) {
      return res.json({ 
        departments: [{
          name: budget.department || "General",
          allocated: budget.totalBudget,
          spent: budget.spent,
          remaining: budget.remaining,
          utilization: budget.totalBudget > 0 ? ((budget.spent / budget.totalBudget) * 100).toFixed(1) : 0
        }]
      });
    }
    
    const departmentData = departments.map(dept => ({
      name: dept.name,
      allocated: dept.budget || 0,
      spent: dept.spent || 0,
      remaining: (dept.budget || 0) - (dept.spent || 0),
      utilization: dept.budget > 0 ? ((dept.spent / dept.budget) * 100).toFixed(1) : 0
    }));
    
    res.json({ departments: departmentData });
  } catch (error) {
    console.error("Error fetching department data:", error);
    res.status(500).json({ error: "Failed to fetch department data" });
  }
};

exports.addDepartment = async (req, res) => {
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
};

exports.addVendor = async (req, res) => {
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
};

exports.getAnomalies = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const anomalies = [];
    
    if (budget.spent > budget.totalBudget * 0.9) {
      anomalies.push({
        _id: "anomaly_1",
        title: "High Budget Utilization",
        description: `Budget utilization is at ${((budget.spent / budget.totalBudget) * 100).toFixed(1)}%, which is above the 90% threshold.`,
        severity: budget.spent > budget.totalBudget ? "critical" : "high",
        detectedAt: new Date()
      });
    }
    
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
};

exports.getActiveAnomalies = async (req, res) => {
  try {
    const anomalies = await anomalyService.getActiveAnomalies(req.params.budgetId);
    res.json({ anomalies });
  } catch (error) {
    console.error("Error fetching anomalies:", error);
    res.status(500).json({ error: "Failed to fetch anomalies" });
  }
};

exports.resolveAnomaly = async (req, res) => {
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
};

exports.runAnomalyDetection = async (req, res) => {
  try {
    const anomalies = await anomalyService.runAnomalyDetection(req.params.budgetId);
    res.json({ message: "Anomaly detection completed", anomalies });
  } catch (error) {
    console.error("Error running anomaly detection:", error);
    res.status(500).json({ error: "Failed to run anomaly detection" });
  }
};

exports.getFeedback = async (req, res) => {
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
};

exports.submitFeedback = async (req, res) => {
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
};

exports.chatbot = async (req, res) => {
  const USER_PROMPT = req.body.message;
  if (!USER_PROMPT) return res.json({ reply: "No message provided." });
  
  try {
    const Budget = require("../models/Budget");
    const Project = require("../models/Project");
    const Department = require("../models/Department");
    const Transaction = require("../models/Transaction");
    
    const lowerPrompt = USER_PROMPT.toLowerCase();
    
    const budgets = await Budget.find({ type: "Public" })
      .populate('creator', 'name')
      .select('name department state city country totalBudget spent remaining status fiscalYear approvedBy projectType')
      .sort({ totalBudget: lowerPrompt.includes('increasing') || lowerPrompt.includes('ascending') || lowerPrompt.includes('lowest') ? 1 : -1 })
      .limit(100);
    
    const totalBudgets = await Budget.countDocuments({ type: "Public" });
    const totalAllocated = budgets.reduce((sum, b) => sum + b.totalBudget, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    
    if (lowerPrompt.includes('list') || lowerPrompt.includes('show') || lowerPrompt.includes('all')) {
      let response = `Here are all ${totalBudgets} public budgets:\n\n`;
      budgets.forEach((b, i) => {
        const util = b.totalBudget > 0 ? ((b.spent / b.totalBudget) * 100).toFixed(1) : 0;
        response += `${i + 1}. ${b.name}\n`;
        response += `   - Department: ${b.department}\n`;
        response += `   - Location: ${b.city}, ${b.state}\n`;
        response += `   - Total Budget: ₹${b.totalBudget.toLocaleString()}\n`;
        response += `   - Spent: ₹${b.spent.toLocaleString()} (${util}%)\n`;
        response += `   - Remaining: ₹${b.remaining.toLocaleString()}\n`;
        response += `   - Status: ${b.status}\n\n`;
      });
      response += `\nSummary:\n`;
      response += `- Total Budgets: ${totalBudgets}\n`;
      response += `- Total Allocated: ₹${totalAllocated.toLocaleString()}\n`;
      response += `- Total Spent: ₹${totalSpent.toLocaleString()}\n`;
      response += `- Overall Utilization: ${totalAllocated > 0 ? ((totalSpent / totalAllocated) * 100).toFixed(1) : 0}%`;
      return res.json({ reply: response });
    }
    
    if (lowerPrompt.includes('total') || lowerPrompt.includes('sum')) {
      const response = `Budget Summary:\n\n` +
        `- Total Public Budgets: ${totalBudgets}\n` +
        `- Total Allocated: ₹${totalAllocated.toLocaleString()}\n` +
        `- Total Spent: ₹${totalSpent.toLocaleString()}\n` +
        `- Total Remaining: ₹${(totalAllocated - totalSpent).toLocaleString()}\n` +
        `- Overall Utilization: ${totalAllocated > 0 ? ((totalSpent / totalAllocated) * 100).toFixed(1) : 0}%`;
      return res.json({ reply: response });
    }
    
    if (lowerPrompt.includes('department')) {
      const deptCounts = {};
      const deptSpending = {};
      budgets.forEach(b => {
        deptCounts[b.department] = (deptCounts[b.department] || 0) + 1;
        deptSpending[b.department] = (deptSpending[b.department] || 0) + b.spent;
      });
      
      let response = `Budgets by Department:\n\n`;
      Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).forEach(([dept, count]) => {
        response += `- ${dept}: ${count} budget(s), ₹${deptSpending[dept].toLocaleString()} spent\n`;
      });
      return res.json({ reply: response });
    }
    
    if (lowerPrompt.includes('state') || lowerPrompt.includes('location')) {
      const stateCounts = {};
      budgets.forEach(b => {
        stateCounts[b.state] = (stateCounts[b.state] || 0) + 1;
      });
      
      let response = `Budgets by State:\n\n`;
      Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).forEach(([state, count]) => {
        response += `- ${state}: ${count} budget(s)\n`;
      });
      return res.json({ reply: response });
    }
    
    if (lowerPrompt.includes('highest') || lowerPrompt.includes('largest') || lowerPrompt.includes('biggest')) {
      const top5 = budgets.slice(0, 5);
      let response = `Top 5 Largest Budgets:\n\n`;
      top5.forEach((b, i) => {
        response += `${i + 1}. ${b.name} - ₹${b.totalBudget.toLocaleString()}\n`;
        response += `   ${b.department}, ${b.city}\n\n`;
      });
      return res.json({ reply: response });
    }
    
    const matchingBudget = budgets.find(b => 
      b.name.toLowerCase().includes(lowerPrompt) || 
      lowerPrompt.includes(b.name.toLowerCase())
    );
    
    if (matchingBudget) {
      const util = matchingBudget.totalBudget > 0 ? ((matchingBudget.spent / matchingBudget.totalBudget) * 100).toFixed(1) : 0;
      const response = `${matchingBudget.name}\n\n` +
        `- Department: ${matchingBudget.department}\n` +
        `- Location: ${matchingBudget.city}, ${matchingBudget.state}\n` +
        `- Total Budget: ₹${matchingBudget.totalBudget.toLocaleString()}\n` +
        `- Spent: ₹${matchingBudget.spent.toLocaleString()} (${util}%)\n` +
        `- Remaining: ₹${matchingBudget.remaining.toLocaleString()}\n` +
        `- Status: ${matchingBudget.status}\n` +
        `- Fiscal Year: ${matchingBudget.fiscalYear}\n` +
        `- Approved By: ${matchingBudget.approvedBy}`;
      return res.json({ reply: response });
    }
    
    const response = `I can help you with budget information! Try asking:\n\n` +
      `- "List all public budgets"\n` +
      `- "Show budgets in increasing order"\n` +
      `- "What's the total allocated budget?"\n` +
      `- "Which department has the most budgets?"\n` +
      `- "Show me the highest budgets"\n` +
      `- "Tell me about [budget name]"\n\n` +
      `We have ${totalBudgets} public budgets with a total allocation of ₹${totalAllocated.toLocaleString()}.`;
    
    res.json({ reply: response });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.json({
      reply: "I'm having trouble processing your request. Please try again.",
    });
  }
};

exports.chatbotAsk = async (req, res) => {
  try {
    const { message, budgetId } = req.body;
    
    if (!message || !budgetId) {
      return res.status(400).json({ 
        success: false, 
        error: "Message and budget ID are required" 
      });
    }
    
    const Budget = require("../models/Budget");
    const Transaction = require("../models/Transaction");
    const Department = require("../models/Department");
    const Project = require("../models/Project");
    
    const budget = await Budget.findById(budgetId)
      .populate("creator", "name email")
      .populate("assignedEditors", "name email");
    
    if (!budget) {
      return res.status(404).json({ 
        success: false, 
        error: "Budget not found" 
      });
    }
    
    const transactions = await Transaction.find({ budgetId })
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .populate('vendorId', 'name')
      .sort({ createdAt: -1 });
    
    const departments = await Department.find({ budgetId })
      .select('name budget spent');
    
    const lowerMsg = message.toLowerCase();
    const util = budget.totalBudget > 0 ? ((budget.spent / budget.totalBudget) * 100).toFixed(1) : 0;
    
    if (lowerMsg.includes('overview') || lowerMsg.includes('summary') || lowerMsg.includes('about')) {
      const response = `${budget.name} - Overview\n\n` +
        `Basic Information:\n` +
        `- Department: ${budget.department}\n` +
        `- Location: ${budget.city}, ${budget.state}\n` +
        `- Fiscal Year: ${budget.fiscalYear}\n` +
        `- Status: ${budget.status}\n` +
        `- Approved By: ${budget.approvedBy}\n\n` +
        `Financial Summary:\n` +
        `- Total Budget: ₹${budget.totalBudget.toLocaleString()}\n` +
        `- Amount Spent: ₹${budget.spent.toLocaleString()} (${util}%)\n` +
        `- Remaining: ₹${budget.remaining.toLocaleString()}\n\n` +
        `Activity:\n` +
        `- Total Transactions: ${transactions.length}\n` +
        `- Departments: ${departments.length}\n` +
        `- Average Transaction: ₹${transactions.length > 0 ? (budget.spent / transactions.length).toLocaleString() : 0}`;
      
      return res.json({ success: true, response });
    }
    
    if (lowerMsg.includes('spent') || lowerMsg.includes('spending')) {
      const byCategory = {};
      transactions.forEach(t => {
        const cat = t.category || 'General';
        byCategory[cat] = (byCategory[cat] || 0) + t.amount;
      });
      
      let response = `Spending Analysis for ${budget.name}:\n\n`;
      response += `- Total Spent: ₹${budget.spent.toLocaleString()} (${util}% of budget)\n`;
      response += `- Remaining: ₹${budget.remaining.toLocaleString()}\n\n`;
      response += `By Category:\n`;
      Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
        const pct = budget.spent > 0 ? ((amt / budget.spent) * 100).toFixed(1) : 0;
        response += `- ${cat}: ₹${amt.toLocaleString()} (${pct}%)\n`;
      });
      
      return res.json({ success: true, response });
    }
    
    if (lowerMsg.includes('transaction') || lowerMsg.includes('recent')) {
      let response = `Recent Transactions for ${budget.name}:\n\n`;
      transactions.slice(0, 10).forEach((t, i) => {
        response += `${i + 1}. ${t.description}\n`;
        response += `   - Amount: ₹${t.amount.toLocaleString()}\n`;
        response += `   - Category: ${t.category || 'General'}\n`;
        response += `   - Status: ${t.status}\n`;
        response += `   - Date: ${new Date(t.createdAt).toLocaleDateString()}\n\n`;
      });
      
      return res.json({ success: true, response });
    }
    
    if (lowerMsg.includes('health') || lowerMsg.includes('status')) {
      let response = `Budget Health Check for ${budget.name}:\n\n`;
      response += `- Utilization: ${util}%\n`;
      
      if (parseFloat(util) > 90) {
        response += `- Status: ⚠️ WARNING - Over 90% utilized\n`;
        response += `- Recommendation: Monitor spending closely, budget is nearly exhausted\n`;
      } else if (parseFloat(util) > 75) {
        response += `- Status: ⚠️ CAUTION - Over 75% utilized\n`;
        response += `- Recommendation: Review remaining allocations carefully\n`;
      } else if (parseFloat(util) > 50) {
        response += `- Status: ✅ ON TRACK - Normal utilization\n`;
        response += `- Recommendation: Continue current spending pace\n`;
      } else {
        response += `- Status: ✅ HEALTHY - Good budget availability\n`;
        response += `- Recommendation: Budget is well-managed\n`;
      }
      
      response += `\nDetails:\n`;
      response += `- Remaining: ₹${budget.remaining.toLocaleString()}\n`;
      response += `- Transactions: ${transactions.length}\n`;
      response += `- Average per transaction: ₹${transactions.length > 0 ? (budget.spent / transactions.length).toLocaleString() : 0}`;
      
      return res.json({ success: true, response });
    }
    
    if (lowerMsg.includes('department')) {
      let response = `Departments in ${budget.name}:\n\n`;
      if (departments.length === 0) {
        response += `No departments have been created yet for this budget.`;
      } else {
        departments.forEach((d, i) => {
          const dUtil = d.budget > 0 ? ((d.spent / d.budget) * 100).toFixed(1) : 0;
          response += `${i + 1}. ${d.name}\n`;
          response += `   - Budget: ₹${d.budget.toLocaleString()}\n`;
          response += `   - Spent: ₹${d.spent.toLocaleString()} (${dUtil}%)\n`;
          response += `   - Remaining: ₹${(d.budget - d.spent).toLocaleString()}\n\n`;
        });
      }
      
      return res.json({ success: true, response });
    }
    
    const response = `I can help you with information about ${budget.name}!\n\n` +
      `Try asking:\n` +
      `- "Give me an overview"\n` +
      `- "How much have we spent?"\n` +
      `- "Show me recent transactions"\n` +
      `- "Is the budget healthy?"\n` +
      `- "Tell me about departments"\n\n` +
      `Quick Stats:\n` +
      `- Total Budget: ₹${budget.totalBudget.toLocaleString()}\n` +
      `- Spent: ₹${budget.spent.toLocaleString()} (${util}%)\n` +
      `- Transactions: ${transactions.length}`;
    
    res.json({ success: true, response });
  } catch (error) {
    console.error("Error processing chatbot request:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to process request",
      response: "I'm having trouble processing your request. Please try again."
    });
  }
};

exports.processOCR = async (req, res) => {
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
};

exports.processOCRUrl = async (req, res) => {
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
};

exports.getTransactionQR = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    
    const qrCode = await visualizationService.generateQRCode(transaction.transactionHash);
    res.json({ qrCode });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
};

exports.classifyTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).populate('budgetId');
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    
    const classification = await aiService.classifyTransaction(transaction, transaction.budgetId);
    res.json(classification);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to classify transaction" });
  }
};

exports.getBudgetInsights = async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    if (!budget) return res.status(404).json({ error: "Budget not found" });
    
    const transactions = await Transaction.find({ budgetId: req.params.id });
    const geminiService = require("../services/geminiService");
    
    const insights = await geminiService.generateInsights(budget, transactions);
    
    res.json(insights);
  } catch (error) {
    console.error("Error generating insights:", error);
    res.status(500).json({ error: "Failed to generate insights" });
  }
};

