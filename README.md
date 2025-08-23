# IntellaClick Cloud Backend

## Deployment Instructions for Coolify

### 1. Initial Setup in Coolify

1. **Create New Project**: "IntellaClick"
2. **Add New Service**: Choose "Docker Compose"
3. **Configure Service**:
   - Name: `intellaclick-api`
   - Source: Git repository (after you push this code)
   - Build Pack: Docker Compose
   
### 2. Environment Variables in Coolify

Add these environment variables in Coolify:

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://mongo:27017/intellaclick
JWT_SECRET=<generate-a-secure-random-string>
ALLOWED_ORIGINS=https://intellaclick.com,https://api.intellaclick.com
```

### 3. Domain Configuration

In Coolify, set up domains:
- API Domain: `api.intellaclick.com`
- Enable HTTPS (Let's Encrypt)
- Enable HTTP to HTTPS redirect

### 4. MongoDB Setup

The docker-compose file includes MongoDB. In production, you might want to use MongoDB Atlas instead:

1. Create MongoDB Atlas account
2. Create a cluster
3. Get connection string
4. Update `MONGODB_URI` in Coolify

### 5. Deployment Steps

```bash
# In your local cloud-backend directory
git init
git add .
git commit -m "Initial cloud backend"
git remote add origin <your-git-repo>
git push -u origin main
```

Then in Coolify:
1. Connect to your Git repository
2. Deploy
3. Monitor logs for any issues

### 6. Testing the Deployment

```bash
# Health check
curl https://api.intellaclick.com/health

# Test auth endpoint
curl -X POST https://api.intellaclick.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### 7. Update Desktop App

In your desktop app, update the API URL:

```javascript
// In src/services/central-api-client.js
// Change from:
const API_URL = process.env.API_URL || 'http://localhost:5000/api';
// To:
const API_URL = process.env.API_URL || 'https://api.intellaclick.com/api';
```

Or set via environment variable when building:
```bash
set API_URL=https://api.intellaclick.com/api&& npm run build
```

## Next Steps

1. **Implement MongoDB Models**: Replace in-memory storage with proper MongoDB schemas
2. **Add Authentication Middleware**: Protect routes that require authentication
3. **Implement WebSocket Relay**: For real-time clicker sessions
4. **Add Payment Integration**: Stripe for subscriptions
5. **Create Admin Panel**: For managing users and content

## API Endpoints

- `GET /health` - Health check
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `GET /api/auth/me` - Get current user

More endpoints to be implemented in respective route files.