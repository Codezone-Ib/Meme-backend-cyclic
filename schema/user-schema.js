import mongoose from 'mongoose';

const userSchema = mongoose.Schema({
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
  isLoggedIn: {
    type: Boolean,
    default: false,
  }
})

const User = mongoose.model('user', userSchema)

export default User;