// Worker process for Claude Code SDK (ES module)
// This runs in a separate Node.js process to handle ES module imports

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

// Handle messages from parent process
process.on('message', async (message) => {
  if (message.type === 'analyze') {
    try {
      // Dynamic import of ES module
      const { query } = await import('@anthropic-ai/claude-code');
      
      let result = '';
      // Use Claude Code SDK with Opus 4.1 (default)
      for await (const msg of query({
        prompt: message.prompt,
        options: {
          maxTurns: 1
        }
      })) {
        if (msg.type === 'result' && msg.subtype === 'success') {
          result = msg.result;
        }
      }
      
      // Send result back to parent
      process.send({
        type: 'result',
        success: true,
        data: result
      });
    } catch (error) {
      process.send({
        type: 'result',
        success: false,
        error: error.message
      });
    }
  }
});

// Send ready signal
process.send({ type: 'ready' });