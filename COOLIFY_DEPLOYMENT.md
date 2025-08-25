# Coolify Deployment Instructions

## Environment Variables Required

In your Coolify application settings, you MUST set these environment variables:

```
MONGODB_URI=mongodb+srv://intellaquizuser:dV7hRN41DDX8ynru@intellaquiz.k1zwci5.mongodb.net/intellaquiz?retryWrites=true&w=majority&appName=intellaquiz
JWT_SECRET=Rzmfu@).w::-_R/.uf9&`9NO098oiS.Vh{J&7w_C_z!]*(|c
NODE_ENV=production
PORT=5000
```

## Deployment Settings

1. **Start Command**: Use `npm run start:prod` (not just `npm start`)
   - This uses our startup script that handles environment variables properly

2. **Build Command**: Leave empty (no build needed for Node.js)

3. **Base Directory**: Leave empty (use repository root)

4. **Alternative**: If environment variables still don't work, try these variable names:
   - `MONGO_URI` instead of `MONGODB_URI`
   - `DATABASE_URL` instead of `MONGODB_URI`
   - `DB_CONNECTION_STRING` instead of `MONGODB_URI`

The startup script will automatically check for these alternatives.

## Debugging

The server logs will show:
```
=== Environment Variables Debug ===
NODE_ENV: production
PORT: 5000
MONGODB_URI: mongodb+srv://intellaquizuser...
JWT_SECRET configured: Yes
===================================
```

If MONGODB_URI shows as `undefined`, check:
1. Variable name in Coolify matches exactly
2. No extra spaces before/after the value
3. Try redeploying after saving environment variables

## Health Check

Visit: https://api.intellaclick.com/api/health

Should return:
```json
{
  "status": "ok",
  "database": {
    "status": "connected",
    "ping": true,
    "uri": "configured"
  }
}
```