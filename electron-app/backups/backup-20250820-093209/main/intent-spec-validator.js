"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateIntentSpec = validateIntentSpec;
exports.validateIntentStep = validateIntentStep;
exports.extractParametersFromSteps = extractParametersFromSteps;
exports.isValidIntentSpecStructure = isValidIntentSpecStructure;
exports.sanitizeIntentSpec = sanitizeIntentSpec;
/**
 * Validates an Intent Spec JSON object for completeness and correctness
 */
function validateIntentSpec(spec) {
    var result = {
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
        result.details.name.push('Name is required');
        result.valid = false;
    }
    else if (typeof spec.name !== 'string') {
        result.errors.push('Field "name" must be a string');
        result.details.name.push('Name must be a string');
        result.valid = false;
    }
    else if (spec.name.trim().length === 0) {
        result.errors.push('Field "name" cannot be empty');
        result.details.name.push('Name cannot be empty');
        result.valid = false;
    }
    // Validate description (required)
    if (!spec.description) {
        result.errors.push('Missing required field: description');
        result.valid = false;
    }
    else if (typeof spec.description !== 'string') {
        result.errors.push('Field "description" must be a string');
        result.valid = false;
    }
    else if (spec.description.trim().length === 0) {
        result.errors.push('Field "description" cannot be empty');
        result.valid = false;
    }
    // Validate url (required)
    if (!spec.url) {
        result.errors.push('Missing required field: url');
        result.details.url.push('URL is required');
        result.valid = false;
    }
    else if (typeof spec.url !== 'string') {
        result.errors.push('Field "url" must be a string');
        result.details.url.push('URL must be a string');
        result.valid = false;
    }
    else {
        try {
            new URL(spec.url);
        }
        catch (_a) {
            result.errors.push('Field "url" must be a valid URL');
            result.details.url.push('URL must be a valid URL format');
            result.valid = false;
        }
    }
    // Validate params (required)
    if (!spec.params) {
        result.errors.push('Missing required field: params');
        result.details.params.push('Params is required');
        result.valid = false;
    }
    else if (!Array.isArray(spec.params)) {
        result.errors.push('Field "params" must be an array');
        result.details.params.push('Params must be an array');
        result.valid = false;
    }
    else {
        for (var i = 0; i < spec.params.length; i++) {
            if (typeof spec.params[i] !== 'string') {
                result.errors.push("Parameter at index ".concat(i, " must be a string"));
                result.details.params.push("Parameter ".concat(i, " must be a string"));
                result.valid = false;
            }
            else if (spec.params[i].trim().length === 0) {
                result.errors.push("Parameter at index ".concat(i, " cannot be empty"));
                result.details.params.push("Parameter ".concat(i, " cannot be empty"));
                result.valid = false;
            }
        }
        // Check for duplicate params
        var paramSet = new Set(spec.params);
        if (paramSet.size !== spec.params.length) {
            result.errors.push('Duplicate parameters found');
            result.details.params.push('Parameters must be unique');
            result.valid = false;
        }
    }
    // Validate steps (required)
    if (!spec.steps) {
        result.errors.push('Missing required field: steps');
        result.valid = false;
    }
    else if (!Array.isArray(spec.steps)) {
        result.errors.push('Field "steps" must be an array');
        result.valid = false;
    }
    else if (spec.steps.length === 0) {
        result.errors.push('Field "steps" cannot be empty');
        result.valid = false;
    }
    else {
        var _loop_1 = function (i) {
            var _b;
            var stepValidation = validateIntentStep(spec.steps[i], i);
            if (!stepValidation.valid) {
                result.valid = false;
                result.details.steps.push({
                    index: i,
                    errors: stepValidation.errors
                });
                (_b = result.errors).push.apply(_b, stepValidation.errors.map(function (error) { return "Step ".concat(i, ": ").concat(error); }));
            }
        };
        // Validate each step
        for (var i = 0; i < spec.steps.length; i++) {
            _loop_1(i);
        }
    }
    // Validate preferences (required)
    if (!spec.preferences) {
        result.errors.push('Missing required field: preferences');
        result.valid = false;
    }
    else if (typeof spec.preferences !== 'object') {
        result.errors.push('Field "preferences" must be an object');
        result.valid = false;
    }
    else {
        // Validate required preference keys
        if (!spec.preferences.dynamic_elements) {
            result.errors.push('Missing required preference: dynamic_elements');
            result.valid = false;
        }
        else if (!['snippet', 'ai'].includes(spec.preferences.dynamic_elements)) {
            result.errors.push('Preference "dynamic_elements" must be "snippet" or "ai"');
            result.valid = false;
        }
        if (!spec.preferences.simple_steps) {
            result.errors.push('Missing required preference: simple_steps');
            result.valid = false;
        }
        else if (!['snippet', 'ai'].includes(spec.preferences.simple_steps)) {
            result.errors.push('Preference "simple_steps" must be "snippet" or "ai"');
            result.valid = false;
        }
        // Validate additional preference values
        Object.entries(spec.preferences).forEach(function (_a) {
            var key = _a[0], value = _a[1];
            if (!['snippet', 'ai'].includes(value)) {
                result.errors.push("Preference \"".concat(key, "\" must be \"snippet\" or \"ai\""));
                result.valid = false;
            }
        });
    }
    // Validate optional fields
    if (spec.success_screenshot !== undefined && typeof spec.success_screenshot !== 'string') {
        result.errors.push('Field "success_screenshot" must be a string');
        result.valid = false;
    }
    if (spec.recording_spec !== undefined && typeof spec.recording_spec !== 'string') {
        result.errors.push('Field "recording_spec" must be a string');
        result.valid = false;
    }
    // Validate parameter usage in steps
    if (spec.params && spec.steps) {
        var usedParams_1 = extractParametersFromSteps(spec.steps);
        var declaredParams_1 = new Set(spec.params);
        // Check for undeclared parameters
        usedParams_1.forEach(function (param) {
            if (!declaredParams_1.has(param)) {
                result.errors.push("Parameter \"".concat(param, "\" is used in steps but not declared in params array"));
                result.valid = false;
            }
        });
        // Check for unused parameters (warning only)
        declaredParams_1.forEach(function (param) {
            if (typeof param === 'string' && !usedParams_1.has(param)) {
                result.warnings.push("Parameter \"".concat(param, "\" is declared but never used in steps"));
            }
        });
    }
    return result;
}
/**
 * Validates a single Intent Step with new dual-path structure
 */
function validateIntentStep(step, index) {
    var errors = [];
    var valid = true;
    if (!step) {
        errors.push('Step is null or undefined');
        return { valid: false, errors: errors };
    }
    // Validate name (required)
    if (!step.name) {
        errors.push('Missing required field: name');
        valid = false;
    }
    else if (typeof step.name !== 'string') {
        errors.push('Field "name" must be a string');
        valid = false;
    }
    else if (step.name.trim().length === 0) {
        errors.push('Field "name" cannot be empty');
        valid = false;
    }
    // Validate ai_instruction (required)
    if (!step.ai_instruction) {
        errors.push('Missing required field: ai_instruction');
        valid = false;
    }
    else if (typeof step.ai_instruction !== 'string') {
        errors.push('Field "ai_instruction" must be a string');
        valid = false;
    }
    else if (step.ai_instruction.trim().length === 0) {
        errors.push('Field "ai_instruction" cannot be empty');
        valid = false;
    }
    // Validate snippet (required)
    if (!step.snippet) {
        errors.push('Missing required field: snippet');
        valid = false;
    }
    else if (typeof step.snippet !== 'string') {
        errors.push('Field "snippet" must be a string');
        valid = false;
    }
    else if (step.snippet.trim().length === 0) {
        errors.push('Field "snippet" cannot be empty');
        valid = false;
    }
    // Validate prefer (required)
    if (!step.prefer) {
        errors.push('Missing required field: prefer');
        valid = false;
    }
    else if (!['ai', 'snippet'].includes(step.prefer)) {
        errors.push('Field "prefer" must be either "ai" or "snippet"');
        valid = false;
    }
    // Validate fallback (required)
    if (!step.fallback) {
        errors.push('Missing required field: fallback');
        valid = false;
    }
    else if (!['ai', 'snippet', 'none'].includes(step.fallback)) {
        errors.push('Field "fallback" must be "ai", "snippet", or "none"');
        valid = false;
    }
    // Validate selector (optional)
    if (step.selector !== undefined) {
        if (typeof step.selector !== 'string') {
            errors.push('Field "selector" must be a string');
            valid = false;
        }
        else if (step.selector.trim().length === 0) {
            errors.push('Field "selector" cannot be empty when provided');
            valid = false;
        }
    }
    // Validate value (optional)
    if (step.value !== undefined && step.value !== null && typeof step.value !== 'string') {
        errors.push('Field "value" must be a string');
        valid = false;
    }
    // Legacy field validations (optional for backward compatibility)
    if (step.action !== undefined) {
        if (typeof step.action !== 'string') {
            errors.push('Legacy field "action" must be a string');
            valid = false;
        }
        else {
            var validActions = [
                'click', 'type', 'select', 'wait', 'navigate', 'scroll',
                'hover', 'drag', 'drop', 'upload', 'download', 'screenshot',
                'extract', 'custom', 'press', 'clear', 'refresh'
            ];
            if (!validActions.includes(step.action.toLowerCase())) {
                errors.push("Unknown legacy action type: \"".concat(step.action, "\". Valid actions: ").concat(validActions.join(', ')));
                valid = false;
            }
        }
    }
    // Validate target (legacy, optional)
    if (step.target !== undefined && typeof step.target !== 'string') {
        errors.push('Legacy field "target" must be a string');
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
        }
        else if (step.timeout < 0) {
            errors.push('Field "timeout" must be non-negative');
            valid = false;
        }
    }
    // Validate retries (optional)
    if (step.retries !== undefined) {
        if (typeof step.retries !== 'number') {
            errors.push('Field "retries" must be a number');
            valid = false;
        }
        else if (!Number.isInteger(step.retries) || step.retries < 0) {
            errors.push('Field "retries" must be a non-negative integer');
            valid = false;
        }
    }
    return { valid: valid, errors: errors };
}
/**
 * Extracts parameter names from step values using {{PARAM}} syntax
 */
function extractParametersFromSteps(steps) {
    var params = new Set();
    var paramRegex = /\{\{([^}]+)\}\}/g;
    for (var _i = 0, steps_1 = steps; _i < steps_1.length; _i++) {
        var step = steps_1[_i];
        // Check all string fields that might contain parameters
        var fieldsToCheck = [
            step.value,
            step.selector,
            step.ai_instruction,
            step.snippet,
            step.target // legacy field
        ];
        fieldsToCheck.forEach(function (field) {
            if (field && typeof field === 'string') {
                var match = void 0;
                paramRegex.lastIndex = 0; // Reset regex
                while ((match = paramRegex.exec(field)) !== null) {
                    params.add(match[1].trim());
                }
            }
        });
    }
    return params;
}
/**
 * Checks if the Intent Spec structure matches expected format
 */
function isValidIntentSpecStructure(obj) {
    return (obj &&
        typeof obj === 'object' &&
        typeof obj.name === 'string' &&
        typeof obj.description === 'string' &&
        typeof obj.url === 'string' &&
        Array.isArray(obj.params) &&
        Array.isArray(obj.steps) &&
        obj.steps.every(function (step) {
            return step &&
                typeof step.name === 'string' &&
                typeof step.ai_instruction === 'string' &&
                typeof step.snippet === 'string' &&
                ['ai', 'snippet'].includes(step.prefer) &&
                ['ai', 'snippet', 'none'].includes(step.fallback);
        }) &&
        obj.preferences &&
        typeof obj.preferences === 'object' &&
        ['snippet', 'ai'].includes(obj.preferences.dynamic_elements) &&
        ['snippet', 'ai'].includes(obj.preferences.simple_steps));
}
/**
 * Sanitizes an Intent Spec by removing invalid fields and normalizing values
 */
function sanitizeIntentSpec(spec) {
    if (!spec || typeof spec !== 'object') {
        return {};
    }
    var sanitized = {};
    // Sanitize name
    if (typeof spec.name === 'string' && spec.name.trim().length > 0) {
        sanitized.name = spec.name.trim();
    }
    // Sanitize url (check both url and startUrl)
    var urlField = spec.url || spec.startUrl;
    if (typeof urlField === 'string' && urlField.trim().length > 0) {
        try {
            var url = new URL(urlField.trim());
            sanitized.url = url.toString();
        }
        catch (_a) {
            // Invalid URL, skip
        }
    }
    // Sanitize description (required)
    if (typeof spec.description === 'string' && spec.description.trim().length > 0) {
        sanitized.description = spec.description.trim();
    }
    // Sanitize params (required)
    if (Array.isArray(spec.params)) {
        var validParams = spec.params
            .filter(function (param) { return typeof param === 'string' && param.trim().length > 0; })
            .map(function (param) { return param.trim(); });
        // Remove duplicates
        var uniqueParams = Array.from(new Set(validParams));
        sanitized.params = uniqueParams;
    }
    else {
        sanitized.params = [];
    }
    // Sanitize steps
    if (Array.isArray(spec.steps)) {
        var validSteps = [];
        for (var _i = 0, _b = spec.steps; _i < _b.length; _i++) {
            var step = _b[_i];
            if (step &&
                typeof step.name === 'string' &&
                typeof step.ai_instruction === 'string' &&
                typeof step.snippet === 'string' &&
                ['ai', 'snippet'].includes(step.prefer) &&
                ['ai', 'snippet', 'none'].includes(step.fallback)) {
                var sanitizedStep = {
                    name: step.name.trim(),
                    ai_instruction: step.ai_instruction.trim(),
                    snippet: step.snippet.trim(),
                    prefer: step.prefer,
                    fallback: step.fallback
                };
                // Optional fields
                if (typeof step.selector === 'string' && step.selector.trim().length > 0) {
                    sanitizedStep.selector = step.selector.trim();
                }
                if (typeof step.value === 'string') {
                    sanitizedStep.value = step.value;
                }
                // Legacy fields
                if (typeof step.action === 'string' && step.action.trim().length > 0) {
                    sanitizedStep.action = step.action.trim();
                }
                if (typeof step.target === 'string' && step.target.trim().length > 0) {
                    sanitizedStep.target = step.target.trim();
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
    // Sanitize preferences (required)
    if (spec.preferences && typeof spec.preferences === 'object') {
        var validPreferences_1 = {};
        // Required preferences
        if (['snippet', 'ai'].includes(spec.preferences.dynamic_elements)) {
            validPreferences_1.dynamic_elements = spec.preferences.dynamic_elements;
        }
        else {
            validPreferences_1.dynamic_elements = 'ai'; // default
        }
        if (['snippet', 'ai'].includes(spec.preferences.simple_steps)) {
            validPreferences_1.simple_steps = spec.preferences.simple_steps;
        }
        else {
            validPreferences_1.simple_steps = 'snippet'; // default
        }
        // Additional custom preferences
        Object.entries(spec.preferences).forEach(function (_a) {
            var key = _a[0], value = _a[1];
            if (key !== 'dynamic_elements' && key !== 'simple_steps' && ['snippet', 'ai'].includes(value)) {
                validPreferences_1[key] = value;
            }
        });
        sanitized.preferences = validPreferences_1;
    }
    else {
        // Default preferences if not provided
        sanitized.preferences = {
            dynamic_elements: 'ai',
            simple_steps: 'snippet'
        };
    }
    // Sanitize optional fields
    if (typeof spec.success_screenshot === 'string' && spec.success_screenshot.trim().length > 0) {
        sanitized.success_screenshot = spec.success_screenshot.trim();
    }
    if (typeof spec.recording_spec === 'string' && spec.recording_spec.trim().length > 0) {
        sanitized.recording_spec = spec.recording_spec.trim();
    }
    // Legacy fields
    if (typeof spec.successCheck === 'string' && spec.successCheck.trim().length > 0) {
        sanitized.successCheck = spec.successCheck.trim();
    }
    return sanitized;
}
