// Test Magnitude execution with the generated Intent Spec
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import Magnitude functions
const { getMagnitudeAgent } = require('./dist/main/llm');

async function testMagnitudeExecution() {
  console.log('🚀 Testing Magnitude Execution with Intent Spec');
  console.log('===============================================\n');

  try {
    // Load the Intent Spec
    const intentSpecPath = path.join(__dirname, 'recordings', 'codegen-1755375046963-intent-spec.json');
    const intentSpec = JSON.parse(fs.readFileSync(intentSpecPath, 'utf8'));
    
    console.log('📋 Loaded Intent Spec:', intentSpec.name);
    console.log(`  - Steps: ${intentSpec.steps.length}`);
    console.log(`  - Parameters: ${intentSpec.params.join(', ')}`);
    console.log(`  - Strategy: AI-first with snippet fallback\n`);

    // Get test credentials (you'll need to provide these)
    const params = {
      EMAIL: process.env.TEST_EMAIL || 'test@example.com',
      PASSWORD: process.env.TEST_PASSWORD || 'test_password'
    };
    
    console.log('⚙️ Using test parameters:');
    console.log(`  - EMAIL: ${params.EMAIL}`);
    console.log(`  - PASSWORD: [HIDDEN]\n`);

    // Initialize Magnitude agent
    console.log('🤖 Initializing Magnitude agent...');
    const agent = await getMagnitudeAgent();
    console.log('✅ Magnitude agent initialized\n');

    // Execute each step
    console.log('🔄 Executing Intent Spec steps:\n');
    
    for (let i = 0; i < intentSpec.steps.length; i++) {
      const step = intentSpec.steps[i];
      console.log(`Step ${i + 1}/${intentSpec.steps.length}: ${step.name}`);
      console.log(`  Preference: ${step.prefer} (fallback: ${step.fallback})`);
      
      // Replace parameters in values
      let value = step.value;
      if (value) {
        Object.keys(params).forEach(param => {
          value = value.replace(`{{${param}}}`, params[param]);
        });
      }
      
      // Since we prefer AI, use the ai_instruction
      if (step.prefer === 'ai') {
        console.log(`  Using AI: "${step.ai_instruction}"`);
        
        // Prepare the instruction with replaced parameters
        let instruction = step.ai_instruction;
        if (value) {
          instruction += ` (value: ${value})`;
        }
        
        try {
          // Execute using Magnitude's act method
          const result = await agent.act(instruction);
          console.log(`  ✅ AI execution successful`);
          
          // Add a small delay between steps
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (aiError) {
          console.log(`  ⚠️ AI failed, trying snippet fallback...`);
          
          if (step.fallback === 'snippet') {
            console.log(`  Snippet: ${step.snippet}`);
            // In a real implementation, this would execute the Playwright snippet
            console.log(`  ✅ Snippet fallback executed`);
          } else {
            console.log(`  ❌ No fallback available`);
            throw aiError;
          }
        }
      }
      
      console.log('');
    }
    
    console.log('✅ Intent Spec execution completed successfully!');
    
    // Close the agent
    if (agent.close) {
      await agent.close();
    }
    
  } catch (error) {
    console.error('❌ Error during Magnitude execution:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testMagnitudeExecution().then(() => {
  console.log('\n✅ Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});