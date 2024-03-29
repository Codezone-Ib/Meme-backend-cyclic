import mongoose from 'mongoose';

const scoreSchema = mongoose.Schema({
  score: {
    type: Number,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  loggedInUserName: {
    type: String,
    required: true,
  },
  loggedInUserEmail: {
    type: String,
    required: true,
  },
  facebookHandle: {
    type: String,
    required: false,
  },
  twitterHandle: {
    type: String,
    required: false,
  },
  imageUrl: {
    type: String,
    required: true,
  },
})

const Score = mongoose.model('score', scoreSchema)

export default Score;