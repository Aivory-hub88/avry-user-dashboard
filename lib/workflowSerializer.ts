/**
 * Workflow Serialization Utilities
 * 
 * This module provides utility functions for parsing and serializing workflow specifications.
 * It ensures round-trip consistency: deserialize(serialize(spec)) === spec for all valid specs.
 * 
 * @module lib/workflowSerializer
 */

import { AivoryWorkflowSpec, WorkflowStep, WorkflowStepType } from '@/types/workflows'

/**
 * Structured error object returned by parser
 * 
 * @interface ParseError
 * @property {string} message - Human-readable error message
 * @property {string} [field] - The field that failed parsing (if applicable)
 * @property {string} [details] - Additional details about the error
 */
export interface ParseError {
  message: string
  field?: string
  details?: string
}

/**
 * Validates that a value is a valid WorkflowStepType
 * 
 * @param {any} value - The value to validate
 * @returns {boolean} True if value is a valid WorkflowStepType
 */
function isValidStepType(value: any): value is WorkflowStepType {
  return ['trigger', 'action', 'ai', 'filter'].includes(value)
}

/**
 * Validates that an object has the required WorkflowStep structure
 * 
 * @param {any} step - The object to validate
 * @returns {ParseError | null} Error if validation fails, null if valid
 */
function validateWorkflowStep(step: any): ParseError | null {
  if (!step || typeof step !== 'object') {
    return {
      message: 'Step must be an object',
      field: 'step'
    }
  }

  // Check required fields
  const requiredFields = ['id', 'type', 'appId', 'actionId', 'connectionId', 'inputs', 'position']
  for (const field of requiredFields) {
    if (!(field in step)) {
      return {
        message: `Step is missing required field: ${field}`,
        field: 'step',
        details: `Expected field "${field}" in step object`
      }
    }
  }

  // Validate field types
  if (typeof step.id !== 'string') {
    return {
      message: 'Step id must be a string',
      field: 'id',
      details: `Got ${typeof step.id}`
    }
  }

  if (!isValidStepType(step.type)) {
    return {
      message: `Step type must be one of: trigger, action, ai, filter. Got: ${step.type}`,
      field: 'type'
    }
  }

  if (typeof step.appId !== 'string') {
    return {
      message: 'Step appId must be a string',
      field: 'appId',
      details: `Got ${typeof step.appId}`
    }
  }

  if (typeof step.actionId !== 'string') {
    return {
      message: 'Step actionId must be a string',
      field: 'actionId',
      details: `Got ${typeof step.actionId}`
    }
  }

  if (typeof step.connectionId !== 'string') {
    return {
      message: 'Step connectionId must be a string',
      field: 'connectionId',
      details: `Got ${typeof step.connectionId}`
    }
  }

  if (!step.inputs || typeof step.inputs !== 'object' || Array.isArray(step.inputs)) {
    return {
      message: 'Step inputs must be an object',
      field: 'inputs',
      details: `Got ${typeof step.inputs}`
    }
  }

  if (!step.position || typeof step.position !== 'object') {
    return {
      message: 'Step position must be an object',
      field: 'position'
    }
  }

  if (typeof step.position.x !== 'number') {
    return {
      message: 'Step position.x must be a number',
      field: 'position.x',
      details: `Got ${typeof step.position.x}`
    }
  }

  if (typeof step.position.y !== 'number') {
    return {
      message: 'Step position.y must be a number',
      field: 'position.y',
      details: `Got ${typeof step.position.y}`
    }
  }

  return null
}

/**
 * Parses a JSON string into an AivoryWorkflowSpec object with validation
 * 
 * This function:
 * 1. Parses the JSON string
 * 2. Validates the structure matches AivoryWorkflowSpec
 * 3. Validates all required fields are present
 * 4. Validates all steps have correct structure
 * 5. Returns descriptive errors for any validation failures
 * 
 * @param {string} jsonString - JSON string to parse
 * @returns {Object} Object with either spec or error
 * @returns {AivoryWorkflowSpec} result.spec - Parsed workflow spec (if successful)
 * @returns {ParseError} result.error - Parse error (if failed)
 * 
 * @example
 * const result = parseWorkflowSpec('{"name":"My Workflow","description":"...","source":"console","intent":"...","steps":[...]}')
 * if (result.error) {
 *   console.error(result.error.message)
 * } else {
 *   console.log(result.spec.name)
 * }
 */
export function parseWorkflowSpec(jsonString: string): { spec?: AivoryWorkflowSpec; error?: ParseError } {
  // Step 1: Parse JSON
  let parsed: any
  try {
    parsed = JSON.parse(jsonString)
  } catch (err) {
    const errorMessage = err instanceof SyntaxError ? err.message : 'Unknown JSON parsing error'
    return {
      error: {
        message: `Invalid JSON: ${errorMessage}`,
        field: 'json',
        details: 'The provided string is not valid JSON'
      }
    }
  }

  // Step 2: Validate it's an object
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      error: {
        message: 'Workflow spec must be a JSON object',
        field: 'root',
        details: `Got ${Array.isArray(parsed) ? 'array' : typeof parsed}`
      }
    }
  }

  // Step 3: Validate required top-level fields
  const requiredFields = ['name', 'description', 'source', 'intent', 'steps']
  for (const field of requiredFields) {
    if (!(field in parsed)) {
      return {
        error: {
          message: `Workflow spec is missing required field: ${field}`,
          field,
          details: `Expected field "${field}" in workflow spec`
        }
      }
    }
  }

  // Step 4: Validate field types
  if (typeof parsed.name !== 'string') {
    return {
      error: {
        message: 'Workflow name must be a string',
        field: 'name',
        details: `Got ${typeof parsed.name}`
      }
    }
  }

  if (typeof parsed.description !== 'string') {
    return {
      error: {
        message: 'Workflow description must be a string',
        field: 'description',
        details: `Got ${typeof parsed.description}`
      }
    }
  }

  if (typeof parsed.source !== 'string') {
    return {
      error: {
        message: 'Workflow source must be a string',
        field: 'source',
        details: `Got ${typeof parsed.source}`
      }
    }
  }

  if (typeof parsed.intent !== 'string') {
    return {
      error: {
        message: 'Workflow intent must be a string',
        field: 'intent',
        details: `Got ${typeof parsed.intent}`
      }
    }
  }

  if (!Array.isArray(parsed.steps)) {
    return {
      error: {
        message: 'Workflow steps must be an array',
        field: 'steps',
        details: `Got ${typeof parsed.steps}`
      }
    }
  }

  // Step 5: Validate each step
  for (let i = 0; i < parsed.steps.length; i++) {
    const stepError = validateWorkflowStep(parsed.steps[i])
    if (stepError) {
      return {
        error: {
          message: `Step ${i} validation failed: ${stepError.message}`,
          field: `steps[${i}]`,
          details: stepError.details
        }
      }
    }
  }

  // All validations passed
  const spec: AivoryWorkflowSpec = {
    name: parsed.name,
    description: parsed.description,
    source: parsed.source,
    intent: parsed.intent,
    steps: parsed.steps as WorkflowStep[]
  }

  return { spec }
}

/**
 * Serializes an AivoryWorkflowSpec object to a JSON string
 * 
 * This function preserves all properties including position coordinates,
 * inputs, and all other step properties. The serialized output can be
 * parsed back to an equivalent spec using parseWorkflowSpec().
 * 
 * @param {AivoryWorkflowSpec} spec - The workflow specification to serialize
 * @returns {string} JSON string representation of the spec
 * 
 * @example
 * const spec = {
 *   name: "My Workflow",
 *   description: "...",
 *   source: "console",
 *   intent: "...",
 *   steps: [...]
 * }
 * const jsonString = serializeWorkflowSpec(spec)
 * console.log(jsonString)
 * // Output: {"name":"My Workflow","description":"...","source":"console","intent":"...","steps":[...]}
 */
export function serializeWorkflowSpec(spec: AivoryWorkflowSpec): string {
  return JSON.stringify(spec)
}

/**
 * Validates the round-trip property: deserialize(serialize(spec)) === spec
 * 
 * This function serializes a spec and then deserializes it, comparing the result
 * to the original. This is useful for testing and validation.
 * 
 * @param {AivoryWorkflowSpec} spec - The workflow specification to test
 * @returns {Object} Object with roundTripValid boolean and optional error
 * @returns {boolean} result.roundTripValid - True if round-trip succeeds
 * @returns {string} result.error - Error message if round-trip fails
 * 
 * @example
 * const spec = { name: "Test", description: "...", source: "console", intent: "...", steps: [] }
 * const result = validateRoundTrip(spec)
 * if (result.roundTripValid) {
 *   console.log("Round-trip successful!")
 * } else {
 *   console.error(result.error)
 * }
 */
export function validateRoundTrip(spec: AivoryWorkflowSpec): { roundTripValid: boolean; error?: string } {
  try {
    // Serialize
    const serialized = serializeWorkflowSpec(spec)

    // Deserialize
    const result = parseWorkflowSpec(serialized)

    if (result.error) {
      return {
        roundTripValid: false,
        error: `Deserialization failed: ${result.error.message}`
      }
    }

    // Compare
    const deserializedSpec = result.spec!
    const serializedOriginal = JSON.stringify(spec)
    const serializedDeserialized = JSON.stringify(deserializedSpec)

    if (serializedOriginal !== serializedDeserialized) {
      return {
        roundTripValid: false,
        error: 'Deserialized spec does not match original'
      }
    }

    return { roundTripValid: true }
  } catch (err) {
    return {
      roundTripValid: false,
      error: `Round-trip validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`
    }
  }
}
