const { HfInference } = require("@huggingface/inference");

class AIService {
  constructor() {
    this.hf = new HfInference(process.env.HF_TOKEN);
    this.modelId = process.env.HF_MODEL_ID || "deepseek-ai/DeepSeek-V3-0324";
  }

  async generateBudgetSummary(budgetData, context = null) {
    try {
      // Check if HF_TOKEN is available
      if (!process.env.HF_TOKEN) {
        console.log("HF_TOKEN not available, using fallback summary");
        return this.getFallbackSummary(budgetData);
      }

      let departmentsInfo = "";
      if (budgetData.departments && budgetData.departments.length > 0) {
        departmentsInfo =
          "\nDepartments:\n" +
          budgetData.departments
            .map(
              (dept) =>
                `- ${dept.name}: ₹${
                  dept.allocatedBudget?.toLocaleString() || 0
                } allocated, ₹${dept.spent?.toLocaleString() || 0} spent`
            )
            .join("\n");
      }

      let vendorsInfo = "";
      if (budgetData.departments) {
        const allVendors = budgetData.departments.flatMap(
          (dept) => dept.vendors || []
        );
        if (allVendors.length > 0) {
          vendorsInfo =
            "\nKey Vendors:\n" +
            allVendors
              .slice(0, 5)
              .map(
                (vendor) =>
                  `- ${vendor.name}: ${
                    vendor.workDescription || "Service provider"
                  } (₹${vendor.allocatedBudget?.toLocaleString() || 0})`
              )
              .join("\n");
        }
      }

      let expensesInfo = "";
      if (context && context.transactions && context.transactions.length > 0) {
        expensesInfo =
          "\nRecent Transactions:\n" +
          context.transactions
            .slice(0, 5)
            .map(
              (transaction) =>
                `- ${transaction.description}: ₹${
                  transaction.amount?.toLocaleString() || 0
                } (${transaction.category || "General"}) - ${
                  transaction.status
                }`
            )
            .join("\n");
      } else if (budgetData.expenses && budgetData.expenses.length > 0) {
        expensesInfo =
          "\nRecent Expenses:\n" +
          budgetData.expenses
            .slice(0, 5)
            .map(
              (expense) =>
                `- ${expense.description}: ₹${
                  expense.amount?.toLocaleString() || 0
                } (${expense.category || "General"})`
            )
            .join("\n");
      }

      let projectTypeInfo = "";
      if (budgetData.projectType) {
        projectTypeInfo = `\nProject Type: ${budgetData.projectType}`;
        if (budgetData.projectType === "college") {
          projectTypeInfo += `\nCollege: ${budgetData.collegeName || "N/A"} (${
            budgetData.collegeType || "N/A"
          })`;
        } else {
          projectTypeInfo += `\nNationality: ${
            budgetData.nationality || "N/A"
          }`;
        }
      }

      const prompt = `You are a budget transparency expert. Create a clear, citizen-friendly summary of this government budget.

BUDGET INFORMATION:
Project Name: ${budgetData.name}
Department: ${budgetData.department}
Location: ${budgetData.state}, ${budgetData.city}, ${budgetData.country}
Total Budget: ₹${budgetData.totalBudget.toLocaleString()}
Amount Spent: ₹${budgetData.spent.toLocaleString()}
Remaining Amount: ₹${budgetData.remaining.toLocaleString()}
Fiscal Year: ${budgetData.fiscalYear}
Budget Type: ${budgetData.type}
Current Status: ${budgetData.status}
Approved By: ${
        budgetData.approvedBy
      }${projectTypeInfo}${departmentsInfo}${vendorsInfo}${expensesInfo}

Create a summary that helps citizens understand:
1. What this budget is for
2. How much money is involved
3. How it's being used
4. How to verify the information

Return ONLY valid JSON in this exact format:
{
  "headline": "Clear one-line summary of what this budget does",
  "bullets": [
    "Key point 1 about budget purpose",
    "Key point 2 about spending",
    "Key point 3 about transparency"
  ],
  "numbers": {
    "total": "₹${budgetData.totalBudget.toLocaleString()}",
    "spent": "₹${budgetData.spent.toLocaleString()}",
    "remaining": "₹${budgetData.remaining.toLocaleString()}"
  },
  "verification_tips": [
    "How citizens can verify this information",
    "Where to find more details"
  ]
}`;

      const response = await Promise.race([
        this.hf.textGeneration({
          model: "microsoft/DialoGPT-medium",
          inputs: prompt,
          parameters: {
            max_new_tokens: 400,
            temperature: 0.2,
            return_full_text: false,
          },
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("AI summary generation timeout")),
            15000
          )
        ),
      ]);

      const result = this.parseJSONResponse(response.generated_text);
      return result || this.getFallbackSummary(budgetData);
    } catch (error) {
      console.error("Error generating budget summary:", error);
      return this.getFallbackSummary(budgetData);
    }
  }

  async classifyTransaction(transactionData, budgetContext) {
    try {
      if (!process.env.HF_TOKEN) {
        console.log("HF_TOKEN not available, using fallback classification");
        return this.getFallbackClassification(transactionData);
      }

      const prompt = `Classify this transaction as 'legit' or 'suspicious' based on the context.

Transaction:
- Description: ${transactionData.description}
- Amount: ₹${transactionData.amount.toLocaleString()}
- Vendor: ${transactionData.vendorName || "Unknown"}

Budget Context:
- Budget: ${budgetContext.name}
- Department: ${budgetContext.department}
- Fiscal Year: ${budgetContext.fiscalYear}
- Large Payment Threshold: ₹${budgetContext.largePaymentThreshold || 100000}

Return JSON array:
[{
  "id": "${transactionData._id}",
  "category": "legit" or "suspicious",
  "score": 0-100,
  "reasons": ["reason1", "reason2"],
  "recommended_actions": ["action1", "action2"]
}]`;

      const response = await Promise.race([
        this.hf.textGeneration({
          model: "microsoft/DialoGPT-medium",
          inputs: prompt,
          parameters: {
            max_new_tokens: 200,
            temperature: 0.0,
            return_full_text: false,
          },
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("AI classification timeout")),
            10000
          )
        ),
      ]);

      return this.parseJSONResponse(response.generated_text);
    } catch (error) {
      console.error("Error classifying transaction:", error);
      return this.getFallbackClassification(transactionData);
    }
  }

  async generateFAQ(budgetData, context = null) {
    try {
      // Check if HF_TOKEN is available
      if (!process.env.HF_TOKEN) {
        console.log("HF_TOKEN not available, using fallback FAQ");
        return this.getFallbackFAQ(budgetData);
      }

      let departmentsInfo = "";
      if (budgetData.departments && budgetData.departments.length > 0) {
        departmentsInfo =
          "\nDepartments: " +
          budgetData.departments
            .map(
              (dept) =>
                `${dept.name} (₹${dept.allocatedBudget?.toLocaleString() || 0})`
            )
            .join(", ");
      }

      let vendorsInfo = "";
      if (budgetData.departments) {
        const allVendors = budgetData.departments.flatMap(
          (dept) => dept.vendors || []
        );
        if (allVendors.length > 0) {
          vendorsInfo =
            "\nKey Vendors: " +
            allVendors
              .slice(0, 3)
              .map(
                (vendor) =>
                  `${vendor.name} (${
                    vendor.workDescription || "Service provider"
                  })`
              )
              .join(", ");
        }
      }

      let transactionInfo = "";
      if (context && context.transactions && context.transactions.length > 0) {
        transactionInfo =
          "\nRecent Transactions: " +
          context.transactions
            .slice(0, 3)
            .map(
              (t) => `${t.description} (₹${t.amount?.toLocaleString() || 0})`
            )
            .join(", ");
      }

      const prompt = `You are a government transparency expert. Generate 6 FAQ questions and answers about this budget that citizens would ask.

BUDGET DETAILS:
Project: ${budgetData.name}
Department: ${budgetData.department}
Location: ${budgetData.state}, ${budgetData.city}, ${budgetData.country}
Total Budget: ₹${budgetData.totalBudget.toLocaleString()}
Amount Spent: ₹${budgetData.spent.toLocaleString()}
Remaining: ₹${budgetData.remaining.toLocaleString()}
Fiscal Year: ${budgetData.fiscalYear}
Status: ${budgetData.status}
Type: ${budgetData.type}
Approved By: ${
        budgetData.approvedBy
      }${departmentsInfo}${vendorsInfo}${transactionInfo}

Create questions that citizens typically ask about government budgets:
- What is this budget for?
- How much money is involved?
- How is it being spent?
- Who approved it?
- How can I verify it?
- What's the current status?

Return ONLY valid JSON array:
[{"q": "Short question?", "a": "Clear, simple answer."}, ...]`;

      const response = await Promise.race([
        this.hf.textGeneration({
          model: "microsoft/DialoGPT-medium",
          inputs: prompt,
          parameters: {
            max_new_tokens: 500,
            temperature: 0.3,
            return_full_text: false,
          },
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("AI FAQ generation timeout")),
            15000
          )
        ),
      ]);

      const result = this.parseJSONResponse(response.generated_text);
      return result || this.getFallbackFAQ(budgetData);
    } catch (error) {
      console.error("Error generating FAQ:", error);
      return this.getFallbackFAQ(budgetData);
    }
  }

  async generateSankeyData(hierarchyData, context = null) {
    try {
      const nodes = [];
      const links = [];

      nodes.push({
        id: `budget_${hierarchyData._id}`,
        name: hierarchyData.name,
        type: "budget",
      });

      if (hierarchyData.departments && hierarchyData.departments.length > 0) {
        hierarchyData.departments.forEach((dept) => {
          nodes.push({
            id: `dept_${dept._id || dept.name}`,
            name: dept.name,
            type: "department",
          });
          links.push({
            source: `budget_${hierarchyData._id}`,
            target: `dept_${dept._id || dept.name}`,
            value: dept.allocatedBudget || 100000,
          });

          if (dept.vendors && dept.vendors.length > 0) {
            dept.vendors.forEach((vendor) => {
              nodes.push({
                id: `vendor_${vendor._id || vendor.name}`,
                name: vendor.name,
                type: "vendor",
              });
              links.push({
                source: `dept_${dept._id || dept.name}`,
                target: `vendor_${vendor._id || vendor.name}`,
                value: vendor.allocatedBudget || 25000,
              });
            });
          }
        });
      } else {
        nodes.push({
          id: "dept_general",
          name: "General Operations",
          type: "department",
        });
        links.push({
          source: `budget_${hierarchyData._id}`,
          target: "dept_general",
          value: hierarchyData.totalBudget * 0.6,
        });

        nodes.push({
          id: "dept_infrastructure",
          name: "Infrastructure",
          type: "department",
        });
        links.push({
          source: `budget_${hierarchyData._id}`,
          target: "dept_infrastructure",
          value: hierarchyData.totalBudget * 0.4,
        });
      }

      if (context && context.transactions && context.transactions.length > 0) {
        const transactionCategories = {};
        context.transactions.forEach((transaction) => {
          const category = transaction.category || "General";
          if (!transactionCategories[category]) {
            transactionCategories[category] = 0;
          }
          transactionCategories[category] += transaction.amount || 0;
        });

        Object.entries(transactionCategories).forEach(
          ([category, totalAmount], index) => {
            const categoryId = `transaction_${category
              .toLowerCase()
              .replace(/\s+/g, "_")}`;
            nodes.push({
              id: categoryId,
              name: `${category} Expenses`,
              type: "transaction",
            });

            links.push({
              source: `budget_${hierarchyData._id}`,
              target: categoryId,
              value: totalAmount,
            });
          }
        );
      }

      if (nodes.length <= 1) {
        nodes.push({
          id: "expenses_general",
          name: "General Expenses",
          type: "transaction",
        });
        links.push({
          source: `budget_${hierarchyData._id}`,
          target: "expenses_general",
          value: hierarchyData.spent || 10000,
        });
      }

      return { nodes, links };
    } catch (error) {
      console.error("Error generating Sankey data:", error);
      return { nodes: [], links: [] };
    }
  }

  async generateChatbotResponse(userMessage, context) {
    try {
      // Check if HF_TOKEN is available
      if (!process.env.HF_TOKEN) {
        console.log("HF_TOKEN not available, using fallback chatbot response");
        return this.getFallbackChatbotResponse(userMessage, context);
      }

      const prompt = `You are a friendly BudgetTransparency Assistant. Answer the user's question about budget transparency in 3 short bullets. If they ask for verification, include the endpoint /verify/<hash>.

User Question: ${userMessage}
Context: ${JSON.stringify(context)}

Provide 3 short bullets for lay users, and 1 technical line for auditors if requested.`;

      const response = await Promise.race([
        this.hf.textGeneration({
          model: "microsoft/DialoGPT-medium",
          inputs: prompt,
          parameters: {
            max_new_tokens: 200,
            temperature: 0.5,
            return_full_text: false,
          },
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("AI chatbot response timeout")),
            10000
          )
        ),
      ]);

      return response.generated_text;
    } catch (error) {
      console.error("Error generating chatbot response:", error);
      return this.getFallbackChatbotResponse(userMessage, context);
    }
  }

  async generateEmailDigest(period, changes, transactions) {
    try {
      const prompt = `Generate a weekly email digest for stakeholders about budget changes and transactions.

Period: ${period}
Budget Changes: ${JSON.stringify(changes)}
New Transactions: ${JSON.stringify(transactions)}

Return JSON:
{
  "subject": "Weekly FundFlow Digest: <one-liner>",
  "body": "HTML formatted summary with bullets and CTAs"
}`;

      const response = await this.hf.textGeneration({
        model: "microsoft/DialoGPT-medium",
        inputs: prompt,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.3,
          return_full_text: false,
        },
      });

      return this.parseJSONResponse(response.generated_text);
    } catch (error) {
      console.error("Error generating email digest:", error);
      return this.getFallbackEmailDigest(period, changes, transactions);
    }
  }

  parseJSONResponse(text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("No JSON found in response");
    } catch (error) {
      console.error("Error parsing JSON response:", error);
      return null;
    }
  }

  getFallbackSummary(budgetData) {
    return {
      headline: `${budgetData.name} - ${budgetData.department} Budget`,
      bullets: [
        "Supports departmental operations",
        "Transparent fund allocation",
        "Public accountability maintained",
      ],
      numbers: {
        total: `₹${budgetData.totalBudget.toLocaleString()}`,
        spent: `₹${budgetData.spent.toLocaleString()}`,
        remaining: `₹${budgetData.remaining.toLocaleString()}`,
      },
      verification_tips: [
        "Check transaction hashes for verification",
        "Review audit trail for complete history",
      ],
    };
  }

  getFallbackClassification(transactionData) {
    return [
      {
        id: transactionData._id,
        category: "legit",
        score: 75,
        reasons: ["Standard transaction format", "Within expected parameters"],
        recommended_actions: ["Continue monitoring", "Regular audit review"],
      },
    ];
  }

  getFallbackFAQ(budgetData) {
    return [
      {
        q: "What is this budget for?",
        a: `This budget funds ${budgetData.department} operations for ${budgetData.fiscalYear}.`,
      },
      {
        q: "How much is allocated?",
        a: `Total allocation is ₹${budgetData.totalBudget.toLocaleString()}.`,
      },
      {
        q: "How much has been spent?",
        a: `₹${budgetData.spent.toLocaleString()} has been spent so far.`,
      },
      {
        q: "What's the remaining amount?",
        a: `₹${budgetData.remaining.toLocaleString()} remains unspent.`,
      },
      {
        q: "Is this budget public?",
        a:
          budgetData.type === "Public"
            ? "Yes, this is a public budget."
            : "No, this is a private budget.",
      },
      {
        q: "How can I verify transactions?",
        a: "Use the transaction hash to verify individual transactions.",
      },
    ];
  }

  getFallbackEmailDigest(period, changes, transactions) {
    return {
      subject: `Weekly FundFlow Digest: ${changes.length} budget changes, ${transactions.length} new transactions`,
      body: `
        <h2>Weekly FundFlow Digest</h2>
        <p>Period: ${period}</p>
        <h3>Budget Changes (${changes.length})</h3>
        <ul>
          ${changes
            .map((change) => `<li>${change.name}: ${change.action}</li>`)
            .join("")}
        </ul>
        <h3>New Transactions (${transactions.length})</h3>
        <ul>
          ${transactions
            .map(
              (tx) =>
                `<li>${tx.description}: ₹${tx.amount.toLocaleString()}</li>`
            )
            .join("")}
        </ul>
        <p><a href="/dashboard">View Full Dashboard</a></p>
      `,
    };
  }

  async verifyReceipt(receiptUrl) {
    try {
      const prompt = `Analyze this receipt image/PDF and verify its authenticity. Check for:
      1. Receipt format and structure
      2. Date and time validity
      3. Amount consistency
      4. Vendor information
      5. Any suspicious patterns
      
      Return JSON format:
      {
        "isValid": true/false,
        "confidence": 0-100,
        "issues": ["issue1", "issue2"],
        "recommendations": ["rec1", "rec2"],
        "extractedData": {
          "amount": "₹X,XXX",
          "date": "YYYY-MM-DD",
          "vendor": "Vendor Name",
          "description": "Item/Service description"
        }
      }`;

      const response = await this.hf.textGeneration({
        model: "microsoft/DialoGPT-medium",
        inputs: prompt,
        parameters: {
          max_new_tokens: 200,
          temperature: 0.2,
          return_full_text: false,
        },
      });

      return this.parseJSONResponse(response.generated_text);
    } catch (error) {
      console.error("Error verifying receipt:", error);
      return this.getFallbackVerification();
    }
  }

  getFallbackVerification() {
    return {
      isValid: true,
      confidence: 75,
      issues: [],
      recommendations: ["Manual review recommended"],
      extractedData: {
        amount: "₹0",
        date: new Date().toISOString().split("T")[0],
        vendor: "Unknown",
        description: "Receipt uploaded",
      },
    };
  }

  getFallbackChatbotResponse(userMessage, context) {
    const budgetData = context || {};
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes("budget") || lowerMessage.includes("money")) {
      return `• This budget is for ${budgetData.budgetName || "government operations"}
• Total allocated: ₹${budgetData.totalBudget?.toLocaleString() || "N/A"}
• Amount spent: ₹${budgetData.spent?.toLocaleString() || "N/A"} (${budgetData.spent && budgetData.totalBudget ? ((budgetData.spent / budgetData.totalBudget) * 100).toFixed(1) : "N/A"}%)`;
    }
    
    if (lowerMessage.includes("verify") || lowerMessage.includes("check")) {
      return `• All transactions have unique verification hashes
• Use /verify/<hash> endpoint to verify any transaction
• Blockchain records ensure data integrity and transparency`;
    }
    
    if (lowerMessage.includes("status") || lowerMessage.includes("current")) {
      return `• Budget status: ${budgetData.status || "Active"}
• Department: ${budgetData.department || "N/A"}
• Fiscal year: ${budgetData.fiscalYear || "N/A"}`;
    }
    
    return `• I can help you understand budget details and spending patterns
• Ask me about budget amounts, verification, or current status
• All data is transparent and verifiable through blockchain records`;
  }
}

module.exports = new AIService();
