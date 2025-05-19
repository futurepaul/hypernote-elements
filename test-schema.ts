import { generateJsonSchema } from './src/lib/schema';

// Generate the JSON schema
const jsonSchema = generateJsonSchema();

// Output the schema
console.log(JSON.stringify(jsonSchema, null, 2));