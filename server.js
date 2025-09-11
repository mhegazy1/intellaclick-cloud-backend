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

// Trust proxy for rate limiting (needed when behind Coolify/Docker)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow file:// protocol for local HTML files (debugging)
    if (origin && origin.startsWith('file://')) {
      return callback(null, true);
    }
    
    // Get allowed origins from environment variable
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(url => url.trim()) || [];
    
    // Add default development origins
    const defaultOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://127.0.0.1:5500' // Live Server extension
    ];
    
    // Add production domains
    const productionOrigins = [
      'https://instructor.intellaclick.com',
      'https://join.intellaquiz.com',
      'https://student.intellaquiz.com'
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

// Rate limiting - Different limits for different endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs
});

// Student polling needs much higher limits
const studentPollingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // 5 requests per second for polling
  message: 'Too many requests, please try again later.'
});

// Apply different limits to different routes
app.use('/api/auth/', authLimiter);
app.use('/api/sessions/code/:code/current-question', studentPollingLimiter);
app.use('/api/sessions/code/:code/respond', studentPollingLimiter);
app.use('/api/sessions/code/:code/responses', studentPollingLimiter);
app.use('/api/sessions/code/:code/participants', studentPollingLimiter);
app.use('/api/', generalLimiter); // General limiter for all other routes

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
const requestLogger = require('./middleware/request-logger');
app.use(requestLogger);

// Stats endpoint (no rate limiting)
app.get('/api/request-stats', (req, res) => {
  res.json(requestLogger.getStats());
});

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const questionRoutes = require('./routes/questions');
const categoryRoutes = require('./routes/categories');
const quizRoutes = require('./routes/quizzes');
const sessionRoutes = require('./routes/sessions');
const sessionEnhancedRoutes = require('./routes/sessions-enhanced');
const sessionGamifiedRoutes = require('./routes/sessions-gamified');
const gamificationRoutes = require('./routes/gamification');
const taManagementRoutes = require('./routes/ta-management');
const clickerSyncRoutes = require('./routes/clicker-sync');
const statsRoutes = require('./routes/stats');
const studentsRoutes = require('./routes/students');
const classesRoutes = require('./routes/classes');
const enrollmentRoutes = require('./routes/enrollment');
const unifiedEnrollmentRoutes = require('./routes/unified-enrollment');
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
app.use('/api/students', studentsRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/unified-enrollment', unifiedEnrollmentRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/clicker/sessions', sessionRoutes); // Alias for clicker compatibility
app.use('/api/sessions-enhanced', sessionEnhancedRoutes); // Enhanced sessions with class enrollment
app.use('/api/sessions-gamified', sessionGamifiedRoutes); // Gamified session endpoints
app.use('/api/gamification', gamificationRoutes); // Gamification system endpoints
app.use('/api/ta-management', taManagementRoutes); // Teaching assistant management
app.use('/api/clicker-sync', clickerSyncRoutes); // Desktop app clicker results sync
app.use('/api/stats', statsRoutes);
app.use('/api/sync', syncRoutes);

// DEBUG ENDPOINTS - TEMPORARY for troubleshooting student issues

// Test email sending
app.post('/api/debug/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    const emailService = require('./services/emailService');
    const emailInstance = new emailService();
    
    await emailInstance.sendEmail(
      email,
      'Test Email from IntellaQuiz',
      `<h1>Email Test Successful!</h1>
      <p>If you're seeing this, your email configuration is working correctly.</p>
      <p>Students will be able to:</p>
      <ul>
        <li>Reset their passwords</li>
        <li>Verify their email addresses</li>
        <li>Receive session notifications</li>
      </ul>
      <p>Sent at: ${new Date().toLocaleString()}</p>`
    );
    
    res.json({ 
      success: true, 
      message: `Test email sent to ${email}` 
    });
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Check your SendGrid configuration in environment variables'
    });
  }
});

// Quick check for Student collection
app.get('/api/debug/student-collection', async (req, res) => {
  try {
    const Student = require('./models/Student');
    const students = await Student.find({})
      .select('+password') // Include password field to check if it exists
      .sort({ createdAt: -1 })
      .limit(50); // Last 50 students
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStudents = students.filter(s => new Date(s.createdAt) >= today);
    
    res.json({
      total: await Student.countDocuments(),
      todayCount: todayStudents.length,
      showing: students.length,
      students: students.map(s => ({
        email: s.email,
        name: s.profile?.firstName ? `${s.profile.firstName} ${s.profile.lastName}` : 'No name',
        created: s.createdAt,
        verified: s.isVerified,
        hasPassword: !!s.password,
        passwordHash: s.password ? 'HIDDEN' : null // Don't expose actual password hash
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check specific student with password details
app.get('/api/debug/check-student/:email', async (req, res) => {
  try {
    const Student = require('./models/Student');
    const { email } = req.params;
    
    // Get student WITH password field (not normally selected)
    const student = await Student.findOne({ 
      email: new RegExp(email, 'i') 
    }).select('+password');
    
    if (!student) {
      return res.json({ 
        found: false,
        message: 'No student found with this email in Student collection' 
      });
    }
    
    res.json({
      found: true,
      collection: 'students',
      email: student.email,
      name: `${student.profile?.firstName} ${student.profile?.lastName}`,
      hasPassword: !!student.password,
      passwordLength: student.password ? student.password.length : 0,
      passwordStartsWith: student.password ? student.password.substring(0, 10) + '...' : null,
      isBcryptHash: student.password ? (student.password.startsWith('$2a$') || student.password.startsWith('$2b$')) : false,
      created: student.createdAt,
      emailVerified: student.verification?.emailVerified || false,
      lastLogin: student.metadata?.lastLoginAt || null,
      loginCount: student.metadata?.loginCount || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/student/:email', async (req, res) => {
  try {
    const User = require('./models/User');
    const student = await User.findOne({ 
      email: new RegExp(req.params.email, 'i'),
      role: 'student'
    }).select('-password');
    
    if (!student) {
      return res.json({ error: 'Student not found' });
    }
    
    res.json({
      email: student.email,
      hasFirstName: !!student.firstName,
      hasLastName: !!student.lastName,
      hasNestedFirstName: !!student.profile?.firstName,
      hasNestedLastName: !!student.profile?.lastName,
      firstName: student.firstName || '(missing)',
      lastName: student.lastName || '(missing)',
      nestedFirstName: student.profile?.firstName || '(missing)',
      nestedLastName: student.profile?.lastName || '(missing)',
      created: student.createdAt,
      role: student.role,
      hasPassword: !!student.password
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all students with issue detection
app.get('/api/debug/students', async (req, res) => {
  try {
    const User = require('./models/User');
    const students = await User.find({ role: 'student' })
      .select('-password')
      .sort({ createdAt: -1 });
    
    const studentsWithIssues = students.map(student => {
      const hasNameIssue = (!student.firstName || !student.lastName) && 
                           (student.profile?.firstName || student.profile?.lastName);
      const missingName = !student.firstName && !student.lastName && 
                          !student.profile?.firstName && !student.profile?.lastName;
      
      return {
        _id: student._id,
        email: student.email,
        displayName: student.firstName && student.lastName 
          ? `${student.firstName} ${student.lastName}`
          : student.profile?.firstName && student.profile?.lastName
          ? `${student.profile.firstName} ${student.profile.lastName}`
          : '!!!',
        firstName: student.firstName || null,
        lastName: student.lastName || null,
        nestedFirstName: student.profile?.firstName || null,
        nestedLastName: student.profile?.lastName || null,
        created: student.createdAt,
        hasNameIssue,
        missingName,
        hasPassword: !!student.password,
        lastLogin: student.lastLogin || null
      };
    });
    
    const stats = {
      total: students.length,
      withNameIssues: studentsWithIssues.filter(s => s.hasNameIssue).length,
      missingNames: studentsWithIssues.filter(s => s.missingName).length,
      recentSignups: studentsWithIssues.filter(s => 
        new Date(s.created) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length
    };
    
    res.json({
      stats,
      students: studentsWithIssues
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List ALL users to find missing students
app.get('/api/debug/all-users', async (req, res) => {
  try {
    const User = require('./models/User');
    const Student = require('./models/Student');
    
    // Get counts by role
    const roleCounts = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    
    // Get today's users
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayUsers = await User.find({
      createdAt: { $gte: today }
    }).select('-password').sort({ createdAt: -1 });
    
    // Get all users from last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.find({
      createdAt: { $gte: weekAgo }
    }).select('-password').sort({ createdAt: -1 });
    
    // Check Student collection too
    const studentCollectionCount = await Student.countDocuments();
    const recentStudents = await Student.find({
      createdAt: { $gte: weekAgo }
    }).select('-password').sort({ createdAt: -1 });
    
    res.json({
      summary: {
        totalUsers: await User.countDocuments(),
        roleBreakdown: roleCounts,
        todayCount: todayUsers.length,
        last7DaysCount: recentUsers.length,
        studentCollectionCount,
        collections: {
          users: 'User model entries',
          students: 'Student model entries (separate collection)'
        }
      },
      todayUsers: todayUsers.map(u => ({
        email: u.email,
        role: u.role,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'No name',
        created: u.createdAt,
        hasPassword: !!u.password
      })),
      recentUsers: recentUsers.map(u => ({
        email: u.email,
        role: u.role,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'No name',
        created: u.createdAt,
        hasPassword: !!u.password
      })),
      recentStudentCollection: recentStudents.map(s => ({
        email: s.email,
        name: s.profile?.firstName ? `${s.profile.firstName} ${s.profile.lastName}` : 'No name',
        created: s.createdAt,
        verified: s.isVerified
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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