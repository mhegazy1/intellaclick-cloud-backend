/**
 * Shared utility for comparing student answers to correct answers
 * Handles different data types and question formats
 */

/**
 * Compare student answer with correct answer (type-aware)
 *
 * @param {*} studentAnswer - Student's submitted answer
 * @param {*} correctAnswer - Correct answer from question
 * @param {string} questionType - Type of question (multiple_choice, matching, ordering, etc.)
 * @returns {boolean} - True if answers match
 */
function compareAnswers(studentAnswer, correctAnswer, questionType = 'multiple_choice') {
    // Handle null/undefined
    if (studentAnswer === null || studentAnswer === undefined || correctAnswer === null || correctAnswer === undefined) {
        return false;
    }

    // Helper to convert letter to number (A=0, B=1, C=2, D=3, etc.)
    const letterToNumber = (val) => {
        if (typeof val === 'string' && val.length === 1 && /^[A-Z]$/i.test(val)) {
            return val.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, C=2, etc.
        }
        return null;
    };

    // For MCQ/True-False with numeric answers (including 0!)
    if (typeof studentAnswer === 'number' || typeof correctAnswer === 'number') {
        // Convert both to numbers for comparison
        let studentNum = typeof studentAnswer === 'number' ? studentAnswer : parseInt(studentAnswer);
        let correctNum = typeof correctAnswer === 'number' ? correctAnswer : parseInt(correctAnswer);

        // If parseInt failed, try letter-to-number conversion
        if (isNaN(studentNum)) {
            const converted = letterToNumber(studentAnswer);
            if (converted !== null) {
                studentNum = converted;
            }
        }
        if (isNaN(correctNum)) {
            const converted = letterToNumber(correctAnswer);
            if (converted !== null) {
                correctNum = converted;
            }
        }

        if (!isNaN(studentNum) && !isNaN(correctNum)) {
            return studentNum === correctNum;
        }
    }

    // For matching/ordering (objects/arrays) - compare JSON representation
    if (questionType === 'matching' || questionType === 'ordering') {
        try {
            // If they're already objects/arrays, stringify them
            const studentStr = typeof studentAnswer === 'object' ? JSON.stringify(studentAnswer) : studentAnswer;
            const correctStr = typeof correctAnswer === 'object' ? JSON.stringify(correctAnswer) : correctAnswer;
            return studentStr === correctStr;
        } catch (e) {
            console.warn('Error comparing complex answer:', e);
            return false;
        }
    }

    // For string answers (case-insensitive)
    if (typeof studentAnswer === 'string' && typeof correctAnswer === 'string') {
        return studentAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
    }

    // Fallback: string comparison
    return String(studentAnswer).toLowerCase().trim() === String(correctAnswer).toLowerCase().trim();
}

module.exports = {
    compareAnswers
};
