const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "editor", "public"],
      default: "public",
    },
    isAdmin: { type: Boolean, default: false },
    department: { type: String },
    phone: { type: String },
    isActive: { type: Boolean, default: true },

    assignedBudgets: [{ type: mongoose.Schema.Types.ObjectId, ref: "Budget" }],
    assignedProjects: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    ],
    editorCredentials: {
      email: String,
      password: String,
      generatedAt: Date,
      lastUsed: Date,
    },

    badges: [
      {
        name: String,
        description: String,
        earnedAt: Date,
        icon: String,
      },
    ],
    points: { type: Number, default: 0 },
    level: { type: Number, default: 1 },

    lastLogin: Date,
    loginCount: { type: Number, default: 0 },
    transactionsSubmitted: { type: Number, default: 0 },
    receiptsUploaded: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
