// Mongoose plugin to ensure requireLogin field is always present

function ensureRequireLoginPlugin(schema) {
  // Add a pre-validate hook
  schema.pre('validate', function(next) {
    if (this.requireLogin === undefined || this.requireLogin === null) {
      this.requireLogin = false;
      console.log('[RequireLogin Plugin] Set default value for requireLogin');
    }
    next();
  });

  // Add a pre-save hook
  schema.pre('save', function(next) {
    if (this.isNew && (this.requireLogin === undefined || this.requireLogin === null)) {
      this.requireLogin = false;
      this.markModified('requireLogin');
      console.log('[RequireLogin Plugin] Ensured requireLogin is set for new document');
    }
    next();
  });

  // Add a post-init hook to check loaded documents
  schema.post('init', function(doc) {
    if (doc.requireLogin === undefined || doc.requireLogin === null) {
      doc.requireLogin = false;
      console.log('[RequireLogin Plugin] Set requireLogin for loaded document:', doc.sessionCode);
    }
  });

  // Override toObject to always include requireLogin
  schema.methods.toObject = function(options) {
    const obj = mongoose.Document.prototype.toObject.call(this, options);
    if (!('requireLogin' in obj)) {
      obj.requireLogin = false;
    }
    return obj;
  };

  // Override toJSON to always include requireLogin
  schema.methods.toJSON = function(options) {
    const obj = this.toObject(options);
    if (!('requireLogin' in obj)) {
      obj.requireLogin = false;
    }
    return obj;
  };
}

module.exports = ensureRequireLoginPlugin;