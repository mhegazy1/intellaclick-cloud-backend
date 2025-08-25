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
app.use(helmet());
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like Electron apps)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins for now
    }
  },
  credentials: true
}));

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
const syncRoutes = require('./routes/sync');

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
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Not found',
      status: 404
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

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('Connected to MongoDB successfully');
  console.log('Database:', mongoose.connection.db.databaseName);
  
  // Start server
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`JWT Secret configured: ${process.env.JWT_SECRET ? 'Yes' : 'No (using default)'}`);
  });
})
.catch(err => {
  console.error('MongoDB connection error:', err.message);
  console.error('Full error:', err);
  
  // More helpful error messages
  if (err.message.includes('ECONNREFUSED')) {
    console.error('\nMake sure MongoDB is running:');
    console.error('- For local development: mongod');
    console.error('- For Docker: docker-compose up mongo');
  }
  
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});