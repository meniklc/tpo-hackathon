const Anomaly = require("../models/Anomaly");
const Budget = require("../models/Budget");
const Transaction = require("../models/Transaction");

class AnomalyService {
  constructor() {
    this.thresholds = {
      budget_overrun: 0.8,
      unusual_spending: 2.0,
      duplicate_transaction: 0.95,
      suspicious_activity: 0.7,
    };
  }

  async detectBudgetOverrun(budgetId) {
    try {
      const budget = await Budget.findById(budgetId);
      if (!budget) return null;

      const spentPercentage = budget.spent / budget.totalBudget;

      if (spentPercentage >= this.thresholds.budget_overrun) {
        const anomaly = new Anomaly({
          budgetId,
          type: "budget_overrun",
          severity:
            spentPercentage >= 0.95
              ? "critical"
              : spentPercentage >= 0.9
              ? "high"
              : "medium",
          title: `Budget Overrun Alert - ${budget.name}`,
          description: `Budget has reached ${(spentPercentage * 100).toFixed(
            1
          )}% of total allocation.`,
          data: {
            threshold: this.thresholds.budget_overrun,
            actualValue: spentPercentage,
            expectedValue: 0.8,
            deviation: spentPercentage - this.thresholds.budget_overrun,
          },
        });

        await anomaly.save();
        return anomaly;
      }
    } catch (error) {
      console.error("Error detecting budget overrun:", error);
    }
    return null;
  }

  async detectUnusualSpending(budgetId) {
    try {
      const transactions = await Transaction.find({ budgetId })
        .sort({ createdAt: -1 })
        .limit(10);
      if (transactions.length < 3) return null;

      const amounts = transactions.map((t) => t.amount);
      const average = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const recentAmount = amounts[0];

      if (recentAmount >= average * this.thresholds.unusual_spending) {
        const anomaly = new Anomaly({
          budgetId,
          type: "unusual_spending",
          severity: recentAmount >= average * 3 ? "critical" : "high",
          title: `Unusual Spending Detected - ${recentAmount.toLocaleString()}`,
          description: `Recent transaction amount (₹${recentAmount.toLocaleString()}) is ${(
            recentAmount / average
          ).toFixed(1)}x the average spending.`,
          data: {
            threshold: this.thresholds.unusual_spending,
            actualValue: recentAmount,
            expectedValue: average,
            deviation: recentAmount - average,
            transactionIds: [transactions[0]._id],
          },
        });

        await anomaly.save();
        return anomaly;
      }
    } catch (error) {
      console.error("Error detecting unusual spending:", error);
    }
    return null;
  }

  async detectDuplicateTransactions(budgetId) {
    try {
      const transactions = await Transaction.find({ budgetId })
        .sort({ createdAt: -1 })
        .limit(20);

      for (let i = 0; i < transactions.length - 1; i++) {
        for (let j = i + 1; j < transactions.length; j++) {
          const t1 = transactions[i];
          const t2 = transactions[j];

          const similarity = this.calculateSimilarity(t1, t2);

          if (similarity >= this.thresholds.duplicate_transaction) {
            const anomaly = new Anomaly({
              budgetId,
              type: "duplicate_transaction",
              severity: similarity >= 0.98 ? "high" : "medium",
              title: `Potential Duplicate Transaction Detected`,
              description: `Two transactions are ${(similarity * 100).toFixed(
                1
              )}% similar: "${t1.description}" and "${t2.description}"`,
              data: {
                threshold: this.thresholds.duplicate_transaction,
                actualValue: similarity,
                expectedValue: 0.5,
                deviation: similarity - this.thresholds.duplicate_transaction,
                transactionIds: [t1._id, t2._id],
              },
            });

            await anomaly.save();
            return anomaly;
          }
        }
      }
    } catch (error) {
      console.error("Error detecting duplicate transactions:", error);
    }
    return null;
  }

  calculateSimilarity(t1, t2) {
    const amountSimilarity =
      Math.abs(t1.amount - t2.amount) / Math.max(t1.amount, t2.amount);
    const descriptionSimilarity = this.stringSimilarity(
      t1.description,
      t2.description
    );
    const vendorSimilarity = this.stringSimilarity(
      t1.vendor || "",
      t2.vendor || ""
    );

    return (
      (1 - amountSimilarity) * 0.4 +
      descriptionSimilarity * 0.4 +
      vendorSimilarity * 0.2
    );
  }

  stringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  async runAnomalyDetection(budgetId) {
    const anomalies = [];

    try {
      const budgetOverrun = await this.detectBudgetOverrun(budgetId);
      if (budgetOverrun) anomalies.push(budgetOverrun);

      const unusualSpending = await this.detectUnusualSpending(budgetId);
      if (unusualSpending) anomalies.push(unusualSpending);

      const duplicateTransactions = await this.detectDuplicateTransactions(
        budgetId
      );
      if (duplicateTransactions) anomalies.push(duplicateTransactions);

      return anomalies;
    } catch (error) {
      console.error("Error running anomaly detection:", error);
      return [];
    }
  }

  async getActiveAnomalies(budgetId) {
    return await Anomaly.find({
      budgetId,
      status: { $in: ["active", "investigating"] },
    }).sort({ severity: -1, detectedAt: -1 });
  }

  async resolveAnomaly(anomalyId, resolvedBy, resolution) {
    return await Anomaly.findByIdAndUpdate(anomalyId, {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy,
      resolution,
    });
  }
}

module.exports = new AnomalyService();
