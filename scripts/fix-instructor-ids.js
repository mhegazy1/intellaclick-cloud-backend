#!/usr/bin/env node

/**
 * Migration script to fix instructorId stored as "[object Object]"
 * This script will assign all corrupted classes to the specified instructor
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Models
const Class = require('../models/Class');

// The instructor ID to assign corrupted classes to
const INSTRUCTOR_ID = '68acbd4cf1da2cb91f63b8f0';

async function fixInstructorIds() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Find all classes with corrupted instructorId
    console.log('\nSearching for classes with corrupted instructorId...');
    
    // First, let's see what we're dealing with
    const allClasses = await Class.find({}).select('name instructorId joinCode');
    console.log(`Total classes in database: ${allClasses.length}`);
    
    // Check for corrupted IDs
    const corruptedClasses = [];
    const validClasses = [];
    
    for (const cls of allClasses) {
      // Check if instructorId is a valid ObjectId
      const idString = cls.instructorId ? cls.instructorId.toString() : '';
      
      if (!idString || idString === '[object Object]' || !mongoose.Types.ObjectId.isValid(idString)) {
        corruptedClasses.push(cls);
      } else {
        validClasses.push(cls);
      }
    }
    
    console.log(`\nFound ${corruptedClasses.length} classes with corrupted instructorId`);
    console.log(`Found ${validClasses.length} classes with valid instructorId`);
    
    if (corruptedClasses.length === 0) {
      console.log('\nNo corrupted classes found. Nothing to fix!');
      process.exit(0);
    }
    
    // Display corrupted classes
    console.log('\nCorrupted classes:');
    corruptedClasses.forEach(cls => {
      console.log(`  - ${cls.name} (ID: ${cls._id}, Join Code: ${cls.joinCode}, Instructor: "${cls.instructorId}")`);
    });
    
    // Ask for confirmation
    console.log(`\nThis will update ${corruptedClasses.length} classes to have instructorId: ${INSTRUCTOR_ID}`);
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Update corrupted classes
    console.log('\nUpdating classes...');
    
    for (const cls of corruptedClasses) {
      try {
        await Class.updateOne(
          { _id: cls._id },
          { $set: { instructorId: INSTRUCTOR_ID } }
        );
        console.log(`  ✓ Updated: ${cls.name}`);
      } catch (error) {
        console.error(`  ✗ Failed to update ${cls.name}:`, error.message);
      }
    }
    
    // Verify the fix
    console.log('\nVerifying fix...');
    const afterFix = await Class.find({ instructorId: INSTRUCTOR_ID }).count();
    console.log(`Classes now owned by instructor ${INSTRUCTOR_ID}: ${afterFix}`);
    
    console.log('\nMigration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the migration
fixInstructorIds();