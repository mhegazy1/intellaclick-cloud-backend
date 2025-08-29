const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config();
// Also try loading from .env.production if NODE_ENV is production
if (process.env.NODE_ENV === 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env.production') });
}

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Get allowed origins from environment variable
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(url => url.trim()) || [];
    
    // Add default development origins
    const defaultOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173'
    ];
    
    // In production, add common Netlify patterns
    if (process.env.NODE_ENV === 'production') {
      // Add any Netlify preview/branch deploy patterns
      const netlifyPatterns = [
        /^https:\/\/.*\.netlify\.app$/,
        /^https:\/\/.*\.netlify\.live$/
      ];
      
      // Check if origin matches any pattern
      const matchesPattern = netlifyPatterns.some(pattern => pattern.test(origin));
      if (matchesPattern) {
        return callback(null, true);
      }
    }
    
    // Combine all allowed origins
    const allAllowedOrigins = [...defaultOrigins, ...allowedOrigins];
    
    if (allAllowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS: Blocked origin ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  exposedHeaders: ['x-auth-token'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs (increased for testing)
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const questionRoutes = require('./routes/questions');
const categoryRoutes = require('./routes/categories');
const quizRoutes = require('./routes/quizzes');
const sessionRoutes = require('./routes/sessions');
const statsRoutes = require('./routes/stats');
// Use MongoDB-backed sync routes
const syncRoutes = require('./routes/sync-mongodb');

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState;
    const dbStatusText = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbStatus];
    
    // Try to ping the database
    let dbPing = false;
    if (dbStatus === 1) {
      try {
        await mongoose.connection.db.admin().ping();
        dbPing = true;
      } catch (err) {
        console.error('DB ping failed:', err.message);
      }
    }
    
    res.json({ 
      status: dbStatus === 1 && dbPing ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'IntellaClick Cloud API',
      database: {
        status: dbStatusText,
        ping: dbPing,
        uri: process.env.MONGODB_URI ? 'configured' : 'using default'
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/clicker/sessions', sessionRoutes); // Alias for clicker compatibility
app.use('/api/stats', statsRoutes);
app.use('/api/sync', syncRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'IntellaClick Cloud API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      documentation: '/api/docs'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Log error details
  console.error('Error:', {
    message: err.message,
    status: err.status,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    origin: req.headers.origin
  });

  // Handle CORS errors specifically
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: {
        message: 'CORS policy: Origin not allowed',
        status: 403,
        code: 'CORS_ERROR'
      }
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        message: 'Validation error',
        status: 400,
        code: 'VALIDATION_ERROR',
        details: err.errors
      }
    });
  }

  // Handle MongoDB duplicate key errors
  if (err.code === 11000) {
    return res.status(400).json({
      error: {
        message: 'Duplicate entry',
        status: 400,
        code: 'DUPLICATE_ERROR'
      }
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: {
        message: 'Invalid token',
        status: 401,
        code: 'AUTH_ERROR'
      }
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500,
      code: err.code || 'SERVER_ERROR'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Resource not found',
      status: 404,
      code: 'NOT_FOUND',
      path: req.path
    }
  });
});

// Enhanced environment debugging
console.log('=== Environment Variables Debug ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('JWT_SECRET configured:', process.env.JWT_SECRET ? 'Yes' : 'No');
console.log('All env vars:', Object.keys(process.env).filter(key => 
  key.includes('MONGO') || key.includes('JWT') || key.includes('NODE') || key.includes('PORT')
));
console.log('=================================');

// Database connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick';
console.log(`Using MongoDB URI: ${mongoUri.includes('mongodb+srv') ? 'Atlas cluster' : 'Local MongoDB'}`);

// Start server immediately (don't wait for MongoDB)
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`JWT Secret configured: ${process.env.JWT_SECRET ? 'Yes' : 'No (using default)'}`);
});

// Track MongoDB connection state
let mongoConnected = false;

// Connect to MongoDB (but don't exit if it fails)
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000, // Timeout after 10s
  socketTimeoutMS: 45000,
  bufferCommands: false, // Disable buffering
})
.then(() => {
  mongoConnected = true;
  console.log('Connected to MongoDB successfully');
  console.log('Database:', mongoose.connection.db.databaseName);
})
.catch(err => {
  console.error('MongoDB initial connection error:', err.message);
  console.error('Full error:', err);
  
  // More helpful error messages
  if (err.message.includes('ECONNREFUSED')) {
    console.error('\nMake sure MongoDB is running:');
    console.error('- For local development: mongod');
    console.error('- For Docker: docker-compose up mongo');
  } else if (err.message.includes('ENOTFOUND')) {
    console.error('\nDNS resolution failed. This might be a Docker networking issue.');
    console.error('The server will continue running and retry the connection.');
  }
  
  // Don't exit - server can still handle health checks
  console.log('\n⚠️  Server starting without MongoDB connection. Will retry...');
});

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
  mongoConnected = true;
  console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  mongoConnected = false;
  console.error('MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  mongoConnected = false;
  console.log('MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});