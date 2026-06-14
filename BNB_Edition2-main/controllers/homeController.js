const Budget = require("../models/Budget");
const Transaction = require("../models/Transaction");
const aiService = require("../services/aiService");
const { indianStates } = require("../utils/constants");

exports.getHome = async (req, res) => {
  try {
    const query = { type: "Public" };
    const searchQuery = req.query.q || "";
    const department = req.query.department || "";
    const status = req.query.status || "";
    const userState = req.query.state || "";
    const userCity = req.query.city || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

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

    const budgets = await Budget.find(query)
      .populate("creator")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
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
    console.error(err);
    res.status(500).send("Server Error");
  }
};
