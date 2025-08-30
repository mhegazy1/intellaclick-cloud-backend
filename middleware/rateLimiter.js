const rateLimit = require('express-rate-limit');
const MongoStore = require('rate-limit-mongo');

// Create a rate limiter factory with MongoDB store for distributed systems
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: options.message || 'Too many requests from this IP, please try again later.',
        retryAfter: Math.round(options.windowMs / 1000) // seconds
      });
    }
  };

  // Merge with provided options
  const limiterOptions = { ...defaultOptions, ...options };

  // Use MongoDB store if in production for distributed rate limiting
  if (process.env.NODE_ENV === 'production' && process.env.MONGODB_URI) {
    limiterOptions.store = new MongoStore({
      uri: process.env.MONGODB_URI,
      collectionName: 'ratelimits',
      expireTimeMs: limiterOptions.windowMs,
      errorHandler: console.error.bind(null, 'Rate limit MongoDB error:')
    });
  }

  return rateLimit(limiterOptions);
};

// Pre-configured limiters for different use cases
const limiters = {
  // Strict limiter for authentication endpoints
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true // Don't count successful requests
  }),

  // Moderate limiter for API endpoints
  api: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many API requests, please slow down.'
  }),

  // Lenient limiter for session participation
  session: createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 1 request per second average
    message: 'Too many session requests, please slow down.'
  }),

  // Very strict limiter for password reset
  passwordReset: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: 'Too many password reset attempts. Please try again in an hour.',
    skipSuccessfulRequests: false
  }),

  // Custom limiter factory
  custom: createRateLimiter
};

module.exports = limiters.custom;
module.exports.limiters = limiters;