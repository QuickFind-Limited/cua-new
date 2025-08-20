// Test the complete codegen recording and analysis flow
const { PlaywrightCodegenRecorder } = require('./dist/main/playwright-codegen-recorder');
const { analyzeRecording } = require('./dist/main/llm');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function testCodegenFlow() {
  console.log('🧪 Testing Codegen Recording → Analysis Flow');
  console.log('='.repeat(60));
  
  const recorder = new PlaywrightCodegenRecorder();
  
  try {
    // Step 1: Start recording
    console.log('\n📹 Step 1: Starting codegen recording...');
    const sessionId = `test-codegen-${Date.now()}`;
    const startSuccess = await recorder.startRecording(sessionId, 'https://www.google.com');
    
    if (!startSuccess) {
      throw new Error('Failed to start codegen recording');
    }
    console.log('✅ Recording started with session ID:', sessionId);
    
    // Step 2: Wait a bit (simulating user actions)
    console.log('\n⏳ Step 2: Simulating recording time (3 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Stop recording and get spec code
    console.log('\n🛑 Step 3: Stopping recording and generating spec code...');
    const result = await recorder.stopRecording();
    
    if (!result) {
      throw new Error('Failed to stop recording or generate spec code');
    }
    
    console.log('✅ Recording stopped successfully');
    console.log('📝 Generated files:');
    console.log('  - Spec file:', result.session.specFilePath);
    console.log('  - Screenshot:', result.screenshotPath);
    console.log('  - Metadata:', result.metadataPath);
    
    // Step 4: Verify spec code was generated
    console.log('\n🔍 Step 4: Verifying spec code...');
    if (!result.specCode) {
      throw new Error('No spec code generated');
    }
    
    console.log('✅ Spec code generated, length:', result.specCode.length);
    console.log('\nSpec code preview (first 500 chars):');
    console.log(result.specCode.substring(0, 500));
    
    // Step 5: Analyze the spec code
    console.log('\n🤖 Step 5: Analyzing spec code with Claude...');
    const intentSpec = await analyzeRecording(result.specCode);
    
    console.log('✅ Analysis complete!');
    console.log('\n📋 Generated Intent Spec:');
    console.log(JSON.stringify(intentSpec, null, 2));
    
    // Step 6: Verify Intent Spec has expected structure
    console.log('\n✔️ Step 6: Validating Intent Spec structure...');
    const validations = [
      { field: 'name', exists: !!intentSpec.name },
      { field: 'url', exists: !!intentSpec.url },
      { field: 'steps', exists: Array.isArray(intentSpec.steps) },
      { field: 'params', exists: Array.isArray(intentSpec.params) },
    ];
    
    validations.forEach(v => {
      console.log(`  ${v.exists ? '✅' : '❌'} ${v.field}: ${v.exists ? 'Present' : 'Missing'}`);
    });
    
    // Check for variables/params
    if (intentSpec.params && intentSpec.params.length > 0) {
      console.log('\n🔧 Detected Variables:');
      intentSpec.params.forEach(param => {
        console.log(`  - ${param}`);
      });
    } else {
      console.log('\n⚠️ No variables detected in Intent Spec');
    }
    
    // Save the Intent Spec
    const outputPath = path.join(__dirname, 'recordings', `${sessionId}-intent-spec.json`);
    fs.writeFileSync(outputPath, JSON.stringify(intentSpec, null, 2));
    console.log('\n💾 Intent Spec saved to:', outputPath);
    
    console.log('\n✅ TEST PASSED: Codegen recording → Analysis flow works correctly!');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await recorder.dispose();
  }
}

// Run the test
testCodegenFlow().then(() => {
  console.log('\n🎉 All tests completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('\n💥 Test suite failed:', error);
  process.exit(1);
});