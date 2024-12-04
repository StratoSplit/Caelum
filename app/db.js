const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://root:NokkikBSFJJp1WvA@capstone.zgone.mongodb.net/?retryWrites=true&w=majority&appName=Capstone';
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectToDatabase() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db('Caelum');
        return db;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

module.exports = connectToDatabase;