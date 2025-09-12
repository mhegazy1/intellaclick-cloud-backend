#!/usr/bin/env node

/**
 * Diagnostic script to analyze instructorId corruption in the database
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Models
const Class = require('../models/Class');
const User = require('../models/User');

async function diagnoseInstructorIds() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB\n');

    // Get all classes
    const allClasses = await Class.find({}).lean();
    console.log(`Total classes in database: ${allClasses.length}`);
    
    // Analyze instructorId values
    const idAnalysis = {};
    const corruptedClasses = [];
    
    for (const cls of allClasses) {
      const idValue = String(cls.instructorId);
      
      if (!idAnalysis[idValue]) {
        idAnalysis[idValue] = {
          count: 0,
          classes: [],
          isValid: mongoose.Types.ObjectId.isValid(idValue) && idValue !== '[object Object]'
        };
      }
      
      idAnalysis[idValue].count++;
      idAnalysis[idValue].classes.push({
        name: cls.name,
        _id: cls._id,
        joinCode: cls.joinCode,
        created: cls.createdAt
      });
      
      if (!idAnalysis[idValue].isValid) {
        corruptedClasses.push(cls);
      }
    }
    
    // Display analysis
    console.log('\n=== INSTRUCTOR ID ANALYSIS ===\n');
    
    for (const [id, data] of Object.entries(idAnalysis)) {
      console.log(`Instructor ID: "${id}"`);
      console.log(`  Valid ObjectId: ${data.isValid ? 'YES' : 'NO ❌'}`);
      console.log(`  Classes: ${data.count}`);
      
      // Try to find the user if valid
      if (data.isValid) {
        try {
          const user = await User.findById(id).select('email firstName lastName role');
          if (user) {
            console.log(`  User: ${user.email} (${user.firstName} ${user.lastName})`);
            console.log(`  Role: ${user.role}`);
          } else {
            console.log(`  User: NOT FOUND IN DATABASE ⚠️`);
          }
        } catch (e) {
          console.log(`  User: Error looking up user`);
        }
      }
      
      console.log(`  Classes:`);
      data.classes.forEach(cls => {
        console.log(`    - ${cls.name} (Code: ${cls.joinCode})`);
      });
      console.log();
    }
    
    // Summary
    console.log('=== SUMMARY ===\n');
    console.log(`Total unique instructor IDs: ${Object.keys(idAnalysis).length}`);
    console.log(`Corrupted classes: ${corruptedClasses.length}`);
    console.log(`Valid classes: ${allClasses.length - corruptedClasses.length}`);
    
    if (corruptedClasses.length > 0) {
      console.log('\n=== ACTION REQUIRED ===');
      console.log(`${corruptedClasses.length} classes have corrupted instructor IDs`);
      console.log('Run fix-instructor-ids.js to repair these classes');
    }
    
  } catch (error) {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the diagnostic
diagnoseInstructorIds();