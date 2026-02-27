import mongoose from 'mongoose';

const uploadLogSchema = new mongoose.Schema({
  uploadId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  uploadType: {
    type: String,
    enum: ['csv_purchase_price', 'manual_update', 'api_sync'],
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: null
  },
  totalRows: {
    type: Number,
    default: 0
  },
  processedRows: {
    type: Number,
    default: 0
  },
  successfulRows: {
    type: Number,
    default: 0
  },
  failedRows: {
    type: Number,
    default: 0
  },
  skippedRows: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed', 'partial'],
    default: 'processing'
  },
  errors: [{
    row: Number,
    sku: String,
    error: String
  }],
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  processingTime: {
    type: Number, // in seconds
    default: null
  }
}, {
  timestamps: true
});

// Method to mark upload as completed
uploadLogSchema.methods.markCompleted = function() {
  this.status = this.failedRows > 0 ? 'partial' : 'completed';
  this.completedAt = new Date();
  
  const processingTimeMs = this.completedAt - this.uploadedAt;
  this.processingTime = Math.round(processingTimeMs / 1000); // Convert to seconds
};

// Method to add error
uploadLogSchema.methods.addError = function(row, sku, error) {
  this.errors.push({ row, sku, error });
  this.failedRows++;
};

const UploadLog = mongoose.model('UploadLog', uploadLogSchema);

export default UploadLog;