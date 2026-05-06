const mongoose = require('mongoose');

const CASE_STATUSES = ['open', 'pending_review', 'assigned', 'approved', 'paid', 'completed'];

const CaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  problemType: { type: String, required: true },
  summary: { type: String, required: true },
  facts: [{ type: String }],
  location: { type: String },
  language: { type: String },
  documents: [{ type: String }],
  status: { type: String, enum: CASE_STATUSES, default: 'open', index: true },
  assignedLawyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  reviewRequestedAt: { type: Date },
  assignedAt: { type: Date },
  approvedAt: { type: Date },
  paidAt: { type: Date },
  completedAt: { type: Date },
  lawyerNotes: { type: String },
  reviewedDocument: { type: String },
  finalDocument: { type: String },
  payment: {
    amount: { type: Number },
    currency: { type: String, default: 'INR' },
    reference: { type: String }
  },
  // New fields for review workflow
  reviewStatus: {
    type: String,
    enum: ['draft', 'pending_review', 'under_review', 'verified', 'completed'],
    default: 'draft'
  },
  reviewedAt: { type: Date },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  finalDocumentUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Case', CaseSchema);
