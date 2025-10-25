#!/usr/bin/env python3
import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def make_admin(email):
    try:
        # Connect to MongoDB
        mongo_uri = os.getenv('MONGODB_URI')
        if not mongo_uri:
            print("❌ MONGODB_URI not found in .env file")
            return False

        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        db = client.get_default_database()

        print('Connected to MongoDB\n')

        # Find user
        user = db.users.find_one({'email': email.lower()})

        if not user:
            print(f"❌ User not found with email: {email}")
            print("\nMake sure the user has an instructor account first.")
            return False

        print(f"Found user: {user.get('firstName', '')} {user.get('lastName', '')}")
        print(f"Current role: {user.get('role', 'instructor')}")

        if user.get('role') == 'admin':
            print("\n✅ User is already an admin!")
            return True

        # Update to admin
        result = db.users.update_one(
            {'email': email.lower()},
            {'$set': {'role': 'admin'}}
        )

        if result.modified_count > 0:
            print(f"\n✅ Successfully updated {email} to admin role!")
            print("\nYou can now access the admin panel at:")
            print("https://instructor.intellaclick.com/admin.html")
            return True
        else:
            print("❌ Failed to update user")
            return False

    except Exception as e:
        print(f"Error: {str(e)}")
        return False
    finally:
        if 'client' in locals():
            client.close()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 make-admin.py <email>')
        print('Example: python3 make-admin.py mostafa.afifi77@gmail.com')
        sys.exit(1)

    email = sys.argv[1]
    success = make_admin(email)
    sys.exit(0 if success else 1)
