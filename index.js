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
  console.log('Resolved path to wasm file:', path.join(__dirname, 'public/tesseract-core-simd.wasm'));

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

      // First, try to find the score after "SCORE"
      let scoreMatch;
      let score;
      let gameName;

      if (scoreMatch = text.match(/SCORE (\d+)/)) {
        score = parseInt(scoreMatch[1]);
        gameName = "Gun Smoke";
      } else if(scoreMatch = text.match(/CORE-(\d+)/)) {
        score = parseInt(scoreMatch[1]);
        gameName = "Castlevania";
      } else if(scoreMatch = text.match(/CORE=(\d+)/)){
        score = parseInt(scoreMatch[1]);
        gameName = "Castlevania";
      } else if(scoreMatch = text.match(/ip (\d+)/)){
        score = parseInt(scoreMatch[1]);
        gameName = "Contra";
      } else if(scoreMatch = text.match(/1p (\d+)/)){
        score = parseInt(scoreMatch[1]);
        gameName = "Contra";
      }
      else {
        // If no match is found after trying both patterns, handle it accordingly
        console.error('No score found in the extracted text');
        return res.status(400).json({ error: 'No score found in the extracted text' });
      }

      if (score === null || isNaN(score)) {
          console.error('Score not found or invalid');
          return res.status(400).json({ error: 'Score not found or invalid' });
      }

      console.log('Score:', score);

      const { loggedInUserEmail } = req.body;

      const existingScore = await Score.findOne({ score, loggedInUserEmail });
      if (existingScore) {
          return res.status(400).json({ error: 'Score already exists. Please try the game again and score differently.' });
      }

      console.log('Existing Score:', existingScore);

      const imageUrl = req.file.path;

      res.json({ text, score, gameName,imageUrl });

      // Terminate worker after extraction
      await worker.terminate();
  } catch (error) {
      console.error('Error extracting text:', error);
      res.status(500).json({ error: 'Failed to extract text from image' });
  }
});


app.post('/save-score', async function (req, res) {
  const { score, gameName, loggedInUserName, loggedInUserEmail, twitterHandle, facebookHandle, imageUrl } = req.body;

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
      // Check if a Score object with the same loggedInUserEmail exists
      let existingScore = await Score.findOne({ gameName ,loggedInUserEmail });

      if (existingScore) {
          // Update existing Score object
          existingScore.score = score;
          existingScore.gameName = gameName;
          existingScore.loggedInUserName = loggedInUserName;
          existingScore.twitterHandle = twitterHandle;
          existingScore.facebookHandle = facebookHandle;
          existingScore.imageUrl = imageUrl;
          existingScore.timestamp = new Date();
          await existingScore.save();
          console.log('Existing Score updated:', existingScore);
          return res.json({ message: 'Score updated successfully' });
      }

      // If no existing score found, create a new Score object
      const newScore = new Score({
          score,
          gameName,
          loggedInUserName,
          loggedInUserEmail,
          twitterHandle,
          facebookHandle,
          imageUrl,
          timestamp: new Date(),
      });

      await newScore.save();
      console.log('New Score created:', newScore);
      return res.json({ message: 'Score saved successfully' });

  } catch (dbError) {
      console.error('Error saving score to database:', dbError);
      return res.status(500).json({ error: 'Failed to save score to database' });
  }
});

app.get('/leaderboard', async (req, res) => {
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // Calculate the date two days ago

    // Find scores uploaded less than two days ago
    const topScoresContra = await Score.find({ gameName: 'Contra', timestamp: { $gte: twoDaysAgo } })
      .sort({ score: -1 })
      .limit(2);

    const topScoresGunSmoke = await Score.find({ gameName: 'Gun Smoke', timestamp: { $gte: twoDaysAgo } })
      .sort({ score: -1 })
      .limit(2);

    const topScoresCastlevania = await Score.find({ gameName: 'Castlevania', timestamp: { $gte: twoDaysAgo } })
      .sort({ score: -1 })
      .limit(2);

    const topScores = {
      Contra: topScoresContra,
      'Gun Smoke': topScoresGunSmoke,
      Castlevania: topScoresCastlevania,
    };

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

app.post('/login', async (req, res) => {
  const { loggedInUserEmail } = req.body;
  await User.findOneAndUpdate(
    { loggedInUserEmail },
    { $set: { isLoggedIn: true } }
  );
  res.status(200).json({ message: 'User login status updated' });
});

app.post('/logout', async (req, res) => {
  const { loggedInUserEmail } = req.body;
  await User.findOneAndUpdate(
    { loggedInUserEmail },
    { $set: { isLoggedIn: false } }
  );
  res.status(200).json({ message: 'User logout status updated' });
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