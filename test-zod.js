import { z } from 'zod';

// Create a simple schema
const schema = z.object({
  name: z.string(),
  age: z.number().optional(),
  email: z.string().email(),
});

// Check what methods are available
console.log('Schema methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(schema)));

// Try to generate JSON schema if the method exists
if (typeof schema.toJsonSchema === 'function') {
  console.log('JSON Schema:', JSON.stringify(schema.toJsonSchema(), null, 2));
} else if (typeof schema.toJSON === 'function') {
  console.log('JSON from toJSON:', JSON.stringify(schema.toJSON(), null, 2));
} else {
  console.log('No JSON schema generation method found');
}

// Check if getJsonSchema exists on z
if (typeof z.getJsonSchema === 'function') {
  console.log('z.getJsonSchema exists');
} else {
  console.log('z.getJsonSchema does not exist');
}

// Check if version is exported
console.log('Zod version:', z.version || 'Not available');