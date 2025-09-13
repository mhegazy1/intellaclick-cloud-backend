/**
 * Safe migration script to fix classes with instructorId stored as "[object Object]"
 * This script specifically targets the known user ID from the diagnostic
 */

const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaclick', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    const Class = require('../models/Class');
    const User = require('../models/User');

    // The known user ID from the diagnostic
    const KNOWN_USER_ID = '68acbd4cf1da2cb91f63b8f0';
    
    // Verify the user exists
    const user = await User.findById(KNOWN_USER_ID);
    if (!user) {
      console.error('ERROR: Known user not found!');
      process.exit(1);
    }
    
    console.log(`\nFound user: ${user.email} (${user.firstName} ${user.lastName})`);

    // Find all classes with problematic instructorId
    const problemClasses = await Class.find({
      instructorId: '[object Object]'
    });

    console.log(`\nFound ${problemClasses.length} classes with "[object Object]" as instructorId`);

    if (problemClasses.length === 0) {
      console.log('No classes need fixing!');
      process.exit(0);
    }

    // Display the classes that will be fixed
    console.log('\nClasses to be fixed:');
    problemClasses.forEach(cls => {
      console.log(`  - ${cls.name} (${cls.code}${cls.section ? '-' + cls.section : ''}) - ${cls.term}`);
      console.log(`    Created: ${cls.createdAt.toISOString()}`);
    });

    // Ask for confirmation
    const answer = await question(`\nDo you want to assign these ${problemClasses.length} classes to ${user.email}? (yes/no): `);
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('Migration cancelled.');
      process.exit(0);
    }

    // Fix the classes
    let fixed = 0;
    let errors = 0;

    for (const classDoc of problemClasses) {
      try {
        classDoc.instructorId = mongoose.Types.ObjectId(KNOWN_USER_ID);
        await classDoc.save();
        console.log(`✓ Fixed: ${classDoc.name}`);
        fixed++;
      } catch (error) {
        console.error(`✗ Error fixing ${classDoc.name}:`, error.message);
        errors++;
      }
    }

    console.log('\n=== MIGRATION COMPLETE ===');
    console.log(`Total classes processed: ${problemClasses.length}`);
    console.log(`Successfully fixed: ${fixed}`);
    console.log(`Errors: ${errors}`);

    // Verify the fix
    const stillBroken = await Class.countDocuments({
      instructorId: '[object Object]'
    });
    
    if (stillBroken === 0) {
      console.log('\n✓ All "[object Object]" instructorId issues have been resolved!');
    } else {
      console.log(`\n⚠️  Warning: ${stillBroken} classes still have "[object Object]" as instructorId`);
    }

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    rl.close();
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the migration
main().catch(console.error);