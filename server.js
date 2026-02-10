require('dotenv').config();
const app = require('./src/app');
const { startCronJobs } = require('./src/jobs/cron');

const PORT = process.env.PORT || 3000;

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`📊 Database: ${process.env.DATABASE_PATH}`);
  
  // Start cron jobs
  startCronJobs();
  
  console.log('✅ Cron jobs initialized');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received');
  server.close(() => {
    console.log('💤 Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION:', err);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = server;