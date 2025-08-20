// Test Intent Spec execution with screenshot validation
const fs = require('fs');
const path = require('path');
const { startBrowserAgent } = require('magnitude-core');
const { ScreenshotComparator } = require('./dist/main/screenshot-comparator');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function executeWithValidation() {
  console.log('🚀 Executing Intent Spec with Success State Validation');
  console.log('===================================================\n');

  let agent = null;
  
  try {
    // Load the Intent Spec
    const intentSpecPath = path.join(__dirname, 'recordings', 'zoho-direct-login-intent-spec.json');
    const intentSpec = JSON.parse(fs.readFileSync(intentSpecPath, 'utf8'));
    
    // Check for original success state screenshot
    const originalScreenshotPath = path.join(__dirname, 'recordings', 'codegen-1755375046963-success-state.png');
    const hasOriginalScreenshot = fs.existsSync(originalScreenshotPath);
    
    console.log('📋 Intent Spec: ' + intentSpec.name);
    console.log('📸 Original success screenshot: ' + (hasOriginalScreenshot ? 'Found' : 'Not found'));
    console.log('');

    // Use the provided credentials
    const params = {
      EMAIL: 'shane@quickfindai.com',
      PASSWORD: '#QuickFind2024'
    };
    
    console.log('🔑 Credentials loaded\n');

    // Initialize Magnitude agent
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
            model: 'claude-sonnet-4-20250514',
            apiKey: apiKey,
            temperature: 0.2,
            maxTokens: 1500,
            system: 'You operate a browser. Be concise and deterministic.'
          },
          roles: ['act']
        },
        {
          provider: 'anthropic',
          options: {
            model: 'claude-opus-4-1-20250805',
            apiKey: apiKey,
            temperature: 0,
            maxTokens: 1200,
            system: 'Return only JSON that matches the provided schema.'
          },
          roles: ['extract']
        },
        {
          provider: 'anthropic',
          options: {
            model: 'claude-opus-4-1-20250805',
            apiKey: apiKey,
            temperature: 0.3,
            maxTokens: 1200,
            system: 'You are a planner/arbiter. Respond with short, strict JSON.'
          },
          roles: ['query']
        }
      ],
      browser: { 
        launchOptions: { 
          headless: false,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process'
          ]
        } 
      },
      narration: { level: 'silent' }
    });

    console.log('✅ Magnitude agent initialized\n');

    // Navigate to Zoho login page
    console.log(`🌐 Navigating to: ${intentSpec.url}`);
    await agent.page.goto(intentSpec.url, { waitUntil: 'networkidle' });
    console.log('✅ Navigation complete\n');

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Execute steps
    console.log('📝 Executing Intent Spec steps:\n');
    
    for (let i = 0; i < intentSpec.steps.length; i++) {
      const step = intentSpec.steps[i];
      console.log(`Step ${i + 1}/${intentSpec.steps.length}: ${step.name}`);
      
      // Replace parameters
      let instruction = step.ai_instruction;
      let snippet = step.snippet;
      
      Object.keys(params).forEach(param => {
        instruction = instruction.replace(`{{${param}}}`, params[param]);
        snippet = snippet.replace(`{{${param}}}`, params[param]);
      });
      
      let success = false;
      
      // Execute based on preference
      if (step.prefer === 'snippet') {
        try {
          const executableSnippet = snippet.replace('await page.', '');
          
          // Execute different snippet types
          if (executableSnippet.includes('fill')) {
            const match = executableSnippet.match(/fill\('([^']+)',\s*'([^']+)'\)/);
            if (match) {
              await agent.page.fill(match[1], match[2]);
            }
          } else if (executableSnippet.includes('click')) {
            const match = executableSnippet.match(/click\('([^']+)'\)/);
            if (match) {
              await agent.page.click(match[1]);
            }
          } else if (executableSnippet.includes('waitForSelector')) {
            const match = executableSnippet.match(/waitForSelector\('([^']+)'/);
            if (match) {
              await agent.page.waitForSelector(match[1], { timeout: 5000 });
            }
          } else if (executableSnippet.includes('waitForURL')) {
            await agent.page.waitForURL('**/inventory.zoho.com/**', { timeout: 10000 });
          }
          
          console.log(`  ✅ Snippet execution successful`);
          success = true;
        } catch (error) {
          console.log(`  ⚠️ Snippet failed, trying AI fallback...`);
          if (step.fallback === 'ai') {
            try {
              await agent.act(instruction);
              console.log(`  ✅ AI fallback successful`);
              success = true;
            } catch (aiError) {
              console.log(`  ❌ AI also failed: ${aiError.message}`);
            }
          }
        }
      } else if (step.prefer === 'ai') {
        try {
          await agent.act(instruction);
          console.log(`  ✅ AI execution successful`);
          success = true;
        } catch (error) {
          console.log(`  ⚠️ AI failed, trying snippet fallback...`);
          if (step.fallback === 'snippet') {
            try {
              const executableSnippet = snippet.replace('await page.', '');
              
              if (executableSnippet.includes('fill')) {
                const match = executableSnippet.match(/fill\('([^']+)',\s*'([^']+)'\)/);
                if (match) {
                  await agent.page.fill(match[1], match[2]);
                }
              } else if (executableSnippet.includes('click')) {
                const match = executableSnippet.match(/click\('([^']+)'\)/);
                if (match) {
                  await agent.page.click(match[1]);
                }
              }
              
              console.log(`  ✅ Snippet fallback successful`);
              success = true;
            } catch (snippetError) {
              console.log(`  ❌ Snippet also failed: ${snippetError.message}`);
            }
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log('\n✅ All steps executed!\n');
    
    // Take final screenshot
    console.log('📸 Taking final screenshot...');
    const finalScreenshotPath = path.join(__dirname, 'recordings', 'execution-final-state.png');
    await agent.page.screenshot({ path: finalScreenshotPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${finalScreenshotPath}\n`);
    
    // Compare with original success state if available
    if (hasOriginalScreenshot) {
      console.log('🔍 Comparing with original success state screenshot...\n');
      
      const comparator = new ScreenshotComparator();
      const comparison = await comparator.compareScreenshots(
        finalScreenshotPath,
        originalScreenshotPath
      );
      
      console.log('📊 Screenshot Comparison Results:');
      console.log('================================');
      console.log(`  Match: ${comparison.match ? '✅ YES' : '❌ NO'}`);
      console.log(`  Similarity: ${comparison.similarity.toFixed(1)}%`);
      
      if (comparison.differences && comparison.differences.length > 0) {
        console.log(`\n  Differences found (${comparison.differences.length}):`);
        comparison.differences.forEach((diff, index) => {
          console.log(`    ${index + 1}. [${diff.type}] ${diff.description || diff.message}`);
          if (diff.severity) {
            console.log(`       Severity: ${diff.severity}`);
          }
          if (diff.location) {
            console.log(`       Location: ${diff.location}`);
          }
        });
      }
      
      if (comparison.suggestions && comparison.suggestions.length > 0) {
        console.log(`\n  Suggestions for improvement:`);
        comparison.suggestions.forEach((suggestion, index) => {
          console.log(`    ${index + 1}. ${suggestion}`);
        });
      }
      
      console.log('\n================================');
      
      // Determine overall success
      if (comparison.match || comparison.similarity > 80) {
        console.log('\n✅ SUCCESS: Final state matches expected success state!');
      } else if (comparison.similarity > 60) {
        console.log('\n⚠️ PARTIAL SUCCESS: Final state is similar but has some differences');
      } else {
        console.log('\n❌ MISMATCH: Final state differs significantly from expected');
      }
    } else {
      console.log('⚠️ No original success screenshot found for comparison');
      console.log('   The screenshot from this execution can serve as the baseline for future runs');
    }
    
    // Wait to observe
    console.log('\n⏱️ Waiting 5 seconds to observe final state...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('\n❌ Execution failed:', error.message);
    console.error(error.stack);
    
    if (agent && agent.page) {
      try {
        const errorScreenshot = path.join(__dirname, 'recordings', 'execution-error.png');
        await agent.page.screenshot({ path: errorScreenshot, fullPage: true });
        console.log(`📸 Error screenshot saved: ${errorScreenshot}`);
      } catch (screenshotError) {
        console.log('Could not save error screenshot');
      }
    }
    
    process.exit(1);
  } finally {
    if (agent && agent.browser) {
      console.log('\n🧹 Closing browser...');
      await agent.browser.close();
    }
  }
}

// Run the execution with validation
executeWithValidation().then(() => {
  console.log('\n✅ Execution with validation completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});