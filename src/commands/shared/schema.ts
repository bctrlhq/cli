/** Defaults belong to the HTTP server. Forward the caller's original JSON. */
export function withoutSchemaDefaults(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const output = { ...schema } as Record<string, unknown>;
  delete output.default;
  for (const keyword of ['properties', '$defs', 'definitions', 'patternProperties']) {
    const children = output[keyword];
    if (children && typeof children === 'object' && !Array.isArray(children)) {
      output[keyword] = Object.fromEntries(Object.entries(children).map(([name, value]) => [name, withoutSchemaDefaults(value)]));
    }
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) {
    const children = output[keyword];
    if (Array.isArray(children)) output[keyword] = children.map(withoutSchemaDefaults);
  }
  for (const keyword of ['items', 'additionalProperties', 'additionalItems', 'not', 'contains', 'propertyNames']) {
    if (output[keyword] !== undefined) output[keyword] = withoutSchemaDefaults(output[keyword]);
  }
  return output;
}
