// Test the answer format normalization

const { normalizeCorrectAnswer } = require('./fix-answer-format');

console.log('Testing Answer Format Normalization:\n');

// Test cases
const testCases = [
  // Multiple choice with numeric indices
  { correctAnswer: 0, type: 'multiple_choice', expected: 'A' },
  { correctAnswer: 1, type: 'multiple_choice', expected: 'B' },
  { correctAnswer: 2, type: 'multiple_choice', expected: 'C' },
  { correctAnswer: 3, type: 'multiple_choice', expected: 'D' },
  { correctAnswer: '0', type: 'multiple_choice', expected: 'A' },
  { correctAnswer: '1', type: 'multiple_choice', expected: 'B' },
  
  // Multiple choice with letters (should stay as-is)
  { correctAnswer: 'A', type: 'multiple_choice', expected: 'A' },
  { correctAnswer: 'B', type: 'multiple_choice', expected: 'B' },
  
  // True/False
  { correctAnswer: 0, type: 'true_false', expected: 'false' },
  { correctAnswer: 1, type: 'true_false', expected: 'true' },
  { correctAnswer: false, type: 'true_false', expected: 'false' },
  { correctAnswer: true, type: 'true_false', expected: 'true' },
  { correctAnswer: 'false', type: 'true_false', expected: 'false' },
  { correctAnswer: 'true', type: 'true_false', expected: 'true' },
];

testCases.forEach(test => {
  const result = normalizeCorrectAnswer(test.correctAnswer, test.type);
  const passed = result === test.expected;
  console.log(`${passed ? '✓' : '✗'} ${test.type}: ${JSON.stringify(test.correctAnswer)} → ${JSON.stringify(result)} (expected: ${JSON.stringify(test.expected)})`);
});

console.log('\nTesting scoring comparison:');
// Simulate scoring
const userAnswer = 'A';
const correctAnswers = [0, '0', 'A'];
correctAnswers.forEach(correct => {
  const normalized = normalizeCorrectAnswer(correct, 'multiple_choice');
  const isCorrect = userAnswer === normalized;
  console.log(`User: "${userAnswer}" vs Correct: ${JSON.stringify(correct)} → Normalized: "${normalized}" → ${isCorrect ? 'CORRECT' : 'WRONG'}`);
});