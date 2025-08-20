// Test if Claude Code import works
async function testClaudeCode() {
  try {
    console.log('Testing Claude Code import...');
    const claudeCode = await eval('import("@anthropic-ai/claude-code")');
    console.log('Import successful!');
    console.log('Available exports:', Object.keys(claudeCode));
    
    if (claudeCode.query) {
      console.log('query function is available');
      
      // Test a simple query
      console.log('Testing query function...');
      for await (const message of claudeCode.query({
        prompt: 'Reply with {"status": "ok"}',
        options: { maxTurns: 1 }
      })) {
        if (message.type === 'result' && message.subtype === 'success') {
          console.log('Query result:', message.result);
        }
      }
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testClaudeCode();