const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  // Sync fields
  syncId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  syncVersion: {
    type: Number,
    default: 0
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },
  deleted: {
    type: Boolean,
    default: false
  },
  
  // User ownership
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Category hierarchy
  name: {
    type: String,
    required: true
  },
  parentId: {
    type: String,
    default: null,
    index: true
  },
  path: {
    type: String,
    required: true
  },
  fullPath: String,
  
  // Category type
  type: {
    type: String,
    enum: ['class', 'book', 'chapter', 'section', 'folder', 'custom'],
    default: 'folder'
  },
  
  // Metadata
  description: String,
  color: String,
  icon: String,
  order: {
    type: Number,
    default: 0
  },
  
  // Statistics
  questionCount: {
    type: Number,
    default: 0
  },
  
  // Settings
  isSystem: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: false
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
});

// Update timestamp on save
categorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.isNew && !this.syncId) {
    // Generate syncId if not provided
    this.syncId = new mongoose.Types.ObjectId().toString();
  }
  next();
});

// Build full path before saving
categorySchema.pre('save', async function(next) {
  if (this.isModified('name') || this.isModified('parentId')) {
    // Build path
    const pathParts = [this.name];
    let currentParentId = this.parentId;
    
    // Traverse up the hierarchy to build full path
    while (currentParentId) {
      const parent = await this.constructor.findOne({ syncId: currentParentId });
      if (!parent) break;
      pathParts.unshift(parent.name);
      currentParentId = parent.parentId;
    }
    
    this.fullPath = pathParts.join(' > ');
    this.path = this.fullPath; // For backward compatibility
  }
  next();
});

// Indexes for performance
categorySchema.index({ syncId: 1, userId: 1 });
categorySchema.index({ parentId: 1, order: 1 });
categorySchema.index({ deleted: 1 });
categorySchema.index({ type: 1 });

// Virtual for children count
categorySchema.virtual('childrenCount', {
  ref: 'Category',
  localField: 'syncId',
  foreignField: 'parentId',
  count: true
});

// Get all descendants
categorySchema.methods.getDescendants = async function() {
  const descendants = [];
  const children = await this.constructor.find({ 
    parentId: this.syncId,
    deleted: false 
  });
  
  for (const child of children) {
    descendants.push(child);
    const childDescendants = await child.getDescendants();
    descendants.push(...childDescendants);
  }
  
  return descendants;
};

// Soft delete method (also deletes descendants)
categorySchema.methods.softDelete = async function() {
  this.deleted = true;
  this.syncVersion = (this.syncVersion || 0) + 1;
  
  // Mark all descendants as deleted
  const descendants = await this.getDescendants();
  for (const descendant of descendants) {
    descendant.deleted = true;
    descendant.syncVersion = (descendant.syncVersion || 0) + 1;
    await descendant.save();
  }
  
  return this.save();
};

// Restore method
categorySchema.methods.restore = function() {
  this.deleted = false;
  this.syncVersion = (this.syncVersion || 0) + 1;
  return this.save();
};

module.exports = mongoose.model('Category', categorySchema);