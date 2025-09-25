// Fix for PowerPoint answer format mismatch
// This converts numeric indices to letters for proper scoring

// Function to convert numeric index to letter
function indexToLetter(index) {
  if (typeof index === 'number') {
    return String.fromCharCode(65 + index); // 0 -> 'A', 1 -> 'B', etc.
  }
  return index; // Return as-is if not a number
}

// Function to normalize answer format
function normalizeCorrectAnswer(correctAnswer, questionType, options) {
  // For multiple choice questions
  if (questionType === 'multiple_choice' || questionType === 'multiple-choice') {
    // If it's a numeric index, just return it as-is
    // We'll handle the comparison logic in the results endpoint
    if (typeof correctAnswer === 'number' || /^\d+$/.test(correctAnswer)) {
      return parseInt(correctAnswer);
    }
  }
  
  // For true/false, ensure boolean format
  if (questionType === 'true_false' || questionType === 'true-false') {
    if (correctAnswer === 0 || correctAnswer === '0' || correctAnswer === false) {
      return 'false';
    }
    if (correctAnswer === 1 || correctAnswer === '1' || correctAnswer === true) {
      return 'true';
    }
  }
  
  return correctAnswer;
}

module.exports = { normalizeCorrectAnswer, indexToLetter };