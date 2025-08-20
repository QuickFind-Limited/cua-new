// Test Intent Spec execution with proper Magnitude integration
const fs = require('fs');
const path = require('path');
const { startBrowserAgent } = require('magnitude-core');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function executeIntentSpecWithMagnitude() {
  console.log('🚀 Executing Intent Spec with Magnitude');
  console.log('========================================\n');

  let agent = null;
  
  try {
    // Load the Intent Spec
    const intentSpecPath = path.join(__dirname, 'recordings', 'codegen-1755375046963-intent-spec.json');
    const intentSpec = JSON.parse(fs.readFileSync(intentSpecPath, 'utf8'));
    
    console.log('📋 Intent Spec Details:');
    console.log(`  Name: ${intentSpec.name}`);
    console.log(`  Description: ${intentSpec.description}`);
    console.log(`  Steps: ${intentSpec.steps.length}`);
    console.log(`  Parameters: ${intentSpec.params.join(', ')}\n`);

    // Get credentials from environment or use test values
    const params = {
      EMAIL: process.env.ZOHO_EMAIL || 'your_email@example.com',
      PASSWORD: process.env.ZOHO_PASSWORD || 'your_password'
    };
    
    console.log('🔑 Parameters:');
    console.log(`  EMAIL: ${params.EMAIL}`);
    console.log(`  PASSWORD: [HIDDEN]\n`);

    if (params.EMAIL === 'your_email@example.com') {
      console.log('⚠️  Warning: Using default test credentials.');
      console.log('   Set ZOHO_EMAIL and ZOHO_PASSWORD environment variables for real testing.\n');
    }

    // Initialize Magnitude agent with proper configuration
    console.log('🤖 Initializing Magnitude browser agent...');
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    agent = await startBrowserAgent({
      llm: [
        {
          provider: 'anthropic',
          options: {
            model: 'claude-sonnet-4-20250514', // Sonnet 4 for act
            apiKey: apiKey,
            temperature: 0.2,
            maxTokens: 1500,
            system: 'You operate a browser. Be concise, deterministic, and prefer role/label selectors.'
          },
          roles: ['act']
        },
        {
          provider: 'anthropic',
          options: {
            model: 'claude-opus-4-1-20250805', // Opus 4.1 for extract
            apiKey: apiKey,
            temperature: 0,
            maxTokens: 1200,
            system: 'Return only JSON that matches the provided schema. No extra text.'
          },
          roles: ['extract']
        },
        {
          provider: 'anthropic',
          options: {
            model: 'claude-opus-4-1-20250805', // Opus 4.1 for query
            apiKey: apiKey,
            temperature: 0.3,
            maxTokens: 1200,
            system: 'You are a planner/arbiter. Respond with short, strict JSON when asked.'
          },
          roles: ['query']
        }
      ],
      browser: { 
        launchOptions: { 
          headless: false // Show browser for debugging
        } 
      },
      narration: { level: 'normal' } // Show what's happening
    });

    console.log('✅ Magnitude agent initialized\n');

    // Navigate to the starting URL
    console.log(`🌐 Navigating to: ${intentSpec.url}`);
    await agent.page.goto(intentSpec.url);
    console.log('✅ Navigation complete\n');

    // Execute each step
    console.log('📝 Executing steps:\n');
    
    for (let i = 0; i < intentSpec.steps.length; i++) {
      const step = intentSpec.steps[i];
      console.log(`Step ${i + 1}/${intentSpec.steps.length}: ${step.name}`);
      console.log(`  Strategy: ${step.prefer} (fallback: ${step.fallback})`);
      
      // Replace parameters in instruction and snippet
      let instruction = step.ai_instruction;
      let snippet = step.snippet;
      
      if (step.value) {
        Object.keys(params).forEach(param => {
          if (step.value.includes(`{{${param}}}`)) {
            instruction = instruction.replace(`{{${param}}}`, params[param]);
            snippet = snippet.replace(`{{${param}}}`, params[param]);
          }
        });
      }
      
      let success = false;
      
      // Try preferred method first
      if (step.prefer === 'ai') {
        try {
          console.log(`  🤖 AI: "${instruction}"`);
          await agent.act(instruction);
          console.log(`  ✅ AI execution successful`);
          success = true;
        } catch (aiError) {
          console.log(`  ⚠️ AI failed: ${aiError.message}`);
          
          // Try fallback if available
          if (step.fallback === 'snippet') {
            try {
              console.log(`  📜 Trying snippet fallback...`);
              // Execute the Playwright snippet directly on the page
              const executableSnippet = snippet.replace('await page.', 'await agent.page.');
              console.log(`     ${executableSnippet}`);
              await eval(executableSnippet);
              console.log(`  ✅ Snippet fallback successful`);
              success = true;
            } catch (snippetError) {
              console.log(`  ❌ Snippet also failed: ${snippetError.message}`);
            }
          }
        }
      } else if (step.prefer === 'snippet') {
        try {
          console.log(`  📜 Snippet: ${snippet}`);
          const executableSnippet = snippet.replace('await page.', 'await agent.page.');
          await eval(executableSnippet);
          console.log(`  ✅ Snippet execution successful`);
          success = true;
        } catch (snippetError) {
          console.log(`  ⚠️ Snippet failed: ${snippetError.message}`);
          
          // Try fallback if available
          if (step.fallback === 'ai') {
            try {
              console.log(`  🤖 Trying AI fallback...`);
              console.log(`     "${instruction}"`);
              await agent.act(instruction);
              console.log(`  ✅ AI fallback successful`);
              success = true;
            } catch (aiError) {
              console.log(`  ❌ AI also failed: ${aiError.message}`);
            }
          }
        }
      }
      
      if (!success) {
        throw new Error(`Step ${i + 1} failed: ${step.name}`);
      }
      
      // Small delay between steps for stability
      await new Promise(resolve => setTimeout(resolve, 1500));
      console.log('');
    }
    
    console.log('✅ All steps executed successfully!\n');
    
    // Take a final screenshot
    console.log('📸 Taking final screenshot...');
    const screenshotPath = path.join(__dirname, 'recordings', `${intentSpec.name.replace(/\s+/g, '-')}-success.png`);
    await agent.page.screenshot({ path: screenshotPath });
    console.log(`✅ Screenshot saved: ${screenshotPath}\n`);
    
    // Wait a bit to see the final state
    console.log('⏱️ Waiting 5 seconds to observe final state...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('\n❌ Execution failed:', error.message);
    console.error(error.stack);
    
    // Try to take error screenshot
    if (agent && agent.page) {
      try {
        const errorScreenshot = path.join(__dirname, 'recordings', 'execution-error.png');
        await agent.page.screenshot({ path: errorScreenshot });
        console.log(`📸 Error screenshot saved: ${errorScreenshot}`);
      } catch (screenshotError) {
        console.log('Could not save error screenshot');
      }
    }
    
    process.exit(1);
  } finally {
    // Clean up
    if (agent && agent.browser) {
      console.log('🧹 Closing browser...');
      await agent.browser.close();
    }
  }
}

// Run the execution
executeIntentSpecWithMagnitude().then(() => {
  console.log('✅ Execution completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});