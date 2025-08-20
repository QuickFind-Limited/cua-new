/**
 * Simple validator for generated Playwright code
 */

import { promises as fs } from 'fs';
import * as path from 'path';

async function validateGeneratedCode(): Promise<void> {
  const recordingsDir = path.join(process.cwd(), 'recordings');
  
  try {
    const files = await fs.readdir(recordingsDir);
    const specFiles = files.filter(f => f.endsWith('.spec.ts') && f.includes('test-'));
    
    console.log(`🔍 Validating ${specFiles.length} generated spec files...`);
    
    for (const specFile of specFiles) {
      const filePath = path.join(recordingsDir, specFile);
      console.log(`\n📄 Validating: ${specFile}`);
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        
        // Check for required imports
        const hasPlaywrightImport = content.includes("import { test, expect } from '@playwright/test'");
        console.log(`  ✅ Playwright import: ${hasPlaywrightImport ? 'OK' : 'MISSING'}`);
        
        // Check for test function
        const hasTestFunction = /test\s*\(\s*['"][^'"]*['"],\s*async\s*\(\s*{\s*page\s*}\s*\)\s*=>\s*{/.test(content);
        console.log(`  ✅ Test function: ${hasTestFunction ? 'OK' : 'MISSING'}`);
        
        // Check for page.goto
        const hasGoto = content.includes('page.goto');
        console.log(`  ✅ Navigation: ${hasGoto ? 'OK' : 'MISSING'}`);
        
        // Check for assertions
        const hasAssertions = content.includes('expect(page)');
        console.log(`  ✅ Assertions: ${hasAssertions ? 'OK' : 'MISSING'}`);
        
        // Check for proper test closure
        const testStartMatch = content.match(/test\s*\(/);
        if (testStartMatch) {
          const testStart = testStartMatch.index || 0;
          const afterTest = content.substring(testStart);
          const braceCount = (afterTest.match(/{/g) || []).length - (afterTest.match(/}/g) || []).length;
          console.log(`  ✅ Test closure: ${braceCount === 0 ? 'OK' : 'UNBALANCED BRACES'}`);
        }
        
        // Try to eval the TypeScript (basic syntax check)
        try {
          // Simple regex-based syntax validation
          const hasSyntaxErrors = content.includes('SyntaxError') || 
                                 content.includes('undefined') ||
                                 /await\s+(?!page|expect)/.test(content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''));
          
          console.log(`  ✅ Basic syntax: ${hasSyntaxErrors ? 'ISSUES DETECTED' : 'OK'}`);
        } catch (error) {
          console.log(`  ❌ Syntax validation error: ${error}`);
        }
        
        console.log(`  📊 File size: ${content.length} characters`);
        
      } catch (error) {
        console.log(`  ❌ Error reading file: ${error}`);
      }
    }
    
    console.log(`\n✅ Validation complete for ${specFiles.length} files`);
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
  }
}

// Run validation
if (require.main === module) {
  validateGeneratedCode().catch(console.error);
}

export { validateGeneratedCode };