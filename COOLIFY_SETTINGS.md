# Coolify Configuration Guide

## Where to Change Settings in Coolify

1. **Log into Coolify** at your Coolify URL

2. **Navigate to your application**:
   - Click on "Applications" 
   - Select "intellaclick-cloud-backend" (or whatever you named it)

3. **Environment Variables**:
   - Click on "Environment Variables" tab
   - Add these variables:
   ```
   MONGODB_URI=mongodb+srv://intellaquizuser:dV7hRN41DDX8ynru@intellaquiz.k1zwci5.mongodb.net/intellaquiz?retryWrites=true&w=majority&appName=intellaquiz
   JWT_SECRET=Rzmfu@).w::-_R/.uf9&`9NO098oiS.Vh{J&7w_C_z!]*(|c
   NODE_ENV=production
   PORT=5000
   ```

4. **Start Command**:
   - Click on "General" or "Build" tab (depending on Coolify version)
   - Look for "Start Command" or "Custom Start Command"
   - Change from `npm start` to `npm run start:prod`
   - OR set it to: `bash start.sh`

5. **Deploy**:
   - Click "Deploy" or "Redeploy" button
   - Check logs to see if MongoDB connects properly

## How Your System Works

1. **Instructor** runs desktop app from flash drive
2. **Desktop app** connects to cloud backend (api.intellaclick.com)
3. **Cloud backend** stores sessions in MongoDB Atlas
4. **Students** join via web browser at join.intellaclick.com
5. **Real-time updates** flow through the cloud backend

The cloud backend MUST be running for clicker sessions to work!