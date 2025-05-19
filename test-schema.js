import { generateJsonSchema } from './src/lib/schema.js';

// Generate the JSON schema
const jsonSchema = generateJsonSchema();

// Output the schema
console.log(JSON.stringify(jsonSchema, null, 2));