// JSON Schema rendering of projectSchema — shape only; cross-reference rules live in
// validate.ts and are summarized in the description so agents know they exist.
// Node-only (imports zod-to-json-schema, a devDependency): used by scripts/ and tests, never the app.

import { zodToJsonSchema } from 'zod-to-json-schema';
import { projectSchema } from './schema';
import { SPEC_VERSION } from './types';

export const SCHEMA_PATH = 'schema/takui-v1.schema.json';

export function buildJsonSchema(): string {
  const schema = zodToJsonSchema(projectSchema, { name: 'TakUiProject', $refStrategy: 'root' });
  const out = {
    $comment: `GENERATED from src/spec/schema.ts by \`npm run schema\` — do not edit by hand.`,
    title: `TAK Plugin UI Builder project (${SPEC_VERSION})`,
    description:
      'Platform-neutral plugin UI spec. Shape only — the builder additionally checks: unique ids, ' +
      'bind/on/visibleWhen references, bind type compatibility and allowed events per component ' +
      '(src/spec/catalog.ts), and per-target support warnings.',
    ...schema,
  };
  return JSON.stringify(out, null, 2) + '\n';
}
