const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    budgetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Budget",
      required: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: ["suggestion", "complaint", "question", "praise", "concern"],
      required: true,
    },
    category: {
      type: String,
      enum: [
        "budget_allocation",
        "transparency",
        "efficiency",
        "corruption",
        "other",
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5 },
    isAnonymous: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "under_review", "addressed", "rejected", "resolved"],
      default: "pending",
    },

    adminResponse: {
      message: String,
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      respondedAt: Date,
    },

    isModerated: { type: Boolean, default: false },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    moderatedAt: Date,
    moderationReason: String,

    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    reports: { type: Number, default: 0 },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },

    tags: [{ type: String }],

    attachments: [
      {
        filename: String,
        url: String,
        mimetype: String,
        size: Number,
      },
    ],
  },
  { timestamps: true }
);

feedbackSchema.index({ budgetId: 1, status: 1 });
feedbackSchema.index({ type: 1, category: 1 });
feedbackSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
