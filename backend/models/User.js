const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// User Schema for Social Media Platform
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [60, 'Name cannot exceed 60 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false // Don't return password by default
  },
  bio: {
    type: String,
    default: '',
    maxlength: [160, 'Bio cannot exceed 160 characters']
  },
  avatar: {
    type: String,
    default: 'https://ui-avatars.com/api/?background=6366f1&color=fff&name='
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate avatar URL if not provided
userSchema.pre('save', function(next) {
  if (this.isNew && (!this.avatar || this.avatar.includes('ui-avatars.com/api/?background=6366f1&color=fff&name='))) {
    this.avatar = `https://ui-avatars.com/api/?background=6366f1&color=fff&name=${encodeURIComponent(this.name)}`;
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
