// Test the Playwright Codegen recording functionality
const { PlaywrightCodegenRecorder } = require('./dist/main/playwright-codegen-recorder.js');

async function testRecording() {
    console.log('🎬 Testing Playwright Codegen Recording...\n');
    
    const recorder = new PlaywrightCodegenRecorder();
    const sessionId = `ui-test-${Date.now()}`;
    
    try {
        // Start recording
        console.log('1. Starting recording session...');
        const started = await recorder.startRecording(sessionId, 'https://example.com');
        
        if (!started) {
            console.error('❌ Failed to start recording');
            return;
        }
        
        console.log('✅ Recording started successfully');
        console.log(`   Session ID: ${sessionId}`);
        
        // Wait a moment for the browser to load
        console.log('\n2. Browser is open - you can interact with it...');
        console.log('   Waiting 5 seconds for demonstration...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Stop recording
        console.log('\n3. Stopping recording...');
        const result = await recorder.stopRecording();
        
        if (result) {
            console.log('✅ Recording stopped successfully');
            console.log('\n📁 Generated files:');
            console.log(`   • Recording: ${result.recordingPath}`);
            console.log(`   • Screenshot: ${result.screenshotPath}`);
            console.log(`   • Metadata: ${result.metadataPath}`);
            console.log(`   • Trace: ${result.tracePath}`);
            
            // Check if files exist
            const fs = require('fs');
            if (fs.existsSync(result.recordingPath)) {
                console.log('\n✅ Recording file verified - exists on disk');
                const content = fs.readFileSync(result.recordingPath, 'utf8');
                console.log(`   File size: ${content.length} bytes`);
            }
        } else {
            console.error('❌ Failed to stop recording');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testRecording().then(() => {
    console.log('\n🎉 Test complete!');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});