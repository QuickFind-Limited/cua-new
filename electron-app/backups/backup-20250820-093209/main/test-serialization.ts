/**
 * Test file to demonstrate the recording serialization functionality
 * This can be used to test the serialization without running the full application
 */

import { serializeRecording } from './recording-serializer';
import { generateIntentSpecPrompt, generateSimpleIntentSpecPrompt } from './intent-spec-prompt';

// Example Playwright recording data (simulated)
const sampleRecording = [
  {
    type: 'navigate',
    url: 'https://example.com/login',
    timestamp: Date.now(),
    frameUrl: 'https://example.com/login'
  },
  {
    type: 'click',
    target: {
      selector: '#username-field',
      placeholder: 'Email',
      tagName: 'input',
      attributes: { type: 'email', id: 'username-field' }
    },
    timestamp: Date.now() + 1000,
    htmlContext: '<input type="email" id="username-field" placeholder="Email" class="form-input" />'
  },
  {
    type: 'type',
    target: {
      selector: '#username-field',
      placeholder: 'Email',
      tagName: 'input'
    },
    value: 'user@example.com',
    timestamp: Date.now() + 2000,
    htmlContext: '<input type="email" id="username-field" placeholder="Email" class="form-input" />'
  },
  {
    type: 'click',
    target: {
      selector: '#password-field',
      placeholder: 'Password',
      tagName: 'input',
      attributes: { type: 'password', id: 'password-field' }
    },
    timestamp: Date.now() + 3000
  },
  {
    type: 'type',
    target: {
      selector: '#password-field',
      placeholder: 'Password',
      tagName: 'input',
      attributes: { type: 'password' }
    },
    value: 'mypassword123',
    timestamp: Date.now() + 4000
  },
  {
    type: 'click',
    target: {
      selector: '#login-button',
      text: 'Sign In',
      tagName: 'button'
    },
    timestamp: Date.now() + 5000,
    htmlContext: '<button id="login-button" class="btn btn-primary">Sign In</button>'
  },
  {
    type: 'navigate',
    url: 'https://example.com/dashboard',
    navigationUrl: 'https://example.com/dashboard',
    timestamp: Date.now() + 6000
  }
];

/**
 * Test function to demonstrate serialization
 */
export function testSerialization(): void {
  console.log('='.repeat(60));
  console.log('Testing Recording Serialization');
  console.log('='.repeat(60));
  
  // Test serialization
  const serialized = serializeRecording(sampleRecording);
  console.log('\nSerialized Recording:');
  console.log('-'.repeat(40));
  console.log(serialized);
  
  // Test prompt generation
  console.log('\n' + '='.repeat(60));
  console.log('Testing Prompt Generation');
  console.log('='.repeat(60));
  
  const detailedPrompt = generateIntentSpecPrompt(serialized);
  console.log('\nDetailed Analysis Prompt (first 500 chars):');
  console.log('-'.repeat(40));
  console.log(detailedPrompt.substring(0, 500) + '...');
  
  const simplePrompt = generateSimpleIntentSpecPrompt(serialized);
  console.log('\nSimple Analysis Prompt (first 300 chars):');
  console.log('-'.repeat(40));
  console.log(simplePrompt.substring(0, 300) + '...');
  
  console.log('\n' + '='.repeat(60));
  console.log('Test completed successfully!');
  console.log('='.repeat(60));
}

/**
 * Example of expected Intent Spec output
 */
export const expectedIntentSpec = {
  "name": "User Login Flow",
  "description": "Authenticates a user by entering credentials and logging into the application",
  "url": "https://example.com/login",
  "params": ["EMAIL", "PASSWORD"],
  "steps": [
    {
      "action": "click",
      "selector": "#username-field",
      "value": "",
      "description": "Focus on the email input field"
    },
    {
      "action": "type",
      "selector": "#username-field",
      "value": "{{EMAIL}}",
      "description": "Enter the user's email address"
    },
    {
      "action": "click",
      "selector": "#password-field",
      "value": "",
      "description": "Focus on the password input field"
    },
    {
      "action": "type",
      "selector": "#password-field",
      "value": "{{PASSWORD}}",
      "description": "Enter the user's password"
    },
    {
      "action": "click",
      "selector": "#login-button",
      "value": "",
      "description": "Click the login button to submit credentials"
    }
  ],
  "successCheck": ".dashboard-welcome",
  "assertions": [
    {
      "type": "url_contains",
      "selector": "/dashboard",
      "expected": "/dashboard",
      "description": "Verify successful navigation to dashboard"
    }
  ]
};

// If this file is run directly, execute the test
if (require.main === module) {
  testSerialization();
}