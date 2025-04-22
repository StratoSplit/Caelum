const express = require('express');
const router = express.Router();
const { validateToken } = require('../middleware/auth');

// Mounts at '/', so use full paths below

// Save Configuration Route
router.post('/save-configuration', validateToken, async (req, res) => {
  const { configName, configData } = req.body;
  const userId = req.user.userId;

  if (!configName || !configData) {
    return res.status(400).json({ error: 'Configuration name and data are required.' });
  }

  try {
    console.log('Saving configuration to database:', { 
      userId, 
      configName, 
      configDataSample: JSON.stringify(configData).substring(0, 100) + '...' 
    });

    await req.app.locals.db.collection('configurations').updateOne(
      { userId, configName },
      {
        $set: {
          userId,
          username: req.user.username,
          configName,
          configData,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    res.status(200).json({ message: 'Configuration saved successfully' });
  } catch (error) {
    console.error('Save configuration error:', error);
    res.status(500).json({ error: 'Failed to save configuration: ' + error.message });
  }
});

// Get list of configurations
router.get('/get-configurations', validateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const configurations = await req.app.locals.db.collection('configurations')
      .find({ userId })
      .project({ configName: 1, _id: 0 })
      .toArray();

    const configNames = configurations.map(config => config.configName);
    console.log('Retrieved configurations:', { userId, count: configNames.length });
    res.json(configNames);
  } catch (error) {
    console.error('Get configurations error:', error);
    res.status(500).json({ error: 'Failed to retrieve configurations' });
  }
});

// Get a specific configuration
router.get('/get-configuration', validateToken, async (req, res) => {
  const userId = req.user.userId;
  const configName = req.query.name;

  if (!configName) {
    return res.status(400).json({ error: 'Configuration name is required' });
  }

  try {
    const configuration = await req.app.locals.db.collection('configurations').findOne(
      { userId, configName },
      { projection: { configData: 1, _id: 0 } }
    );

    if (!configuration) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    console.log('Retrieved configuration:', { userId, configName });
    res.json(configuration.configData);
  } catch (error) {
    console.error('Get configuration error:', error);
    res.status(500).json({ error: 'Failed to retrieve configuration' });
  }
});

// Delete configuration
router.delete('/delete-configuration', validateToken, async (req, res) => {
  const userId = req.user.userId;
  const configName = req.query.name;

  if (!configName) {
    return res.status(400).json({ error: 'Configuration name is required' });
  }

  try {
    const result = await req.app.locals.db.collection('configurations').deleteOne({ userId, configName });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Configuration not found or already deleted' });
    }

    res.status(200).json({ message: 'Configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting configuration:', error);
    res.status(500).json({ error: 'Failed to delete configuration' });
  }
});

// Debug route
router.get('/debug/configurations', async (req, res) => {
  try {
    const configurations = await req.app.locals.db.collection('configurations').find().toArray();
    res.json({
      count: configurations.length,
      configurations
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: 'Error retrieving configurations' });
  }
});

module.exports = router;

