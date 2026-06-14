const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  allocatedTo: String,
  category: { type: String, default: "other" },
  vendor: { type: String, default: "" },
  notes: { type: String, default: "" },
  receipt: {
    url: String,
    publicId: String,
    filename: String,
    mimetype: String,
    size: Number,
    uploadedAt: Date,
  },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  addedAt: { type: Date, default: Date.now },
});

const budgetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    department: { type: String, required: true },
    state: { type: String, required: true },
    city: { type: String },
    country: { type: String, default: "India" },
    projectType: {
      type: String,
      enum: ["government", "college"],
      default: "government",
    },
    nationality: { type: String, default: "Indian" },
    collegeName: { type: String },
    collegeType: { type: String },
    totalBudget: { type: Number, required: true },
    spent: { type: Number, default: 0 },
    remaining: {
      type: Number,
      default: function () {
        return this.totalBudget - this.spent;
      },
    },
    fiscalYear: { type: String, required: true },
    approvedBy: { type: String, required: true },
    type: { type: String, enum: ["Public", "Private"], required: true },
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected", "ongoing", "finished"],
      default: "draft",
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedEditors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    editorEmail: String,
    editorPassword: String,
    expenses: [expenseSchema],
    departments: [
      {
        name: { type: String, required: true },
        allocatedBudget: { type: Number, required: true },
        spent: { type: Number, default: 0 },
        remaining: {
          type: Number,
          default: function () {
            return this.allocatedBudget - this.spent;
          },
        },
        vendors: [
          {
            name: { type: String, required: true },
            contactInfo: {
              email: String,
              phone: String,
              address: String,
            },
            allocatedBudget: { type: Number, required: true },
            spent: { type: Number, default: 0 },
            remaining: {
              type: Number,
              default: function () {
                return this.allocatedBudget - this.spent;
              },
            },
            workDescription: String,
            status: {
              type: String,
              enum: ["pending", "in_progress", "completed", "on_hold"],
              default: "pending",
            },
            startDate: Date,
            endDate: Date,
            transactions: [
              {
                description: String,
                amount: Number,
                date: { type: Date, default: Date.now },
                receipt: {
                  url: String,
                  publicId: String,
                  filename: String,
                },
                addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
              },
            ],
          },
        ],
      },
    ],
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String },
    tags: [{ type: String }],
    authenticityHash: { type: String, unique: true, sparse: true },
    aiSummary: { type: String },
    faq: [{ q: String, a: String }],
    departmentsCount: { type: Number, default: 0 },
    projectsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Budget", budgetSchema);
