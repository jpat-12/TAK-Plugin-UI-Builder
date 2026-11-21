// Writes schema/takui-v1.schema.json from src/spec/schema.ts. The JSON file is committed so a
// coding agent can read the contract without npm install; test/schema-file.test.ts fails if
// it drifts. Usage: npm run schema

import { writeFileSync } from 'node:fs';
import { buildJsonSchema, SCHEMA_PATH } from '../src/spec/jsonSchema';

writeFileSync(SCHEMA_PATH, buildJsonSchema());
console.log(`[takui] wrote ${SCHEMA_PATH}`);
