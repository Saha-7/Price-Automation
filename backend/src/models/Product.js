import mongoose from 'mongoose';

const priceHistorySchema = new mongoose.Schema({
  price: {
    type: Number,
    required: true
  },
  oldPrice: {
    type: Number,
    default: null
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    enum: ['csv_upload', 'manual_update', 'api_sync', 'recommendation'],
    required: true
  },
  uploadId: {
    type: String,
    default: null
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  userName: {
    type: String,
    default: null
  }
}, { _id: false });

const productSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  productName: {
    type: String,
    required: true,
    trim: true
  },
  productType: {
    type: String,
    trim: true,
    index: true
  },
  brand: {
    type: String,
    trim: true,
    index: true
  },
  
  // Pricing Information
  purchasePrice: {
    type: Number,
    default: null,
    min: 0
  },
  mrp: {
    type: Number,
    default: null,
    min: 0
  },
  currentSellingPrice: {
    type: Number,
    default: null,
    min: 0
  },
  suggestedPrice: {
    type: Number,
    default: null,
    min: 0
  },
  
  // Shopify Integration
  shopifyProductId: {
    type: String,
    default: null,
    index: true
  },
  shopifyVariantId: {
    type: String,
    default: null,
    index: true
  },
  
  // Competition Data
  competitorPrices: {
    average: { type: Number, default: null },
    minimum: { type: Number, default: null },
    maximum: { type: Number, default: null },
    lastChecked: { type: Date, default: null }
  },
  
  // Recommendation Status
  recommendation: {
    suggestedPrice: { type: Number, default: null },
    reason: { type: String, default: null },
    clickUpliftPrediction: { type: Number, default: null },
    status: { 
      type: String, 
      enum: ['pending', 'approved', 'rejected'],
      default: null
    },
    generatedAt: { type: Date, default: null },
    reviewedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      default: null
    },
    reviewedAt: { type: Date, default: null }
  },
  
  // Price History (keep only last X entries based on PRICE_HISTORY_LIMIT)
  priceHistory: {
    type: [priceHistorySchema],
    default: []
  },
  
  // Data Source
  dataSource: {
    type: String,
    enum: ['zoho', 'shopify', 'csv_upload', 'manual'],
    default: 'csv_upload'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
productSchema.index({ productType: 1, brand: 1 });
productSchema.index({ 'recommendation.status': 1 });

// Pre-save middleware to maintain price history limit
productSchema.pre('save', function(next) {
  const limit = parseInt(process.env.PRICE_HISTORY_LIMIT) || 5;
  
  if (this.priceHistory.length > limit) {
    // Keep only the most recent 'limit' entries
    this.priceHistory = this.priceHistory
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }
  
  next();
});

// Method to add price change to history
productSchema.methods.addPriceHistory = function(newPrice, source, userId = null, userName = null, uploadId = null) {
  const oldPrice = this.currentSellingPrice;
  
  this.priceHistory.unshift({
    price: newPrice,
    oldPrice: oldPrice,
    updatedAt: new Date(),
    source: source,
    uploadId: uploadId,
    userId: userId,
    userName: userName
  });
  
  this.currentSellingPrice = newPrice;
  this.updatedAt = new Date();
};

// Method to calculate profit margin
productSchema.methods.calculateProfitMargin = function() {
  if (!this.purchasePrice || !this.currentSellingPrice) {
    return null;
  }
  
  const margin = ((this.currentSellingPrice - this.purchasePrice) / this.purchasePrice) * 100;
  return Math.round(margin * 100) / 100; // Round to 2 decimal places
};

const Product = mongoose.model('Product', productSchema);

export default Product;