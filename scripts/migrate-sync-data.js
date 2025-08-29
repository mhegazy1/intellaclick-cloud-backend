#!/usr/bin/env node

/**
 * Migration script to move from in-memory sync storage to MongoDB
 * This can be used to migrate any existing data if the old sync.js was saving to files
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/Question');
const Category = require('../models/Category');
const Quiz = require('../models/Quiz');
const fs = require('fs').promises;
const path = require('path');

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Check if there's any data saved to files from the old system
async function checkForSavedData() {
  const dataPath = path.join(__dirname, '../data');
  
  try {
    const files = await fs.readdir(dataPath);
    const syncFiles = files.filter(f => f.includes('sync') && f.endsWith('.json'));
    
    if (syncFiles.length > 0) {
      console.log(`Found ${syncFiles.length} sync data files:`, syncFiles);
      return syncFiles.map(f => path.join(dataPath, f));
    }
  } catch (error) {
    console.log('No data directory found');
  }
  
  return [];
}

// Migrate data from JSON files to MongoDB
async function migrateFromFiles(files) {
  for (const file of files) {
    try {
      console.log(`\nMigrating from ${file}...`);
      const data = JSON.parse(await fs.readFile(file, 'utf-8'));
      
      // Determine type from filename or data structure
      if (file.includes('question')) {
        await migrateQuestions(data);
      } else if (file.includes('categor')) {
        await migrateCategories(data);
      } else if (file.includes('quiz')) {
        await migrateQuizzes(data);
      }
    } catch (error) {
      console.error(`Error migrating ${file}:`, error);
    }
  }
}

async function migrateQuestions(data) {
  const questions = Array.isArray(data) ? data : Object.values(data);
  console.log(`Migrating ${questions.length} questions...`);
  
  let migrated = 0;
  for (const q of questions) {
    try {
      const existing = await Question.findOne({ syncId: q.id || q.syncId });
      if (!existing) {
        await Question.create({
          ...q,
          syncId: q.id || q.syncId,
          userId: q.userId || mongoose.Types.ObjectId() // Placeholder if no user
        });
        migrated++;
      }
    } catch (error) {
      console.error('Error migrating question:', error.message);
    }
  }
  console.log(`✅ Migrated ${migrated} new questions`);
}

async function migrateCategories(data) {
  const categories = Array.isArray(data) ? data : Object.values(data);
  console.log(`Migrating ${categories.length} categories...`);
  
  let migrated = 0;
  for (const c of categories) {
    try {
      const existing = await Category.findOne({ syncId: c.id || c.syncId });
      if (!existing) {
        await Category.create({
          ...c,
          syncId: c.id || c.syncId,
          userId: c.userId || mongoose.Types.ObjectId() // Placeholder if no user
        });
        migrated++;
      }
    } catch (error) {
      console.error('Error migrating category:', error.message);
    }
  }
  console.log(`✅ Migrated ${migrated} new categories`);
}

async function migrateQuizzes(data) {
  const quizzes = Array.isArray(data) ? data : Object.values(data);
  console.log(`Migrating ${quizzes.length} quizzes...`);
  
  let migrated = 0;
  for (const q of quizzes) {
    try {
      const existing = await Quiz.findOne({ syncId: q.id || q.syncId });
      if (!existing) {
        await Quiz.create({
          ...q,
          syncId: q.id || q.syncId,
          userId: q.userId || mongoose.Types.ObjectId() // Placeholder if no user
        });
        migrated++;
      }
    } catch (error) {
      console.error('Error migrating quiz:', error.message);
    }
  }
  console.log(`✅ Migrated ${migrated} new quizzes`);
}

// Show current stats
async function showStats() {
  const [questions, categories, quizzes] = await Promise.all([
    Question.countDocuments(),
    Category.countDocuments(),
    Quiz.countDocuments()
  ]);
  
  console.log('\n📊 Current MongoDB Stats:');
  console.log(`  Questions: ${questions}`);
  console.log(`  Categories: ${categories}`);
  console.log(`  Quizzes: ${quizzes}`);
}

// Main migration function
async function main() {
  console.log('🚀 IntellaClick Sync Data Migration Tool\n');
  
  await connectDB();
  await showStats();
  
  const files = await checkForSavedData();
  
  if (files.length > 0) {
    console.log('\n⚠️  Found data files from old sync system');
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      readline.question('Do you want to migrate this data? (yes/no): ', resolve);
    });
    
    readline.close();
    
    if (answer.toLowerCase() === 'yes') {
      await migrateFromFiles(files);
    }
  } else {
    console.log('\n✅ No legacy sync data found');
  }
  
  await showStats();
  
  console.log('\n✨ Migration complete!');
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

// Run migration
main();