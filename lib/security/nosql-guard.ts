const DANGEROUS_OPERATORS = [
  "$where",
  "$regex",
  "$expr",
  "$jsonSchema",
  "$function",
  "$accumulator",
];

const ALLOWED_QUERY_OPERATORS = [
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  "$and",
  "$or",
  "$not",
  "$nor",
  "$exists",
];

export function sanitizeMongoQuery(query: unknown): unknown {
  if (query === null || query === undefined) {
    return query;
  }

  if (typeof query === "string") {
    return query.replace(/[${}]/g, "");
  }

  if (typeof query === "number" || typeof query === "boolean") {
    return query;
  }

  if (Array.isArray(query)) {
    return query.map((item) => sanitizeMongoQuery(item));
  }

  if (typeof query === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(query)) {
      if (DANGEROUS_OPERATORS.includes(key)) {
        continue;
      }

      if (key.startsWith("$") && !ALLOWED_QUERY_OPERATORS.includes(key)) {
        continue;
      }

      sanitized[key] = sanitizeMongoQuery(value);
    }

    return sanitized;
  }

  return query;
}

export function sanitizeRegexPattern(pattern: string): string {
  let sanitized = pattern.replace(/[^\w\s.*+?^$[\](){}|-]/g, "");
  sanitized = sanitized.substring(0, 200);
  return sanitized;
}

export function isValidObjectId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

export function validateQueryInput(input: Record<string, unknown>): void {
  const hasInjectionAttempt = JSON.stringify(input).match(/\$where|\$function|\$accumulator/);

  if (hasInjectionAttempt) {
    throw new Error("Potential NoSQL injection detected");
  }

  for (const key of Object.keys(input)) {
    if (key.includes("$") && !key.startsWith("$")) {
      throw new Error("Invalid query field name");
    }
  }
}

export function sanitizeUserInput<T extends Record<string, unknown>>(input: T): T {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith("$")) {
      continue;
    }

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeUserInput(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? sanitizeUserInput(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
