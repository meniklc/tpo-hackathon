const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contactPerson: { type: String },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  allocatedAmount: { type: Number, required: true },
  spent: { type: Number, default: 0 },
  remaining: { type: Number, default: function() { return this.allocatedAmount - this.spent; } },
  status: { type: String, enum: ["active", "inactive", "blacklisted"], default: "active" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

module.exports = mongoose.model("Vendor", vendorSchema);
