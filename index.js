import { MongoClient } from 'mongodb';
import Connection from './database/db.js';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';
import http from 'http';
import multer from 'multer';
import {v2 as cloudinary} from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { fileURLToPath } from 'url';
import path from 'path';
import moment from 'moment';
import { createWorker } from 'tesseract.js';
import morgan from 'morgan';
import Score from './schema/score-schema.js';
import User from './schema/user-schema.js';

const app = express();
const server = http.createServer(app);

dotenv.config();

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(morgan('dev'));

const username = process.env.DB_USERNAME;
const password = process.env.DB_PASSWORD;

Connection(username, password);

app.use(express.static('public'));

const generatePublicId = (req, file) => {
  // Get the original file extension
  let ext = path.extname(file.originalname);

  // Generate a unique identifier using the current timestamp and original file name
  let id = moment().format('YYYYMMDDHHmmss') + '-' + file.originalname.replace(ext, '');

  // Return the id with the file extension
  return id + ext;
};

cloudinary.config({
  cloud_name: 'dxa2sfens',
  api_key: '295943939133844',
  api_secret: 'LUSVVlTSqStuyg4P9--54-UAQRk'
});

// Configure cloudinary storage for multer-storage-cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'meme',
    public_id: generatePublicId,
  },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parser = multer({ storage: storage });

// Inside the /upload route handler
app.post('/upload', parser.single('image'), async function (req, res) {
  try {
    // Check if file is uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Initialize Tesseract.js worker
    const worker = await createWorker('eng', 1, {
      logger: m => console.log(m), // Optional: log progress and errors
      langPath: path.join(__dirname, 'public'),
      corePath: path.join(__dirname, 'public/tesseract-core-simd.wasm'),
    });
    console.log('Resolved path to wasm file:', path.join(__dirname, 'public/tesseract-core-simd.wasm'));


    // Extract text from the uploaded image
    const { data: { text } } = await worker.recognize(req.file.path);
    
    console.log('Extracted text:', text);

    const scoreMatch = text.match(/SCORE (\d+)/);
    if (!scoreMatch) {
      console.error('No score found in the extracted text');
      return res.status(400).json({ error: 'No score found in the extracted text' });
    }

    const score = parseInt(scoreMatch[1]);
    if (isNaN(score)) {
      console.error('Invalid score extracted');
      return res.status(400).json({ error: 'Invalid score extracted' });
    }

    console.log('Score:', score);

    const { loggedInUserEmail } = req.body;
        
    const existingScore = await Score.findOne({ score, loggedInUserEmail });
    if (existingScore) {
      return res.status(400).json({ error: 'Score already exists. Please try the game again and score differently.' });
    }

    console.log('Existing Score:', existingScore);

    const imageUrl = req.file.path;

    res.json({ text, score, imageUrl });

    // Terminate worker after extraction
    await worker.terminate();
  } catch (error) {
    console.error('Error extracting text:', error);
    res.status(500).json({ error: 'Failed to extract text from image' });
  }
});

app.post('/save-score', async function (req, res) {
  const { score, loggedInUserName, loggedInUserEmail, twitterHandle, facebookHandle, imageUrl  } = req.body;

  if (!score) {
    return res.status(400).json({ error: 'Score is required' });
  }
  if (!loggedInUserEmail) {
    return res.status(400).json({ error: 'loggedInUserEmail is required' });
  }
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required' });
  }

  try {

    const existingScore = await Score.findOne({ score, loggedInUserEmail });
    if (existingScore) {
      return res.status(400).json({ error: 'This score has already been uploaded' });
    }

    console.log('Existing Score:', existingScore);

    const newScore = new Score({
      score: score,
      loggedInUserName: loggedInUserName,
      loggedInUserEmail: loggedInUserEmail,
      twitterHandle: twitterHandle,
      facebookHandle: facebookHandle,
      imageUrl: imageUrl,
      timestamp: new Date(),
    });

    await newScore.save();
    console.log('Score saved successfully');
    res.json({ message: 'Score saved successfully' });
  } catch (dbError) {
    console.error('Error saving score to database:', dbError);
    res.status(500).json({ error: 'Failed to save score to database' });
  }
});

app.get('/leaderboard', async (req, res) => {
  try {
    const topScores = await Score.find({})
      .sort({ score: -1 }) // Sort scores in descending order
      .limit(10); // Limit to top 10 scores
    res.json(topScores);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.post('/adduser', async (req, res) => {
  try {
    const { loggedInUserName, loggedInUserEmail, facebookHandle, twitterHandle } = req.body;

    // Check if handles are provided in the request
    if (facebookHandle || twitterHandle) {
      // If handles are provided, update the user or create if it doesn't exist
      const updatedUser = await User.findOneAndUpdate(
        { loggedInUserEmail },
        { $set: { loggedInUserName, facebookHandle, twitterHandle } },
        { new: true, upsert: true }
      );
    } else {
      // If no handles are provided, check if the user exists
      const existingUser = await User.findOne({ loggedInUserEmail });
      if (existingUser) {
        // If user exists and no handles are provided, return a message indicating user already exists
        return res.status(201).json({ message: 'User already exists' });
      }
      
      // If user doesn't exist and no handles are provided, create a new user
      const newUser = new User({
        loggedInUserName,
        loggedInUserEmail,
        // Other user properties as needed
      });
      await newUser.save();
    }

    // Send a success response
    res.status(200).json({ message: 'User created/updated successfully' });
  } catch (error) {
    // Handle any errors
    console.error('Error creating/updating user:', error);
    res.status(500).json({ error: 'Failed to create/update user' });
  }
});

// // Example protected route
// app.get('/protected', ensureAuthenticated, (req, res) => {
//   res.send('Authenticated user: ' + req.user.username);
// });

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Internal Server Error');
});

server.listen(5000, () => {
  console.log('Server is running on port 5000');
});