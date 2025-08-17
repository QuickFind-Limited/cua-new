import { ScreenshotComparison } from '../flows/types';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Improved ScreenshotComparator with proper image handling
 */
export class ScreenshotComparatorFixed {
  private comparisonCache: Map<string, ScreenshotComparison> = new Map();
  private anthropicClient: Anthropic | null = null;

  private getAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required');
      }
      this.anthropicClient = new Anthropic({ apiKey });
    }
    return this.anthropicClient;
  }

  /**
   * Compare two screenshots with improved handling
   */
  async compareScreenshots(
    actualPath: string,
    expectedPath: string
  ): Promise<ScreenshotComparison> {
    try {
      // Verify files exist
      if (!fs.existsSync(actualPath)) {
        throw new Error(`Actual screenshot not found: ${actualPath}`);
      }
      if (!fs.existsSync(expectedPath)) {
        throw new Error(`Expected screenshot not found: ${expectedPath}`);
      }

      // First, check if images are identical using hash
      const actualHash = this.getFileHash(actualPath);
      const expectedHash = this.getFileHash(expectedPath);
      
      if (actualHash === expectedHash) {
        return {
          match: true,
          similarity: 100,
          suggestions: [],
          differences: []
        };
      }

      // Get file sizes for initial assessment
      const actualSize = fs.statSync(actualPath).size;
      const expectedSize = fs.statSync(expectedPath).size;
      
      // If files are too large for AI comparison, use enhanced basic comparison
      const maxSizeForAI = 500 * 1024; // 500KB per image
      if (actualSize > maxSizeForAI || expectedSize > maxSizeForAI) {
        console.log('Screenshots too large for AI comparison, using enhanced basic analysis');
        return this.performEnhancedBasicComparison(actualPath, expectedPath);
      }

      // Try AI comparison with proper image message format
      try {
        return await this.performProperAIComparison(actualPath, expectedPath);
      } catch (aiError) {
        console.warn('AI comparison failed:', aiError);
        return this.performEnhancedBasicComparison(actualPath, expectedPath);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown comparison error';
      return {
        match: false,
        similarity: 0,
        suggestions: [`Comparison failed: ${errorMessage}`],
        differences: [{ type: 'error', message: errorMessage }]
      };
    }
  }

  /**
   * Perform AI comparison using proper Claude Vision API format
   */
  private async performProperAIComparison(
    actualPath: string,
    expectedPath: string
  ): Promise<ScreenshotComparison> {
    const client = this.getAnthropicClient();
    
    // Read images as base64
    const actualImage = fs.readFileSync(actualPath, 'base64');
    const expectedImage = fs.readFileSync(expectedPath, 'base64');

    // Use proper message format for Claude Vision
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514', // Use Sonnet 4 for vision tasks
      max_tokens: 1500,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Compare these two screenshots and analyze their visual similarity.

Please analyze:
1. Overall visual similarity (0-100%)
2. Key differences in layout, content, or UI elements
3. Whether the current state matches the expected success criteria

Return ONLY valid JSON in this format:
{
  "match": boolean,
  "similarity": number (0-100),
  "differences": [
    {
      "type": "layout|content|element|color|text",
      "description": "Description of the difference",
      "severity": "low|medium|high",
      "location": "Where the difference occurs"
    }
  ],
  "suggestions": ["Specific suggestions for improvement"]
}`
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: actualImage
            }
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: expectedImage
            }
          }
        ]
      }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      const parsed = JSON.parse(content.text);
      return {
        match: parsed.match,
        similarity: parsed.similarity,
        suggestions: parsed.suggestions || [],
        differences: parsed.differences || []
      };
    } catch (parseError) {
      // Try to extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          match: parsed.match,
          similarity: parsed.similarity,
          suggestions: parsed.suggestions || [],
          differences: parsed.differences || []
        };
      }
      throw parseError;
    }
  }

  /**
   * Enhanced basic comparison with more detailed analysis
   */
  private performEnhancedBasicComparison(
    actualPath: string,
    expectedPath: string
  ): ScreenshotComparison {
    const actualStats = fs.statSync(actualPath);
    const expectedStats = fs.statSync(expectedPath);
    
    // Calculate size-based similarity
    const sizeDifference = Math.abs(actualStats.size - expectedStats.size);
    const avgSize = (actualStats.size + expectedStats.size) / 2;
    const sizeSimilarity = Math.max(0, 100 - (sizeDifference / avgSize) * 100);
    
    // Determine match based on thresholds
    const isMatch = sizeSimilarity > 90;
    
    const differences = [];
    const suggestions = [];
    
    if (sizeDifference > 0) {
      const percentDiff = ((sizeDifference / expectedStats.size) * 100).toFixed(1);
      differences.push({
        type: 'content',
        description: `File size differs by ${(sizeDifference / 1024).toFixed(1)}KB (${percentDiff}%)`,
        severity: sizeDifference > expectedStats.size * 0.2 ? 'high' : 
                  sizeDifference > expectedStats.size * 0.1 ? 'medium' : 'low',
        location: 'Overall screenshot'
      });
    }
    
    // Provide intelligent suggestions based on size difference
    if (sizeDifference > expectedStats.size * 0.3) {
      suggestions.push('Significant size difference - the page state may be completely different');
      suggestions.push('Verify that the automation reached the correct page');
      suggestions.push('Check for dynamic content that may have loaded differently');
    } else if (sizeDifference > expectedStats.size * 0.1) {
      suggestions.push('Moderate size difference - some page elements may differ');
      suggestions.push('Check for dynamic content like timestamps, notifications, or user data');
    } else if (sizeDifference > 0) {
      suggestions.push('Minor size difference - likely due to small UI variations');
      suggestions.push('This level of difference is typically acceptable');
    }
    
    // Add suggestions based on file sizes
    if (actualStats.size > 2 * 1024 * 1024) {
      suggestions.push('Consider using viewport screenshots instead of full-page for faster comparison');
    }
    
    return {
      match: isMatch,
      similarity: parseFloat(sizeSimilarity.toFixed(1)),
      suggestions,
      differences
    };
  }

  /**
   * Calculate file hash for exact comparison
   */
  private getFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  /**
   * Clear comparison cache
   */
  clearCache(): void {
    this.comparisonCache.clear();
  }
}