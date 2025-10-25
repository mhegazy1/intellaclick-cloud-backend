/**
 * Migration: Fix Class Unique Index
 *
 * Problem:
 * - Old system had unique index on 'code' field alone
 * - This prevented multiple instructors from teaching same course (e.g., BIO101)
 * - This prevented same instructor from teaching same course in different terms
 * - Deleted classes blocked codes forever
 *
 * Solution:
 * - Remove old 'code_1' unique index
 * - Add compound unique index on (instructorId, code, term, section)
 * - Use partial filter to exclude deleted classes
 *
 * Run: node migrations/fix-class-unique-index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  try {
    console.log('🔧 Starting Class Index Migration...\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaquiz');
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const classesCollection = db.collection('classes');

    // Step 1: Check existing indexes
    console.log('📋 Current indexes on classes collection:');
    const existingIndexes = await classesCollection.indexes();
    existingIndexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
    });
    console.log('');

    // Step 2: Check for problematic 'code_1' unique index
    const codeIndex = existingIndexes.find(idx => idx.name === 'code_1');
    if (codeIndex) {
      console.log('⚠️  Found problematic unique index on "code" field');
      console.log('   This index prevents multiple instructors from using same course code');
      console.log('   This index prevents teaching same course in different terms');
      console.log('   This index prevents reusing codes after deletion\n');

      // Drop the bad index
      console.log('🗑️  Dropping old "code_1" unique index...');
      await classesCollection.dropIndex('code_1');
      console.log('✅ Dropped "code_1" index\n');
    } else {
      console.log('ℹ️  No "code_1" index found (may have been removed already)\n');
    }

    // Step 3: Check if new index already exists
    const newIndexName = 'instructor_course_term_section_unique';
    const newIndex = existingIndexes.find(idx => idx.name === newIndexName);

    if (newIndex) {
      console.log('ℹ️  Compound unique index already exists:', newIndexName);
      console.log('   No need to create it again\n');
    } else {
      console.log('➕ Creating new compound unique index...');
      console.log('   Index on: { instructorId, code, term, section }');
      console.log('   Unique: true');
      console.log('   Excludes deleted classes\n');

      await classesCollection.createIndex(
        { instructorId: 1, code: 1, term: 1, section: 1 },
        {
          unique: true,
          partialFilterExpression: { status: { $ne: 'deleted' } },
          name: newIndexName
        }
      );
      console.log('✅ Created new compound unique index\n');
    }

    // Step 4: Verify final state
    console.log('📋 Final indexes on classes collection:');
    const finalIndexes = await classesCollection.indexes();
    finalIndexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key));
      if (idx.unique) {
        console.log(`    (unique: true${idx.partialFilterExpression ? ', partial filter' : ''})`);
      }
    });
    console.log('');

    // Step 5: Check for any duplicate violations
    console.log('🔍 Checking for existing duplicate classes...');
    const duplicates = await classesCollection.aggregate([
      { $match: { status: { $ne: 'deleted' } } },
      {
        $group: {
          _id: {
            instructorId: '$instructorId',
            code: '$code',
            term: '$term',
            section: { $ifNull: ['$section', ''] }
          },
          count: { $sum: 1 },
          classes: { $push: { _id: '$_id', name: '$name' } }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} sets of duplicate classes:`);
      duplicates.forEach((dup, i) => {
        console.log(`\n  ${i + 1}. Instructor: ${dup._id.instructorId}`);
        console.log(`     Code: ${dup._id.code}`);
        console.log(`     Term: ${dup._id.term}`);
        console.log(`     Section: ${dup._id.section || '(none)'}`);
        console.log(`     Classes:`);
        dup.classes.forEach(cls => {
          console.log(`       - ${cls._id}: ${cls.name}`);
        });
      });
      console.log('\n⚠️  Action Required: Manually resolve duplicates before index will work');
      console.log('   Options:');
      console.log('   1. Delete duplicate classes (keep the one with most students)');
      console.log('   2. Change the term or section of duplicate classes');
      console.log('   3. Soft-delete duplicates (set status = "deleted")');
    } else {
      console.log('✅ No duplicate classes found\n');
    }

    console.log('✅ Migration completed successfully!\n');
    console.log('📝 Summary:');
    console.log('   ✓ Removed global unique constraint on "code"');
    console.log('   ✓ Added compound unique constraint (instructorId, code, term, section)');
    console.log('   ✓ Different instructors can now teach same course');
    console.log('   ✓ Same instructor can teach same course in different terms');
    console.log('   ✓ Deleted classes no longer block codes from being reused');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run migration
migrate();
