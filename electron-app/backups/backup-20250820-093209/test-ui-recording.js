// Test recording from the running Electron app via CDP
const { PlaywrightCodegenRecorder } = require('./dist/main/playwright-codegen-recorder.js');

async function testUIRecording() {
    console.log('🎬 Testing recording from running Electron app...\n');
    
    try {
        const recorder = new PlaywrightCodegenRecorder();
        const sessionId = `ui-recording-${Date.now()}`;
        
        console.log('1. Connecting to running Electron app via CDP...');
        const started = await recorder.startRecording(sessionId);
        
        if (!started) {
            console.error('❌ Failed to connect to Electron app');
            console.log('   Make sure the Electron app is running with the Record button visible');
            return;
        }
        
        console.log('✅ Connected successfully!');
        console.log('   Now recording from WebContentsView tabs...');
        console.log('   🖱️  You can interact with the Electron app browser tabs now');
        console.log('   📝 Try: navigating, clicking links, filling forms, etc.');
        
        // Record for 15 seconds to give time for interaction
        console.log('\n2. Recording for 15 seconds...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
        // Stop recording
        console.log('\n3. Stopping recording...');
        const result = await recorder.stopRecording();
        
        if (result) {
            console.log('✅ Recording complete!');
            console.log('\n📁 Files generated:');
            console.log(`   • Test file: recordings/${sessionId}-recording.spec.ts`);
            console.log(`   • Screenshot: ${result.screenshotPath}`);
            console.log(`   • Metadata: ${result.metadataPath}`);
            console.log(`   • Trace: recordings/${sessionId}-trace.zip`);
            
            // Show a preview of the recorded test
            const fs = require('fs');
            const recordingPath = `recordings/${sessionId}-recording.spec.ts`;
            if (fs.existsSync(recordingPath)) {
                const content = fs.readFileSync(recordingPath, 'utf8');
                console.log('\n📄 Generated Playwright test preview:');
                console.log('─'.repeat(50));
                console.log(content.substring(0, 400) + '...');
                console.log('─'.repeat(50));
            }
            
            console.log('\n🚀 To replay this recording:');
            console.log(`   npx playwright test recordings/${sessionId}-recording.spec.ts`);
            console.log('\n🔍 To view the trace:');
            console.log(`   npx playwright show-trace recordings/${sessionId}-trace.zip`);
            
        } else {
            console.error('❌ Failed to stop recording');
        }
        
    } catch (error) {
        console.error('❌ Recording test failed:', error.message);
        if (error.message.includes('ECONNREFUSED')) {
            console.log('   💡 Make sure Electron app is running with remote debugging enabled');
        }
    }
}

// Run the test
testUIRecording().then(() => {
    console.log('\n✨ Recording test completed!');
    console.log('   The Electron app should still be running for you to test the UI button');
}).catch(error => {
    console.error('Fatal error:', error);
});