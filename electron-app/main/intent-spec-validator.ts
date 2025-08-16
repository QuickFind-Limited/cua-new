import { IntentSpec, IntentStep, IntentSpecValidationResult } from '../flows/types';

/**
 * Validates an Intent Spec JSON object for completeness and correctness
 */
export function validateIntentSpec(spec: any): IntentSpecValidationResult {
  const result: IntentSpecValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    details: {
      name: [],
      url: [],
      params: [],
      steps: []
    }
  };

  // Validate required fields
  if (!spec) {
    result.errors.push('Intent Spec is null or undefined');
    result.valid = false;
    return result;
  }

  // Validate name
  if (!spec.name) {
    result.errors.push('Missing required field: name');
    result.details!.name!.push('Name is required');
    result.valid = false;
  } else if (typeof spec.name !== 'string') {
    result.errors.push('Field "name" must be a string');
    result.details!.name!.push('Name must be a string');
    result.valid = false;
  } else if (spec.name.trim().length === 0) {
    result.errors.push('Field "name" cannot be empty');
    result.details!.name!.push('Name cannot be empty');
    result.valid = false;
  }

  // Validate url (check both url and startUrl fields for backward compatibility)
  const urlField = spec.url || spec.startUrl;
  if (!urlField) {
    result.errors.push('Missing required field: url or startUrl');
    result.details!.url!.push('URL is required');
    result.valid = false;
  } else if (typeof urlField !== 'string') {
    result.errors.push('Field "url/startUrl" must be a string');
    result.details!.url!.push('URL must be a string');
    result.valid = false;
  } else {
    try {
      new URL(urlField);
    } catch {
      result.errors.push('Field "url/startUrl" must be a valid URL');
      result.details!.url!.push('URL must be a valid URL format');
      result.valid = false;
    }
  }

  // Validate params (optional)
  if (spec.params !== undefined) {
    if (!Array.isArray(spec.params)) {
      result.errors.push('Field "params" must be an array');
      result.details!.params!.push('Params must be an array');
      result.valid = false;
    } else {
      for (let i = 0; i < spec.params.length; i++) {
        if (typeof spec.params[i] !== 'string') {
          result.errors.push(`Parameter at index ${i} must be a string`);
          result.details!.params!.push(`Parameter ${i} must be a string`);
          result.valid = false;
        } else if (spec.params[i].trim().length === 0) {
          result.errors.push(`Parameter at index ${i} cannot be empty`);
          result.details!.params!.push(`Parameter ${i} cannot be empty`);
          result.valid = false;
        }
      }

      // Check for duplicate params
      const paramSet = new Set(spec.params);
      if (paramSet.size !== spec.params.length) {
        result.errors.push('Duplicate parameters found');
        result.details!.params!.push('Parameters must be unique');
        result.valid = false;
      }
    }
  }

  // Validate steps (required)
  if (!spec.steps) {
    result.errors.push('Missing required field: steps');
    result.valid = false;
  } else if (!Array.isArray(spec.steps)) {
    result.errors.push('Field "steps" must be an array');
    result.valid = false;
  } else if (spec.steps.length === 0) {
    result.errors.push('Field "steps" cannot be empty');
    result.valid = false;
  } else {
    // Validate each step
    for (let i = 0; i < spec.steps.length; i++) {
      const stepValidation = validateIntentStep(spec.steps[i], i);
      if (!stepValidation.valid) {
        result.valid = false;
        result.details!.steps!.push({
          index: i,
          errors: stepValidation.errors
        });
        result.errors.push(...stepValidation.errors.map(error => `Step ${i}: ${error}`));
      }
    }
  }

  // Validate parameter usage in steps
  if (spec.params && spec.steps) {
    const usedParams = extractParametersFromSteps(spec.steps);
    const declaredParams = new Set(spec.params);
    
    // Check for undeclared parameters
    usedParams.forEach(param => {
      if (!declaredParams.has(param)) {
        result.errors.push(`Parameter "${param}" is used in steps but not declared in params array`);
        result.valid = false;
      }
    });

    // Check for unused parameters (warning only)
    declaredParams.forEach(param => {
      if (typeof param === 'string' && !usedParams.has(param)) {
        result.warnings.push(`Parameter "${param}" is declared but never used in steps`);
      }
    });
  }

  return result;
}

/**
 * Validates a single Intent Step
 */
export function validateIntentStep(step: any, index?: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let valid = true;

  if (!step) {
    errors.push('Step is null or undefined');
    return { valid: false, errors };
  }

  // Validate action (required)
  if (!step.action) {
    errors.push('Missing required field: action');
    valid = false;
  } else if (typeof step.action !== 'string') {
    errors.push('Field "action" must be a string');
    valid = false;
  } else if (step.action.trim().length === 0) {
    errors.push('Field "action" cannot be empty');
    valid = false;
  } else {
    // Validate action type
    const validActions = [
      'click', 'type', 'select', 'wait', 'navigate', 'scroll', 
      'hover', 'drag', 'drop', 'upload', 'download', 'screenshot', 
      'extract', 'custom', 'press', 'clear', 'refresh'
    ];
    if (!validActions.includes(step.action.toLowerCase())) {
      errors.push(`Unknown action type: "${step.action}". Valid actions: ${validActions.join(', ')}`);
      valid = false;
    }
  }

  // Validate selector/target (required - check both for backward compatibility)
  const selectorField = step.selector || step.target;
  if (!selectorField) {
    errors.push('Missing required field: selector or target');
    valid = false;
  } else if (typeof selectorField !== 'string') {
    errors.push('Field "selector/target" must be a string');
    valid = false;
  } else if (selectorField.trim().length === 0) {
    errors.push('Field "selector/target" cannot be empty');
    valid = false;
  }

  // Validate value (optional, but validate if present)
  if (step.value !== undefined && step.value !== null && typeof step.value !== 'string') {
    errors.push('Field "value" must be a string');
    valid = false;
  }

  // Validate description (optional)
  if (step.description !== undefined && typeof step.description !== 'string') {
    errors.push('Field "description" must be a string');
    valid = false;
  }

  // Validate timeout (optional)
  if (step.timeout !== undefined) {
    if (typeof step.timeout !== 'number') {
      errors.push('Field "timeout" must be a number');
      valid = false;
    } else if (step.timeout < 0) {
      errors.push('Field "timeout" must be non-negative');
      valid = false;
    }
  }

  // Validate retries (optional)
  if (step.retries !== undefined) {
    if (typeof step.retries !== 'number') {
      errors.push('Field "retries" must be a number');
      valid = false;
    } else if (!Number.isInteger(step.retries) || step.retries < 0) {
      errors.push('Field "retries" must be a non-negative integer');
      valid = false;
    }
  }

  return { valid, errors };
}

/**
 * Extracts parameter names from step values using {{PARAM}} syntax
 */
export function extractParametersFromSteps(steps: IntentStep[]): Set<string> {
  const params = new Set<string>();
  const paramRegex = /\{\{([^}]+)\}\}/g;

  for (const step of steps) {
    if (step.value) {
      let match;
      while ((match = paramRegex.exec(step.value)) !== null) {
        params.add(match[1].trim());
      }
    }
    
    // Also check selector/target for parameters (though less common)
    const selectorField = step.selector || step.target;
    if (selectorField) {
      let match;
      paramRegex.lastIndex = 0; // Reset regex
      while ((match = paramRegex.exec(selectorField)) !== null) {
        params.add(match[1].trim());
      }
    }
  }

  return params;
}

/**
 * Checks if the Intent Spec structure matches expected format
 */
export function isValidIntentSpecStructure(obj: any): obj is IntentSpec {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    (typeof obj.url === 'string' || typeof obj.startUrl === 'string') &&
    Array.isArray(obj.steps) &&
    obj.steps.every((step: any) => 
      step &&
      typeof step.action === 'string' &&
      (typeof step.selector === 'string' || typeof step.target === 'string')
    )
  );
}

/**
 * Sanitizes an Intent Spec by removing invalid fields and normalizing values
 */
export function sanitizeIntentSpec(spec: any): Partial<IntentSpec> {
  if (!spec || typeof spec !== 'object') {
    return {};
  }

  const sanitized: Partial<IntentSpec> = {};

  // Sanitize name
  if (typeof spec.name === 'string' && spec.name.trim().length > 0) {
    sanitized.name = spec.name.trim();
  }

  // Sanitize url (check both url and startUrl)
  const urlField = spec.url || spec.startUrl;
  if (typeof urlField === 'string' && urlField.trim().length > 0) {
    try {
      const url = new URL(urlField.trim());
      sanitized.url = url.toString();
    } catch {
      // Invalid URL, skip
    }
  }

  // Sanitize description
  if (typeof spec.description === 'string' && spec.description.trim().length > 0) {
    sanitized.description = spec.description.trim();
  }

  // Sanitize params
  if (Array.isArray(spec.params)) {
    const validParams = spec.params
      .filter((param: any) => typeof param === 'string' && param.trim().length > 0)
      .map((param: any) => (param as string).trim());
    
    // Remove duplicates
    const uniqueParams: string[] = Array.from(new Set(validParams));
    if (uniqueParams.length > 0) {
      sanitized.params = uniqueParams as string[];
    }
  }

  // Sanitize steps
  if (Array.isArray(spec.steps)) {
    const validSteps: IntentStep[] = [];
    
    for (const step of spec.steps) {
      const selectorField = step?.selector || step?.target;
      if (step && typeof step.action === 'string' && typeof selectorField === 'string') {
        const sanitizedStep: IntentStep = {
          action: step.action.trim(),
        };

        // Prefer selector over target
        if (step.selector) {
          sanitizedStep.selector = step.selector.trim();
        } else if (step.target) {
          sanitizedStep.selector = step.target.trim();
        }

        if (typeof step.value === 'string') {
          sanitizedStep.value = step.value;
        }

        if (typeof step.description === 'string' && step.description.trim().length > 0) {
          sanitizedStep.description = step.description.trim();
        }

        if (typeof step.timeout === 'number' && step.timeout >= 0) {
          sanitizedStep.timeout = step.timeout;
        }

        if (typeof step.retries === 'number' && Number.isInteger(step.retries) && step.retries >= 0) {
          sanitizedStep.retries = step.retries;
        }

        validSteps.push(sanitizedStep);
      }
    }

    if (validSteps.length > 0) {
      sanitized.steps = validSteps;
    }
  }

  // Sanitize successCheck
  if (typeof spec.successCheck === 'string' && spec.successCheck.trim().length > 0) {
    sanitized.successCheck = spec.successCheck.trim();
  }

  return sanitized;
}