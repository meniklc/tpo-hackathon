const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  budget: { type: Number, required: true },
  spent: { type: Number, default: 0 },
  remaining: { type: Number, default: function() { return this.budget - this.spent; } },
  budgetId: { type: mongoose.Schema.Types.ObjectId, ref: "Budget", required: true },
  status: { type: String, enum: ["active", "inactive", "completed"], default: "active" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

module.exports = mongoose.model("Department", departmentSchema);
