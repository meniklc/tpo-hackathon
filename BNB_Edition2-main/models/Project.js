const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  budget: { type: Number, required: true },
  spent: { type: Number, default: 0 },
  remaining: { type: Number, default: function() { return this.budget - this.spent; } },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
  status: { type: String, enum: ["planning", "active", "completed", "cancelled"], default: "planning" },
  startDate: { type: Date },
  endDate: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

module.exports = mongoose.model("Project", projectSchema);
