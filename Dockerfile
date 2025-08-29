FROM node:18-alpine

# Install necessary packages including curl for healthcheck
RUN apk add --no-cache curl

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose port
EXPOSE 5000

# Health check using curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:5000/health || exit 1

# Make start script executable
RUN chmod +x start.sh || true

# Run the app using our startup script
CMD [ "sh", "start.sh" ]