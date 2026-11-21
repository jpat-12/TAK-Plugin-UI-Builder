import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildJsonSchema, SCHEMA_PATH } from '../src/spec/jsonSchema';

it('committed JSON Schema matches src/spec/schema.ts (run `npm run schema` if this fails)', () => {
  expect(readFileSync(SCHEMA_PATH, 'utf8').replace(/\r\n/g, '\n')).toBe(buildJsonSchema());
});
