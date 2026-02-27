import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  microsoftId: {
    type: String,
    unique: true,
    sparse: true, // Allow null values
    index: true
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'viewer'],
    default: 'viewer',
    required: true
  },
  authProvider: {
    type: String,
    enum: ['microsoft'],
    default: 'microsoft'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
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

// Update the updatedAt timestamp before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to check if user has specific role
userSchema.methods.hasRole = function(role) {
  return this.role === role;
};

// Instance method to check if user has admin privileges
userSchema.methods.isAdmin = function() {
  return this.role === 'admin';
};

// Instance method to check if user can approve prices
userSchema.methods.canApprove = function() {
  return this.role === 'admin' || this.role === 'manager';
};

const User = mongoose.model('User', userSchema);

export default User;