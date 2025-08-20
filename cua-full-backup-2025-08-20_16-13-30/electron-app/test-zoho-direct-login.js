// Test Zoho direct login with Magnitude
const fs = require('fs');
const path = require('path');
const { startBrowserAgent } = require('magnitude-core');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function executeZohoDirectLogin() {
  console.log('🚀 Executing Zoho Direct Login with Magnitude');
  console.log('============================================\n');

  let agent = null;
  
  try {
    // Load the Intent Spec
    const intentSpecPath = path.join(__dirname, 'recordings', 'zoho-direct-login-intent-spec.json');
    const intentSpec = JSON.parse(fs.readFileSync(intentSpecPath, 'utf8'));
    
    console.log('📋 Intent Spec Details:');
    console.log(`  Name: ${intentSpec.name}`);
    console.log(`  Description: ${intentSpec.description}`);
    console.log(`  Steps: ${intentSpec.steps.length}\n`);

    // Use the provided credentials
    const params = {
      EMAIL: 'shane@quickfindai.com',
      PASSWORD: '#QuickFind2024'
    };
    
    console.log('🔑 Credentials:');
    console.log(`  EMAIL: ${params.EMAIL}`);
    console.log(`  PASSWORD: [HIDDEN]\n`);

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
          headless: false, // Show browser
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
            '--disable-web-security',
            '--disable-features=BlockInsecurePrivateNetworkRequests',
            '--disable-features=OutOfBlinkCors'
          ]
        } 
      },
      narration: { level: 'normal' } // Show what's happening
    });

    console.log('✅ Magnitude agent initialized\n');

    // Navigate directly to Zoho login page
    console.log(`🌐 Navigating to: ${intentSpec.url}`);
    await agent.page.goto(intentSpec.url, { waitUntil: 'networkidle' });
    console.log('✅ Navigation complete\n');

    // Wait for page to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Execute each step
    console.log('📝 Executing steps:\n');
    
    for (let i = 0; i < intentSpec.steps.length; i++) {
      const step = intentSpec.steps[i];
      console.log(`Step ${i + 1}/${intentSpec.steps.length}: ${step.name}`);
      console.log(`  Strategy: ${step.prefer} (fallback: ${step.fallback})`);
      
      // Replace parameters in instruction and snippet
      let instruction = step.ai_instruction;
      let snippet = step.snippet;
      
      Object.keys(params).forEach(param => {
        instruction = instruction.replace(`{{${param}}}`, params[param]);
        snippet = snippet.replace(`{{${param}}}`, params[param]);
      });
      
      let success = false;
      
      // Try preferred method first
      if (step.prefer === 'ai') {
        try {
          console.log(`  🤖 AI: "${instruction}"`);
          
          // For password steps, pass the value in the task data
          if (step.name.toLowerCase().includes('password')) {
            await agent.act(instruction, { password: params.PASSWORD });
          } else if (step.value) {
            // Pass any value that might be needed
            await agent.act(instruction, { value: step.value.replace(/\{\{.*?\}\}/g, (match) => {
              const param = match.slice(2, -2);
              return params[param] || match;
            })});
          } else {
            await agent.act(instruction);
          }
          
          console.log(`  ✅ AI execution successful`);
          success = true;
        } catch (aiError) {
          console.log(`  ⚠️ AI failed: ${aiError.message}`);
          
          // Try fallback
          if (step.fallback === 'snippet') {
            try {
              console.log(`  📜 Trying snippet fallback...`);
              const executableSnippet = snippet.replace('await page.', '');
              console.log(`     ${executableSnippet}`);
              
              // Execute the snippet properly
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
          const executableSnippet = snippet.replace('await page.', '');
          
          // Execute the snippet properly
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
        } catch (snippetError) {
          console.log(`  ⚠️ Snippet failed: ${snippetError.message}`);
          
          // Try fallback
          if (step.fallback === 'ai') {
            try {
              console.log(`  🤖 Trying AI fallback...`);
              console.log(`     "${instruction}"`);
              
              // For password steps, pass the value in the task data
              if (step.name.toLowerCase().includes('password')) {
                await agent.act(instruction, { password: params.PASSWORD });
              } else if (step.value) {
                await agent.act(instruction, { value: step.value.replace(/\{\{.*?\}\}/g, (match) => {
                  const param = match.slice(2, -2);
                  return params[param] || match;
                })});
              } else {
                await agent.act(instruction);
              }
              
              console.log(`  ✅ AI fallback successful`);
              success = true;
            } catch (aiError) {
              console.log(`  ❌ AI also failed: ${aiError.message}`);
            }
          }
        }
      }
      
      if (!success) {
        console.log(`  ⚠️ Step ${i + 1} failed but continuing...`);
      }
      
      // Delay between steps
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('');
    }
    
    console.log('✅ Login sequence completed!\n');
    
    // Take a final screenshot
    console.log('📸 Taking final screenshot...');
    const screenshotPath = path.join(__dirname, 'recordings', 'zoho-login-success.png');
    await agent.page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${screenshotPath}\n`);
    
    // Extract some data from the dashboard
    console.log('📊 Attempting to extract dashboard information...');
    try {
      const dashboardInfo = await agent.extract(
        'Extract the user name, organization name, and any visible dashboard statistics',
        {
          userName: 'string',
          organization: 'string',
          stats: 'object'
        }
      );
      console.log('Dashboard info:', dashboardInfo);
    } catch (extractError) {
      console.log('Could not extract dashboard info:', extractError.message);
    }
    
    // Wait to see the final state
    console.log('\n⏱️ Waiting 10 seconds to observe logged-in state...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('\n❌ Execution failed:', error.message);
    console.error(error.stack);
    
    // Try to take error screenshot
    if (agent && agent.page) {
      try {
        const errorScreenshot = path.join(__dirname, 'recordings', 'zoho-login-error.png');
        await agent.page.screenshot({ path: errorScreenshot, fullPage: true });
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
executeZohoDirectLogin().then(() => {
  console.log('✅ Execution completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});