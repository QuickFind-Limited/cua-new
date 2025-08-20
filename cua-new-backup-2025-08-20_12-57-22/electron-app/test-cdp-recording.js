// Test the CDP-based Playwright recording functionality
const { spawn } = require('child_process');
const { PlaywrightCodegenRecorder } = require('./dist/main/playwright-codegen-recorder.js');

async function testCDPRecording() {
    console.log('🎬 Testing CDP-based Playwright Recording...\n');
    
    // First start Electron app with remote debugging
    console.log('1. Starting Electron app with remote debugging...');
    const electronProcess = spawn('npm', ['start'], { 
        cwd: process.cwd(),
        stdio: 'pipe',
        shell: true 
    });
    
    // Wait for Electron to start
    console.log('   Waiting for Electron to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
        const recorder = new PlaywrightCodegenRecorder();
        const sessionId = `cdp-test-${Date.now()}`;
        
        console.log('\n2. Attempting to connect to Electron via CDP...');
        const started = await recorder.startRecording(sessionId, 'https://example.com');
        
        if (!started) {
            console.error('❌ Failed to start CDP recording');
            electronProcess.kill();
            return;
        }
        
        console.log('✅ Successfully connected to Electron via CDP!');
        console.log(`   Session ID: ${sessionId}`);
        console.log('   Recording interactions from WebContentsView tabs...');
        
        // Let it record for a few seconds
        console.log('\n3. Recording for 8 seconds...');
        console.log('   (You can interact with the Electron app now)');
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Stop recording
        console.log('\n4. Stopping CDP recording...');
        const result = await recorder.stopRecording();
        
        if (result) {
            console.log('✅ CDP recording stopped successfully!');
            console.log('\n📁 Generated files:');
            console.log(`   • Recording: ${result.specCode ? 'Generated' : 'Failed'}`);
            console.log(`   • Screenshot: ${result.screenshotPath}`);
            console.log(`   • Metadata: ${result.metadataPath}`);
            
            // Check if files exist
            const fs = require('fs');
            const recordingPath = `recordings/${sessionId}-recording.spec.ts`;
            if (fs.existsSync(recordingPath)) {
                console.log('\n✅ Recording file verified - exists on disk');
                const content = fs.readFileSync(recordingPath, 'utf8');
                console.log(`   File size: ${content.length} bytes`);
                console.log('\n📄 Generated test code preview:');
                console.log(content.substring(0, 300) + '...');
            }
        } else {
            console.error('❌ Failed to stop CDP recording');
        }
        
    } catch (error) {
        console.error('❌ CDP Test failed:', error.message);
    } finally {
        // Clean up
        console.log('\n5. Cleaning up...');
        electronProcess.kill();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// Run the test
testCDPRecording().then(() => {
    console.log('\n🎉 CDP Recording test complete!');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});