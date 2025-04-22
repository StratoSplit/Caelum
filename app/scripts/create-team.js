const connectToDatabase = require('../db');

async function createTeam() {
  try {
    // Connect to the database
    const db = await connectToDatabase();
    console.log('Connected to database');
    
    // Define the team data
    const teamData = {
      name: "Alpha",
      channels: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 8],
      createdAt: new Date()
    };
    
    // Check if team already exists
    const existingTeam = await db.collection('teams').findOne({ name: teamData.name });
    
    if (existingTeam) {
      console.log(`Team "${teamData.name}" already exists. Updating channels.`);
      await db.collection('teams').updateOne(
        { name: teamData.name },
        { $set: { channels: teamData.channels } }
      );
      console.log(`Team "${teamData.name}" updated successfully.`);
    } else {
      // Insert the team data
      const result = await db.collection('teams').insertOne(teamData);
      console.log(`Team "${teamData.name}" created successfully with ID: ${result.insertedId}`);
    }
    
    // Display all teams for verification
    const teams = await db.collection('teams').find().toArray();
    console.log('Current teams in database:');
    teams.forEach(team => {
      console.log(`- ${team.name} (ID: ${team._id}): Channels: ${team.channels.join(', ')}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating team:', error);
    process.exit(1);
  }
}

// Execute the function
createTeam();
