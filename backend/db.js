import mongoose from 'mongoose';
import dotenv from 'dotenv';

const uri = dotenv.config().parsed.MONGODB_URI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => {
    console.log("Connected to the database!");
    })
.catch((err) => {
    console.log("Cannot connect to the database!", err);
    process.exit();
})

const logInSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}, { collection: 'authentication' });


const LogIn = mongoose.model('LogIn', logInSchema);

export default LogIn;
