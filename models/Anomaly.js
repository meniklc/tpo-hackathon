const mongoose = require("mongoose");

const anomalySchema = new mongoose.Schema(
  {
    budgetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Budget",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "budget_overrun",
        "unusual_spending",
        "duplicate_transaction",
        "suspicious_activity",
        "vendor_anomaly",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    detectedAt: { type: Date, default: Date.now },
    detectedBy: {
      type: String,
      enum: ["system", "ai", "user"],
      default: "system",
    },
    status: {
      type: String,
      enum: ["active", "investigating", "resolved", "false_positive"],
      default: "active",
    },
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolution: String,

    data: {
      threshold: Number,
      actualValue: Number,
      expectedValue: Number,
      deviation: Number,
      transactionIds: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
      ],
      vendorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }],
    },

    notifications: [
      {
        sentTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        sentAt: { type: Date, default: Date.now },
        method: { type: String, enum: ["email", "dashboard", "sms"] },
        status: { type: String, enum: ["sent", "delivered", "failed"] },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Anomaly", anomalySchema);
