// Test script to trigger analysis
const { analyzeRecording } = require('./main/llm');
const fs = require('fs');
const path = require('path');

async function testAnalysis() {
  try {
    // Read the latest recording
    const recordingPath = path.join(__dirname, 'recordings', 'codegen-1755435784304-recording.spec.ts');
    const recordingData = fs.readFileSync(recordingPath, 'utf8');
    
    console.log('Starting analysis test...');
    
    const result = await analyzeRecording({
      recordingData: recordingData,
      url: 'https://www.google.com/',
      title: 'Recording Test'
    });
    
    console.log('Analysis result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Analysis test failed:', error);
  }
}

// Run the test
testAnalysis();