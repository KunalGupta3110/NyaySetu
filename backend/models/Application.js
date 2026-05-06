const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true, index: true },
  lawyerId: { type: String, required: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
  createdAt: { type: Date, default: Date.now }
});

// Compound index to prevent a lawyer from applying to the same case multiple times
ApplicationSchema.index({ caseId: 1, lawyerId: 1 }, { unique: true });

module.exports = mongoose.model('Application', ApplicationSchema);
