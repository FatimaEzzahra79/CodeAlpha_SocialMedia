/**
 * Database seeder
 * Creates 5 sample users, 15 posts, random likes/comments and follow
 * relationships so the feed looks alive on first run.
 *
 * Usage:  npm run seed        (from the backend/ directory)
 *
 * Accounts (documented in README only - never shown in the UI):
 *   user1@test.com ... user5@test.com  /  password123
 *
 * The seeder is idempotent: it clears users and posts before recreating them.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Post = require('./models/Post');

// Deterministic PRNG so repeated seeds produce the same demo data
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2024);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));

const USERS = [
  {
    name: 'Alice Johnson',
    email: 'user1@test.com',
    password: 'password123',
    bio: 'Frontend developer, coffee enthusiast and lifelong learner. ☕',
    avatar: 'https://i.pravatar.cc/150?img=47',
  },
  {
    name: 'Bob Smith',
    email: 'user2@test.com',
    password: 'password123',
    bio: 'Backend engineer. I turn coffee into APIs.',
    avatar: 'https://i.pravatar.cc/150?img=12',
  },
  {
    name: 'Carol Williams',
    email: 'user3@test.com',
    password: 'password123',
    bio: 'Designer who loves clean interfaces and good typography.',
    avatar: 'https://i.pravatar.cc/150?img=32',
  },
  {
    name: 'David Brown',
    email: 'user4@test.com',
    password: 'password123',
    bio: 'Full-stack dev • open source • hiking on weekends 🥾',
    avatar: 'https://i.pravatar.cc/150?img=68',
  },
  {
    name: 'Emma Davis',
    email: 'user5@test.com',
    password: 'password123',
    bio: 'Product manager by day, photographer by night. 📷',
    avatar: 'https://i.pravatar.cc/150?img=45',
  },
];

const POSTS = [
  'Just shipped a new feature and it finally works on the first try. Today is a good day! 🚀',
  'Hot take: writing clean code is a form of kindness to your future self.',
  'Spent the morning refactoring and the afternoon drinking coffee. Balanced.',
  'Learning MongoDB aggregation pipelines and my brain is slowly expanding.',
  'The best debugging tool is still a good night of sleep.',
  'New laptop setup is complete. Productivity +100. 💻',
  'Reminder: you do not need a framework for every project. Sometimes vanilla JS is perfect.',
  'Sunset from the office window was unreal today.',
  'Finally understand JWT authentication. Small wins!',
  'Weekend project: building a tiny social network from scratch. Having so much fun.',
  'CSS grid is criminally underrated. Change my mind.',
  'Read a great article on API design today. Always something new to learn.',
  'My desk plant has survived two weeks. I consider this a major achievement. 🌱',
  'Code review tip: ask questions instead of making demands. It changes everything.',
  'Three months into learning to code and I still get excited when things work. Never lose that feeling.',
];

const IMAGES = [
  'https://picsum.photos/seed/alpha1/600/400',
  'https://picsum.photos/seed/alpha2/600/400',
  'https://picsum.photos/seed/alpha3/600/400',
  'https://picsum.photos/seed/alpha4/600/400',
  'https://picsum.photos/seed/alpha5/600/400',
  'https://picsum.photos/seed/alpha6/600/400',
  'https://picsum.photos/seed/alpha7/600/400',
  'https://picsum.photos/seed/alpha8/600/400',
];

const COMMENT_TEXTS = [
  'This is awesome! 🔥',
  'Love this perspective.',
  'Could not agree more.',
  'Thanks for sharing, really helpful.',
  'Haha, I felt that.',
  'Great work! Keep it up.',
  'This made my day.',
  'So true!',
  'Nice one 👍',
  'Bookmarking this for later.',
];

// Who follows whom (index pairs). Relationships are made bidirectional in arrays.
const FOLLOWS = [
  [0, 1], [0, 2], [0, 3],
  [1, 0], [1, 3], [1, 4],
  [2, 0], [2, 4],
  [3, 0], [3, 1], [3, 4],
  [4, 1], [4, 2], [4, 3],
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // --- 1. Reset collections ---
    await Post.deleteMany({});
    await User.deleteMany({});
    console.log('Cleared existing users and posts');

    // --- 2. Create users (User.create runs the bcrypt pre-save hook) ---
    const users = [];
    for (const data of USERS) {
      users.push(await User.create(data));
    }
    console.log(`Created ${users.length} users (password: password123)`);

    // --- 3. Build posts with likes + comments ---
    const posts = POSTS.map((content, i) => {
      const author = users[i % users.length];
      const ageMinutes = (POSTS.length - i) * 45;
      const createdAt = new Date(Date.now() - ageMinutes * 60 * 1000);

      // Random likes from other users
      const likers = users.filter((u) => String(u._id) !== String(author._id) && rand() < 0.55);
      const likes = likers.map((u) => u._id);

      // 0-3 random comments, always posted after the post itself
      const commentCount = randInt(0, 3);
      const comments = Array.from({ length: commentCount }).map(() => {
        const commenter = pick(users);
        const maxAge = Math.max(2, ageMinutes - 1);
        const createdAt = new Date(Date.now() - randInt(1, maxAge) * 60 * 1000);
        return { author: commenter._id, text: pick(COMMENT_TEXTS), createdAt };
      });

      return {
        author: author._id,
        content,
        // Roughly every third post gets an image
        image: i % 3 === 0 ? IMAGES[i % IMAGES.length] : '',
        likes,
        comments,
        // Stagger post timestamps so the feed order looks natural
        createdAt,
      };
    });

    const created = await Post.insertMany(posts);
    console.log(`Created ${created.length} posts with likes and comments`);

    // --- 4. Follow relationships (keep both sides in sync) ---
    for (const [a, b] of FOLLOWS) {
      const follower = users[a];
      const target = users[b];
      follower.following.addToSet(target._id);
      target.followers.addToSet(follower._id);
    }
    for (const user of users) await user.save();
    console.log(`Created ${FOLLOWS.length} follow relationships`);

    console.log('Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

seed();
