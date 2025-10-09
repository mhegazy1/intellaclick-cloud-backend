#!/usr/bin/env node

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Configuration
const API_BASE_URL = process.env.API_URL || 'https://api.intellaclick.com/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-auth-token-here';

console.log('=== TIMER UPDATE DEBUGGING TOOL ===\n');

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/intellaquiz', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✓ Connected to MongoDB');
    } catch (error) {
        console.error('✗ MongoDB connection failed:', error.message);
        process.exit(1);
    }
}

async function createTestSession() {
    try {
        console.log('\n1. Creating test session...');
        
        const sessionCode = 'TIMER' + Math.floor(Math.random() * 1000);
        const response = await axios.post(`${API_BASE_URL}/sessions/test`, {
            sessionCode,
            title: 'Timer Update Test',
            requireLogin: false
        });
        
        console.log(`   ✓ Session created: ${sessionCode}`);
        console.log(`   ID: ${response.data.session.id}`);
        
        return response.data.session;
    } catch (error) {
        console.error('   ✗ Failed to create session:', error.response?.data || error.message);
        throw error;
    }
}

async function sendQuestion(sessionId, token) {
    try {
        console.log('\n2. Sending question to session...');
        
        const questionData = {
            questionId: 'Q' + Date.now(),
            questionText: 'Test question for timer update',
            questionType: 'multiple_choice',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctAnswer: '1',
            points: 10,
            timeLimit: 30 // Initial 30 seconds
        };
        
        const response = await axios.post(
            `${API_BASE_URL}/sessions/${sessionId}/questions`,
            questionData,
            { headers: { 'x-auth-token': token } }
        );
        
        console.log(`   ✓ Question sent successfully`);
        console.log(`   Question ID: ${questionData.questionId}`);
        console.log(`   Initial time limit: ${questionData.timeLimit}s`);
        
        return questionData.questionId;
    } catch (error) {
        console.error('   ✗ Failed to send question:', error.response?.data || error.message);
        throw error;
    }
}

async function checkCurrentQuestion(sessionCode) {
    try {
        console.log(`\n3. Checking current question (student view)...`);
        
        const response = await axios.get(
            `${API_BASE_URL}/sessions/code/${sessionCode}/current-question`
        );
        
        const question = response.data.question;
        if (question) {
            console.log(`   ✓ Current question found`);
            console.log(`   Question: ${question.questionText}`);
            console.log(`   Time limit: ${question.timeLimit}s`);
            console.log(`   Started at: ${question.startedAt}`);
            return question.timeLimit;
        } else {
            console.log('   ✗ No current question found');
            return null;
        }
    } catch (error) {
        console.error('   ✗ Failed to get current question:', error.response?.data || error.message);
        throw error;
    }
}

async function updateTimer(sessionId, questionId, addSeconds, token) {
    try {
        console.log(`\n4. Updating timer (adding ${addSeconds} seconds)...`);
        
        const response = await axios.post(
            `${API_BASE_URL}/sessions/${sessionId}/questions/${questionId}/timer`,
            { addSeconds },
            { headers: { 'x-auth-token': token } }
        );
        
        console.log(`   ✓ Timer update request sent`);
        console.log(`   Response:`, response.data);
        
        return response.data.newTimeLimit;
    } catch (error) {
        console.error('   ✗ Failed to update timer:', error.response?.data || error.message);
        
        // Check if it's a 404 - endpoint not found
        if (error.response?.status === 404) {
            console.error('   ! Timer endpoint not found. The desktop app may not be calling the correct URL.');
        }
        
        throw error;
    }
}

async function checkDatabaseDirectly(sessionId) {
    try {
        console.log('\n5. Checking database directly...');
        
        const Session = require('./models/Session');
        const session = await Session.findById(sessionId);
        
        if (session && session.currentQuestion) {
            console.log(`   ✓ Session found in database`);
            console.log(`   Current question time limit in DB: ${session.currentQuestion.timeLimit}s`);
            return session.currentQuestion.timeLimit;
        } else {
            console.log('   ✗ Session or current question not found in DB');
            return null;
        }
    } catch (error) {
        console.error('   ✗ Database check failed:', error.message);
        throw error;
    }
}

async function simulateStudentPolling(sessionCode, iterations = 5) {
    console.log(`\n6. Simulating student polling (${iterations} iterations)...`);
    
    for (let i = 0; i < iterations; i++) {
        try {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            
            const response = await axios.get(
                `${API_BASE_URL}/sessions/code/${sessionCode}/current-question`
            );
            
            const timeLimit = response.data.question?.timeLimit;
            console.log(`   Poll ${i + 1}: Time limit = ${timeLimit}s`);
        } catch (error) {
            console.error(`   Poll ${i + 1} failed:`, error.message);
        }
    }
}

async function runFullDebug() {
    try {
        // Connect to database
        await connectDB();
        
        // Create test session
        const session = await createTestSession();
        
        // For testing, we'll use a simple auth token
        // In production, you'd need to login first
        console.log('\n⚠️  Note: You need to set AUTH_TOKEN environment variable');
        console.log('   Get it by logging in via the API or from the desktop app');
        
        if (!AUTH_TOKEN || AUTH_TOKEN === 'your-auth-token-here') {
            console.log('\n✗ No auth token provided. Simulating without authentication...');
            
            // Try to get an auth token by creating a test user
            console.log('\nCreating test instructor account...');
            try {
                const authResponse = await axios.post(`${API_BASE_URL}/auth/register`, {
                    email: `test${Date.now()}@example.com`,
                    password: 'testpass123',
                    firstName: 'Test',
                    lastName: 'Instructor',
                    role: 'instructor'
                });
                
                const token = authResponse.data.token;
                console.log('   ✓ Test account created and authenticated');
                
                // Continue with the test using the new token
                await runTestWithToken(session, token);
            } catch (authError) {
                console.error('   ✗ Failed to create test account:', authError.response?.data || authError.message);
                console.log('\nSkipping authenticated tests...');
            }
        } else {
            await runTestWithToken(session, AUTH_TOKEN);
        }
        
    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB');
    }
}

async function runTestWithToken(session, token) {
    // Send question
    const questionId = await sendQuestion(session.id, token);
    
    // Check initial state
    const initialTime = await checkCurrentQuestion(session.sessionCode);
    console.log(`\n   Initial time limit: ${initialTime}s`);
    
    // Update timer
    const addSeconds = 15;
    const newTimeLimit = await updateTimer(session.id, questionId, addSeconds, token);
    
    // Check if update was applied
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    const updatedTime = await checkCurrentQuestion(session.sessionCode);
    console.log(`\n   Time limit after update: ${updatedTime}s`);
    console.log(`   Expected: ${initialTime + addSeconds}s`);
    
    if (updatedTime === initialTime + addSeconds) {
        console.log('   ✓ Timer update successful!');
    } else {
        console.log('   ✗ Timer update failed - value not updated');
    }
    
    // Check database directly
    const dbTime = await checkDatabaseDirectly(session.id);
    
    // Simulate student polling
    await simulateStudentPolling(session.sessionCode, 3);
    
    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Initial time: ${initialTime}s`);
    console.log(`Added: ${addSeconds}s`);
    console.log(`Expected: ${initialTime + addSeconds}s`);
    console.log(`API reports: ${updatedTime}s`);
    console.log(`Database shows: ${dbTime}s`);
    
    if (updatedTime === initialTime + addSeconds && dbTime === initialTime + addSeconds) {
        console.log('\n✓ Timer update is working correctly!');
        console.log('  The issue might be in the desktop app not calling the endpoint.');
    } else {
        console.log('\n✗ Timer update has issues:');
        if (updatedTime !== initialTime + addSeconds) {
            console.log('  - API is not returning updated value');
        }
        if (dbTime !== initialTime + addSeconds) {
            console.log('  - Database is not storing updated value');
        }
    }
}

// Run the debug tool
runFullDebug().catch(console.error);