const mongoose = require("mongoose");

const editorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  assignedBudgets: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Budget",
    },
  ],
  role: {
    type: String,
    default: "editor",
    enum: ["editor", "senior_editor", "admin_editor"],
  },
  permissions: {
    canCreateTransactions: {
      type: Boolean,
      default: true,
    },
    canUploadReceipts: {
      type: Boolean,
      default: true,
    },
    canEditBudgets: {
      type: Boolean,
      default: false,
    },
    canApproveTransactions: {
      type: Boolean,
      default: false,
    },
  },
  stats: {
    transactionsCreated: {
      type: Number,
      default: 0,
    },
    receiptsUploaded: {
      type: Number,
      default: 0,
    },
    totalAmountProcessed: {
      type: Number,
      default: 0,
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

editorSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

editorSchema.index({ email: 1 });
editorSchema.index({ assignedBudgets: 1 });
editorSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Editor", editorSchema);
