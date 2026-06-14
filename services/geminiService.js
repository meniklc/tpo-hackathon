const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY );

const generateBudgetContext = (budget, transactions, departments) => {
  const context = `
Budget Information:
- Name: ${budget.name}
- Department: ${budget.department}
- Location: ${budget.city}, ${budget.state}, ${budget.country || 'India'}
- Project Type: ${budget.projectType || 'government'}
- Total Budget: ₹${budget.totalBudget.toLocaleString()}
- Amount Spent: ₹${budget.spent.toLocaleString()}
- Remaining Budget: ₹${budget.remaining.toLocaleString()}
- Utilization: ${((budget.spent / budget.totalBudget) * 100).toFixed(2)}%
- Status: ${budget.status}
- Fiscal Year: ${budget.fiscalYear}
- Approved By: ${budget.approvedBy}
- Type: ${budget.type}
- Created: ${new Date(budget.createdAt).toLocaleDateString()}

${budget.collegeName ? `College Name: ${budget.collegeName}` : ''}
${budget.collegeType ? `College Type: ${budget.collegeType}` : ''}

Departments (${departments.length}):
${departments.map((dept, i) => `${i + 1}. ${dept.name} - Budget: ₹${(dept.budget || 0).toLocaleString()}`).join('\n')}

Recent Transactions (${transactions.length}):
${transactions.slice(0, 10).map((t, i) => `
${i + 1}. ${t.description}
   - Amount: ₹${t.amount.toLocaleString()}
   - Category: ${t.category || 'General'}
   - Status: ${t.status}
   - Date: ${new Date(t.createdAt).toLocaleDateString()}
   - Created by: ${t.createdBy?.name || 'Unknown'}
`).join('\n')}

Total Transactions: ${transactions.length}
Average Transaction: ₹${transactions.length > 0 ? (transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length).toLocaleString() : 0}

Budget Analysis:
- Spending Rate: ${budget.spent > 0 ? ((budget.spent / budget.totalBudget) * 100).toFixed(2) : 0}% utilized
- Remaining: ${budget.remaining > 0 ? ((budget.remaining / budget.totalBudget) * 100).toFixed(2) : 0}% available
${budget.spent > budget.totalBudget * 0.9 ? '- WARNING: Budget utilization is over 90%' : ''}
${budget.spent > budget.totalBudget ? '- CRITICAL: Budget exceeded!' : ''}
${budget.remaining < budget.totalBudget * 0.1 ? '- ALERT: Less than 10% budget remaining' : ''}
`;

  return context;
};

const chatWithBudget = async (userMessage, budgetContext) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `You are a helpful budget management assistant. You have access to detailed information about a specific budget project.

Context about the budget:
${budgetContext}

User Question: ${userMessage}

Instructions:
- Answer questions specifically about this budget using the context provided
- Be precise with numbers and dates
- If asked about spending, transactions, or budget details, refer to the exact data
- If the question is not related to this budget, politely redirect to budget-related topics
- Use Indian Rupee (₹) format for currency
- Be conversational but professional
- Provide actionable insights when relevant

Answer:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return {
      success: true,
      response: text
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      success: false,
      error: error.message,
      response: "I'm having trouble processing your request. Please try again."
    };
  }
};

const generateBudgetSummary = async (budget, transactions) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `Generate a concise summary for this budget:

Budget: ${budget.name}
Department: ${budget.department}
Total Budget: ₹${budget.totalBudget.toLocaleString()}
Spent: ₹${budget.spent.toLocaleString()}
Remaining: ₹${budget.remaining.toLocaleString()}
Transactions: ${transactions.length}
Status: ${budget.status}

Provide:
1. A headline (max 15 words)
2. Three key bullet points
3. One recommendation

Format as JSON:
{
  "headline": "...",
  "bullets": ["...", "...", "..."],
  "recommendation": "..."
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {
      headline: `${budget.name} - ${((budget.spent / budget.totalBudget) * 100).toFixed(1)}% Utilized`,
      bullets: [
        `Total budget: ₹${budget.totalBudget.toLocaleString()}`,
        `Spent: ₹${budget.spent.toLocaleString()}`,
        `${transactions.length} transactions recorded`
      ],
      recommendation: "Continue monitoring spending patterns"
    };
  } catch (error) {
    console.error('Gemini summary error:', error);
    return {
      headline: `${budget.name} Budget Overview`,
      bullets: [
        `Total: ₹${budget.totalBudget.toLocaleString()}`,
        `Spent: ₹${budget.spent.toLocaleString()}`,
        `Remaining: ₹${budget.remaining.toLocaleString()}`
      ],
      recommendation: "Review budget allocation"
    };
  }
};

const generateInsights = async (budget, transactions) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const transactionsByCategory = {};
    transactions.forEach(t => {
      const cat = t.category || 'General';
      transactionsByCategory[cat] = (transactionsByCategory[cat] || 0) + t.amount;
    });

    const prompt = `Analyze this budget and provide insights:

Budget: ${budget.name}
Total: ₹${budget.totalBudget.toLocaleString()}
Spent: ₹${budget.spent.toLocaleString()} (${((budget.spent / budget.totalBudget) * 100).toFixed(1)}%)
Transactions: ${transactions.length}

Spending by Category:
${Object.entries(transactionsByCategory).map(([cat, amt]) => `- ${cat}: ₹${amt.toLocaleString()}`).join('\n')}

Provide 3-5 actionable insights about spending patterns, budget health, and recommendations.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    return {
      success: true,
      insights: text
    };
  } catch (error) {
    console.error('Gemini insights error:', error);
    return {
      success: false,
      insights: "Unable to generate insights at this time."
    };
  }
};

module.exports = {
  chatWithBudget,
  generateBudgetContext,
  generateBudgetSummary,
  generateInsights
};
