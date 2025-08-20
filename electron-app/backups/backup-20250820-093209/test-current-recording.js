// Test current recording analysis with Claude Code CLI (Opus 4.1)
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import the analyzeRecording function
const { analyzeRecording } = require('./dist/main/llm');

async function testCurrentRecording() {
  console.log('🔍 Testing Current Recording Analysis with Claude Code CLI (Opus 4.1)');
  console.log('================================================================\n');

  try {
    // Load the most recent recording data
    const recordingPath = path.join(__dirname, 'recordings', 'codegen-1755439863751-recording.spec.ts');
    const metadataPath = path.join(__dirname, 'recordings', 'codegen-1755439863751-metadata.json');
    
    console.log('📁 Loading recording from:', recordingPath);
    const recordingContent = fs.readFileSync(recordingPath, 'utf8');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    console.log('📊 Recording metadata:');
    console.log(`  - Session ID: ${metadata.sessionId}`);
    console.log(`  - Duration: ${metadata.duration}ms`);
    console.log(`  - Start URL: ${metadata.url}`);
    console.log(`  - Type: ${metadata.type}\n`);

    // Use the recording content directly as it's already a Playwright spec
    const recordingData = recordingContent;

    console.log('🤖 Sending recording to Claude Code CLI for analysis...\n');
    console.log('Using model: claude-opus-4-1-20250805 (via Claude Code SDK)\n');
    
    // Analyze the recording
    const startTime = Date.now();
    const intentSpec = await analyzeRecording(recordingData);
    const analysisTime = Date.now() - startTime;
    
    console.log('✅ Analysis completed in', analysisTime, 'ms\n');
    console.log('📝 Generated Intent Spec:');
    console.log('=' .repeat(60));
    console.log(JSON.stringify(intentSpec, null, 2));
    console.log('=' .repeat(60));
    
    // Save the intent spec
    const outputPath = path.join(__dirname, 'recordings', `${metadata.sessionId}-intent-spec.json`);
    fs.writeFileSync(outputPath, JSON.stringify(intentSpec, null, 2));
    console.log('\n💾 Intent Spec saved to:', outputPath);
    
    // Validate the generated spec
    console.log('\n🔍 Validating generated Intent Spec:');
    if (intentSpec.name && intentSpec.url && intentSpec.steps && intentSpec.steps.length > 0) {
      console.log('✅ Valid Intent Spec structure');
      console.log(`  - Name: ${intentSpec.name}`);
      console.log(`  - URL: ${intentSpec.url}`);
      console.log(`  - Steps: ${intentSpec.steps.length}`);
      console.log(`  - Parameters: ${intentSpec.params ? intentSpec.params.length : 0}`);
    } else {
      console.log('❌ Invalid Intent Spec structure');
    }
    
  } catch (error) {
    console.error('❌ Error during recording analysis:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testCurrentRecording().then(() => {
  console.log('\n✅ Test completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});