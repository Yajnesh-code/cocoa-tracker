const { createDailyTransferNotifications } = require('./notificationHelper');

/**
 * Setup daily notification scheduler
 */
function setupNotificationScheduler() {
  // Run daily notifications at 00:00 (midnight)
  const now = new Date();
  const firstRun = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const timeUntilFirstRun = firstRun - now;

  // Schedule first run
  setTimeout(() => {
    console.log('Running daily notification generation...');
    createDailyTransferNotifications();

    // Then run every 24 hours
    setInterval(() => {
      console.log('Running daily notification generation...');
      createDailyTransferNotifications();
    }, 24 * 60 * 60 * 1000);
  }, timeUntilFirstRun);

  console.log(`Notification scheduler initialized. First run in ${Math.round(timeUntilFirstRun / 1000)}s`);
}

module.exports = {
  setupNotificationScheduler,
};
