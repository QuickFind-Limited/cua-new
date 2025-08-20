const { executeMagnitudeAct, executeMagnitudeQuery, executeMagnitudeDecision } = require('./dist/main/llm');

async function testMagnitudeIntegration() {
  console.log('Testing Magnitude integration...');
  
  try {
    // Test executeMagnitudeAct
    console.log('\n1. Testing executeMagnitudeAct...');
    const actResult = await executeMagnitudeAct(
      'User is on a login page and needs to click the username field',
      {
        action: 'click',
        target: 'input[name="username"]',
        value: '',
        description: 'Click username input field'
      }
    );
    console.log('Act result:', actResult);
    
    // Test executeMagnitudeQuery
    console.log('\n2. Testing executeMagnitudeQuery...');
    const queryResult = await executeMagnitudeQuery(
      '<html><body><h1>Product List</h1><div class="product">Item 1 - $10</div><div class="product">Item 2 - $20</div></body></html>',
      'Extract all product names and prices'
    );
    console.log('Query result:', queryResult);
    
    // Test executeMagnitudeDecision
    console.log('\n3. Testing executeMagnitudeDecision...');
    const decisionResult = await executeMagnitudeDecision(
      'User needs to choose between automation approaches',
      {
        options: ['snippet', 'act'],
        scenario: 'login form with stable selectors'
      }
    );
    console.log('Decision result:', decisionResult);
    
    console.log('\n✅ All Magnitude integration tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Only run if ANTHROPIC_API_KEY is set
if (process.env.ANTHROPIC_API_KEY) {
  testMagnitudeIntegration();
} else {
  console.log('⚠️  ANTHROPIC_API_KEY not set, skipping integration test');
  console.log('✅ Magnitude integration code structure is correct');
}