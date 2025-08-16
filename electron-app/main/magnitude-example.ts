import { MagnitudeExecutor } from './magnitude-executor';
import { IntentSpec } from '../flows/types';

/**
 * Example usage of the Magnitude execution system
 */

// Example Intent Spec for a login flow
const loginFlowSpec: IntentSpec = {
  name: "Login Flow Example",
  description: "Automated login process with data extraction",
  startUrl: "https://example.com/login",
  params: ["username", "password"],
  steps: [
    {
      action: "type",
      target: "#username",
      value: "{{username}}",
      description: "Enter username"
    },
    {
      action: "type", 
      target: "#password",
      value: "{{password}}",
      description: "Enter password"
    },
    {
      action: "click",
      target: "#login-button",
      value: "",
      description: "Click login button"
    },
    {
      action: "wait",
      target: ".dashboard",
      value: "5000",
      description: "Wait for dashboard to load",
      // Example extraction
      extract: "Extract user profile information including name, email, and role"
    } as any
  ],
  successCheck: "Dashboard loaded successfully",
  metadata: {
    version: "1.0",
    author: "Magnitude System",
    tags: ["authentication", "login"],
    category: "user-management"
  }
};

// Example search flow with dynamic data extraction
const searchFlowSpec: IntentSpec = {
  name: "Product Search Flow",
  description: "Search for products and extract results",
  startUrl: "https://example-store.com",
  params: ["searchTerm", "category"],
  steps: [
    {
      action: "type",
      target: "#search-input",
      value: "{{searchTerm}}",
      description: "Enter search term"
    },
    {
      action: "select",
      target: "#category-filter",
      value: "{{category}}",
      description: "Select category filter"
    },
    {
      action: "click",
      target: "#search-button",
      value: "",
      description: "Execute search"
    },
    {
      action: "wait",
      target: ".search-results",
      value: "3000",
      description: "Wait for search results",
      extract: "Extract all product information including names, prices, ratings, and availability"
    } as any,
    {
      action: "scroll",
      target: "page",
      value: "0,500",
      description: "Scroll to load more results"
    },
    {
      action: "screenshot",
      target: "",
      value: "search-results",
      description: "Capture search results"
    }
  ],
  successCheck: "Search results displayed",
  metadata: {
    version: "1.0",
    tags: ["e-commerce", "search", "data-extraction"],
    category: "product-discovery"
  }
};

/**
 * Example function to execute a flow
 */
export async function executeLoginFlow() {
  const executor = new MagnitudeExecutor({
    headless: false,
    timeout: 30000,
    saveScreenshots: true,
    saveFlow: true
  });

  // Listen for progress updates
  executor.on('progress', (progress) => {
    console.log(`Step ${progress.stepIndex + 1}/${progress.totalSteps}: ${progress.status}`);
    if (progress.extractedData) {
      console.log('Extracted data:', progress.extractedData);
    }
  });

  const variables = {
    username: "demo@example.com",
    password: "demopassword"
  };

  try {
    const result = await executor.executeFlow(loginFlowSpec, variables, {
      retries: 2,
      saveFlow: true
    });

    console.log('Flow execution completed:', result);
    return result;
  } catch (error) {
    console.error('Flow execution failed:', error);
    throw error;
  }
}

/**
 * Example function to execute search flow with data extraction
 */
export async function executeSearchFlow() {
  const executor = new MagnitudeExecutor({
    headless: false,
    saveScreenshots: true
  });

  const variables = {
    searchTerm: "wireless headphones",
    category: "electronics"
  };

  try {
    const result = await executor.executeFlow(searchFlowSpec, variables);
    
    console.log('Search completed successfully');
    console.log('Extracted product data:', result.data);
    console.log('Screenshots saved:', result.screenshots);
    
    return result;
  } catch (error) {
    console.error('Search flow failed:', error);
    throw error;
  }
}

/**
 * Example function to demonstrate flow management
 */
export async function demonstrateFlowManagement() {
  const executor = new MagnitudeExecutor();
  
  // Execute and save a flow
  const result = await executor.executeFlow(loginFlowSpec, {
    username: "user@example.com",
    password: "password123"
  }, {
    saveFlow: true
  });

  // Access the flow storage
  const storage = (executor as any).flowStorage;
  
  // List all saved flows
  const savedFlows = await storage.listFlows();
  console.log(`Found ${savedFlows.length} saved flows`);

  // Get statistics for a specific flow
  if (savedFlows.length > 0) {
    const flowStats = await storage.getFlowStats(savedFlows[0].id);
    console.log('Flow statistics:', flowStats);
  }

  // Export a flow for sharing
  if (savedFlows.length > 0) {
    const exportData = await storage.exportFlow(savedFlows[0].id);
    console.log('Flow exported:', exportData?.substring(0, 200) + '...');
  }

  return { result, savedFlows };
}

/**
 * Example of handling execution errors and retries
 */
export async function demonstrateErrorHandling() {
  const executor = new MagnitudeExecutor({
    headless: false,
    timeout: 10000 // Shorter timeout to trigger potential errors
  });

  // Intentionally problematic flow for demonstration
  const problematicFlow: IntentSpec = {
    name: "Error Handling Demo",
    startUrl: "https://httpstat.us/500", // Returns 500 error
    steps: [
      {
        action: "click",
        target: "#non-existent-element",
        value: "",
        description: "Try to click non-existent element"
      }
    ],
    successCheck: "Page loaded successfully"
  };

  try {
    const result = await executor.executeFlow(problematicFlow, {}, {
      retries: 3,
      saveFlow: true // Save even failed flows for analysis
    });

    console.log('Unexpected success:', result);
  } catch (error) {
    console.log('Expected error caught:', error);
    
    // Access logs for debugging
    const logs = executor.getLogs();
    console.log('Execution logs:');
    logs.forEach(log => {
      console.log(`[${log.level}] ${log.message}`);
    });

    // Access metrics for performance analysis
    const metrics = executor.getMetrics();
    console.log('Execution metrics:', metrics);
  }
}

// Export example functions for use in other modules
export {
  loginFlowSpec,
  searchFlowSpec
};