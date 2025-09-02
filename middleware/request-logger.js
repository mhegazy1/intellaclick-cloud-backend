// Request logging middleware to debug excessive requests
const requestCounts = {};
const requestDetails = [];
const startTime = Date.now();

function requestLogger(req, res, next) {
  const endpoint = req.path;
  const method = req.method;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const timestamp = Date.now();
  
  // Create a key for this type of request
  const key = `${method} ${endpoint}`;
  
  // Track request
  if (!requestCounts[key]) {
    requestCounts[key] = {
      count: 0,
      ips: {},
      firstSeen: timestamp,
      lastSeen: timestamp
    };
  }
  
  requestCounts[key].count++;
  requestCounts[key].lastSeen = timestamp;
  requestCounts[key].ips[ip] = (requestCounts[key].ips[ip] || 0) + 1;
  
  // Store detailed info for recent requests
  requestDetails.push({
    endpoint,
    method,
    ip,
    userAgent,
    timestamp,
    sessionCode: req.params.sessionCode || req.params.code || 'N/A'
  });
  
  // Keep only last 100 requests
  if (requestDetails.length > 100) {
    requestDetails.shift();
  }
  
  // Log every 50 requests
  const totalRequests = Object.values(requestCounts).reduce((sum, data) => sum + data.count, 0);
  if (totalRequests % 50 === 0) {
    console.log('\n=== REQUEST STATISTICS ===');
    console.log(`Total requests: ${totalRequests} in ${((timestamp - startTime) / 1000).toFixed(1)}s`);
    console.log('\nTop endpoints:');
    
    Object.entries(requestCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .forEach(([endpoint, data]) => {
        const rate = data.count / ((timestamp - data.firstSeen) / 1000);
        const uniqueIPs = Object.keys(data.ips).length;
        console.log(`  ${endpoint}: ${data.count} requests (${rate.toFixed(1)}/sec) from ${uniqueIPs} IPs`);
      });
      
    // Check for suspicious patterns
    const recentRequests = requestDetails.slice(-20);
    const rapidRequests = {};
    
    recentRequests.forEach(req => {
      const key = `${req.ip}-${req.endpoint}`;
      if (!rapidRequests[key]) {
        rapidRequests[key] = [];
      }
      rapidRequests[key].push(req.timestamp);
    });
    
    console.log('\nRapid request patterns:');
    Object.entries(rapidRequests).forEach(([key, timestamps]) => {
      if (timestamps.length > 3) {
        const gaps = [];
        for (let i = 1; i < timestamps.length; i++) {
          gaps.push(timestamps[i] - timestamps[i-1]);
        }
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        if (avgGap < 500) { // Less than 500ms average
          console.log(`  ${key}: ${timestamps.length} requests, avg gap: ${avgGap.toFixed(0)}ms`);
        }
      }
    });
  }
  
  next();
}

// Endpoint to get current stats
requestLogger.getStats = () => {
  const now = Date.now();
  return {
    totalRequests: Object.values(requestCounts).reduce((sum, data) => sum + data.count, 0),
    uptime: (now - startTime) / 1000,
    endpoints: Object.entries(requestCounts)
      .map(([endpoint, data]) => ({
        endpoint,
        count: data.count,
        rate: data.count / ((now - data.firstSeen) / 1000),
        uniqueIPs: Object.keys(data.ips).length
      }))
      .sort((a, b) => b.count - a.count),
    recentRequests: requestDetails.slice(-20)
  };
};

module.exports = requestLogger;