# Database Migration: Fix Class Unique Index

## Problem

The current system has a **critical design flaw** with class code uniqueness:

### Current Issues:
1. **❌ Global unique constraint on `code` field** - Only ONE instructor in the entire system can use "BIO101"
2. **❌ Can't teach same course multiple terms** - Can't create BIO101 for Fall 2024 AND Spring 2025
3. **❌ Deleted classes block codes forever** - Once deleted, "DUM101" can never be used again
4. **❌ Cross-instructor conflicts** - If any instructor creates BIO101, no other instructor can use that code

### Real-World Impact:
```
Instructor A tries to create: BIO101 - Fall 2024
✅ Success

Instructor B tries to create: BIO101 - Spring 2025
❌ ERROR: "Class code 'BIO101' already exists"

Instructor A tries to create: BIO101 - Spring 2025
❌ ERROR: "Class code 'BIO101' already exists" (even though it's their own code!)
```

## Solution

Replace the global unique constraint with a **compound unique index**:

```javascript
{ instructorId: 1, code: 1, term: 1, section: 1 }
```

This allows:
- ✅ Different instructors can teach the same course code
- ✅ Same instructor can teach the same course in different terms
- ✅ Same instructor can teach multiple sections of same course
- ✅ Deleted classes don't block codes from being reused

### Example After Fix:
```
Instructor A: BIO101 - Fall 2024 - Section A  ✅
Instructor A: BIO101 - Fall 2024 - Section B  ✅
Instructor A: BIO101 - Spring 2025 - Section A  ✅
Instructor B: BIO101 - Fall 2024 - Section A  ✅ (different instructor)
Instructor A: Deletes BIO101 Fall 2024 Section A
Instructor A: Creates BIO101 Fall 2024 Section A again ✅ (code not blocked)
```

## Migration Steps

### Step 1: Backup Database (CRITICAL)

**Before running ANY migration, backup your database:**

```bash
# For local MongoDB
mongodump --db=intellaquiz --out=/backup/$(date +%Y%m%d)

# For MongoDB Atlas or remote server
mongodump --uri="mongodb://user:pass@host:port/intellaquiz" --out=/backup/$(date +%Y%m%d)
```

### Step 2: Check Current State

Navigate to backend directory:
```bash
cd /mnt/c/Users/mosta/Documents/intellaquiz/intellaclick-cloud-backend
```

Run migration in **dry-run mode** to see what will change:
```bash
node migrations/fix-class-unique-index.js
```

The script will:
- Show all current indexes
- Identify the problematic `code_1` index
- Check for duplicate classes that might conflict
- NOT make any changes yet (just report)

### Step 3: Review Duplicates

If the migration script finds duplicate classes, you need to resolve them BEFORE proceeding.

**Example output:**
```
⚠️  Found 2 sets of duplicate classes:

  1. Instructor: 68acbd4cf1da2cb91f63b8f0
     Code: DUM101
     Term: Fall 2024
     Section: (none)
     Classes:
       - 68c304636b80a9887068225b: Dummy Class 1
       - 68f8c9d94b167193373df545: Dummy Class 1
```

**How to resolve:**
```javascript
// Option A: Soft delete one of the duplicates (recommended)
db.classes.updateOne(
  { _id: ObjectId("68f8c9d94b167193373df545") },
  { $set: { status: "deleted", deletedAt: new Date() } }
);

// Option B: Change the term or section
db.classes.updateOne(
  { _id: ObjectId("68f8c9d94b167193373df545") },
  { $set: { term: "Spring 2025" } }
);

// Option C: Hard delete (if class has no students)
db.classes.deleteOne({ _id: ObjectId("68f8c9d94b167193373df545") });
```

### Step 4: Run Migration

Once duplicates are resolved, run the migration:

```bash
node migrations/fix-class-unique-index.js
```

**Expected output:**
```
🔧 Starting Class Index Migration...

📡 Connecting to MongoDB...
✅ Connected to MongoDB

📋 Current indexes on classes collection:
  - _id_: {"_id":1}
  - code_1: {"code":1}  ← This will be removed
  - instructorId_1_term_1_status_1: {...}
  - joinCode_1_joinCodeExpiry_1: {...}

⚠️  Found problematic unique index on "code" field
🗑️  Dropping old "code_1" unique index...
✅ Dropped "code_1" index

➕ Creating new compound unique index...
   Index on: { instructorId, code, term, section }
   Unique: true
   Excludes deleted classes

✅ Created new compound unique index

📋 Final indexes on classes collection:
  - _id_: {"_id":1}
  - instructorId_1_term_1_status_1: {...}
  - joinCode_1_joinCodeExpiry_1: {...}
  - instructor_course_term_section_unique: {"instructorId":1,"code":1,"term":1,"section":1}
    (unique: true, partial filter)

✅ No duplicate classes found

✅ Migration completed successfully!
```

### Step 5: Restart Backend

After successful migration, restart the backend server:

```bash
# If using PM2
pm2 restart intellaquiz-backend

# If running with npm
# Stop current process (Ctrl+C) then:
npm start
```

### Step 6: Test

Create a test class to verify the fix:

1. Go to instructor portal: https://instructor.intellaclick.com
2. Create a class with code "TEST101" for "Fall 2024"
3. ✅ Should succeed
4. Create another class with code "TEST101" for "Spring 2025"
5. ✅ Should succeed (different term)
6. Try to create another class with code "TEST101" for "Fall 2024"
7. ❌ Should fail with helpful message: "You already have a class with code 'TEST101' for Fall 2024. Please use a different code, section, or term."

## Rollback (If Needed)

If something goes wrong, restore from backup:

```bash
# Restore entire database
mongorestore --db=intellaquiz /backup/20241025/intellaquiz

# Or restore just the classes collection
mongorestore --db=intellaquiz --collection=classes /backup/20241025/intellaquiz/classes.bson

# Re-create the old index (not recommended, but possible)
db.classes.createIndex({ code: 1 }, { unique: true, name: "code_1" })
```

## Files Modified

1. **`/models/Class.js`** - Updated schema with new compound unique index
2. **`/routes/classes.js`** - Enhanced error handling with helpful messages
3. **`/migrations/fix-class-unique-index.js`** - Migration script

## Production Deployment Checklist

- [ ] Backup production database
- [ ] Run migration on staging environment first
- [ ] Test class creation on staging
- [ ] Schedule maintenance window (migration takes < 1 minute)
- [ ] Run migration on production
- [ ] Verify indexes with `db.classes.getIndexes()`
- [ ] Test class creation on production
- [ ] Monitor error logs for 24 hours
- [ ] Update documentation

## Support

If you encounter issues:

1. **Check MongoDB logs** for detailed error messages
2. **Verify indexes**: Connect to MongoDB and run `db.classes.getIndexes()`
3. **Check for duplicates**: The migration script will identify them
4. **Restore from backup** if needed

## Technical Details

### Old Index (Removed):
```javascript
{
  "name": "code_1",
  "key": { "code": 1 },
  "unique": true
}
```

### New Index (Added):
```javascript
{
  "name": "instructor_course_term_section_unique",
  "key": {
    "instructorId": 1,
    "code": 1,
    "term": 1,
    "section": 1
  },
  "unique": true,
  "partialFilterExpression": {
    "status": { "$ne": "deleted" }
  }
}
```

### Error Messages Before vs After:

**Before:**
```
Error: Failed to create class
(Generic 500 error, no helpful information)
```

**After:**
```
Error: You already have a class with code 'BIO101' for Fall 2024.
Please use a different code, section, or term.
(Specific 400 error with actionable message)
```

## Questions?

Contact: [Your Contact Info]
Last Updated: October 25, 2025
