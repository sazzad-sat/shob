import z from "zod"

type Path = Array<string | number>

export type JSONSchemaLike = {
  type?: string | string[]
  properties?: Record<string, JSONSchemaLike>
  items?: JSONSchemaLike | JSONSchemaLike[]
  required?: string[]
  anyOf?: JSONSchemaLike[]
  oneOf?: JSONSchemaLike[]
  allOf?: JSONSchemaLike[]
  enum?: unknown[]
}

export type ToolInputRepairResult = {
  input: unknown
  repaired: boolean
  notes: string[]
}

export type ToolInputParseResult<T> =
  | { success: true; data: T; repaired: boolean; notes: string[]; input: unknown }
  | { success: false; error: string; notes: string[] }

type RepairSchema = z.ZodType | JSONSchemaLike | undefined

export function parseToolInput<Schema extends z.ZodType>(
  toolID: string,
  schema: Schema,
  raw: unknown,
): ToolInputParseResult<z.infer<Schema>> {
  const first = schema.safeParse(raw)
  if (first.success) {
    const normalized = repairToolInputCandidate(toolID, raw, schema)
    if (normalized.repaired) {
      const checked = schema.safeParse(normalized.input)
      if (checked.success) {
        return {
          success: true,
          data: checked.data,
          repaired: true,
          notes: normalized.notes,
          input: normalized.input,
        }
      }
    }
    return { success: true, data: first.data, repaired: false, notes: [], input: raw }
  }

  const repaired = repairToolInputCandidate(toolID, raw, schema)
  if (!repaired.repaired) {
    return { success: false, error: formatToolInputError(toolID, first.error, schema), notes: [] }
  }

  const second = schema.safeParse(repaired.input)
  if (second.success) {
    return {
      success: true,
      data: second.data,
      repaired: true,
      notes: repaired.notes,
      input: repaired.input,
    }
  }

  return {
    success: false,
    error: formatToolInputError(toolID, second.error, schema),
    notes: repaired.notes,
  }
}

export function repairToolInputCandidate(toolID: string, raw: unknown, schema?: RepairSchema): ToolInputRepairResult {
  const notes: string[] = []
  const parsed = parseSerialized(raw, notes, "input")
  const unwrapped = unwrapTopLevel(parsed, notes)
  const input = repairValue(unwrapped, schema, [], notes)
  return {
    input,
    repaired: notes.length > 0,
    notes: uniqueNotes(notes, toolID),
  }
}

export function formatToolInputError(toolID: string, error: z.ZodError, schema?: z.ZodType) {
  const issues = error.issues.slice(0, 6).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)"
    return `- ${path}: ${issue.message}`
  })
  const remaining = error.issues.length - issues.length
  if (remaining > 0) issues.push(`- ...and ${remaining} more issue${remaining === 1 ? "" : "s"}`)

  const shape = schema ? exampleShape(schema) : undefined
  return [
    `Tool call failed for ${toolID}. Please retry with arguments that match the expected schema.`,
    "Corrections needed:",
    ...issues,
    shape ? `Expected shape: ${JSON.stringify(shape)}` : undefined,
  ]
    .filter(Boolean)
    .join("\n")
}

function repairValue(value: unknown, schema: RepairSchema, path: Path, notes: string[]): unknown {
  if (!schema) return repairGeneric(value, path, notes)
  if (isZodSchema(schema)) return repairZodValue(value, schema, path, notes)
  return repairJsonSchemaValue(value, schema, path, notes)
}

function repairZodValue(value: unknown, schema: z.ZodType, path: Path, notes: string[]): unknown {
  const def = zodDef(schema)
  const type = def?.type

  if ((type === "optional" || type === "default" || type === "catch") && isNullishToken(value)) {
    notes.push(`${formatPath(path)}: treated null-like optional value as omitted`)
    return undefined
  }

  if (type === "nullable" && isStringNull(value)) {
    notes.push(`${formatPath(path)}: converted "null" to null`)
    return null
  }

  switch (type) {
    case "optional":
    case "default":
    case "catch":
    case "nullable":
      return repairValue(value, def.innerType, path, notes)

    case "pipe":
      return repairValue(value, def.in, path, notes)

    case "object":
      return repairObject(value, getZodShape(schema), path, notes)

    case "array":
      return repairArray(value, def.element, path, notes)

    case "string":
      return repairString(value, path, notes)

    case "number":
      return repairNumber(value, path, notes)

    case "boolean":
      return repairBoolean(value, path, notes)

    case "union":
      return repairUnion(value, def.options ?? [], path, notes)

    default:
      return repairGeneric(value, path, notes)
  }
}

function repairJsonSchemaValue(value: unknown, schema: JSONSchemaLike, path: Path, notes: string[]): unknown {
  if (schema.anyOf?.length) return repairJsonUnion(value, schema.anyOf, path, notes)
  if (schema.oneOf?.length) return repairJsonUnion(value, schema.oneOf, path, notes)
  if (schema.allOf?.length) {
    return schema.allOf.reduce((next, item) => repairJsonSchemaValue(next, item, path, notes), value)
  }

  const types = new Set(Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [])
  if (types.has("null") && isStringNull(value)) {
    notes.push(`${formatPath(path)}: converted "null" to null`)
    return null
  }
  if (!types.has("null") && isNullishToken(value)) return value

  if (types.has("object") || schema.properties) {
    return repairObject(value, schema.properties ?? {}, path, notes)
  }
  if (types.has("array")) {
    const itemSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items
    return repairArray(value, itemSchema, path, notes)
  }
  if (types.has("string")) return repairString(value, path, notes)
  if (types.has("number") || types.has("integer")) return repairNumber(value, path, notes)
  if (types.has("boolean")) return repairBoolean(value, path, notes)

  return repairGeneric(value, path, notes)
}

function repairObject(value: unknown, shape: Record<string, RepairSchema>, path: Path, notes: string[]) {
  const parsed = parseSerialized(value, notes, formatPath(path))
  if (!isRecord(parsed)) return repairGeneric(parsed, path, notes)

  const result: Record<string, unknown> = { ...parsed }
  for (const [key, childSchema] of Object.entries(shape)) {
    if (!(key in result)) continue
    const next = repairValue(result[key], childSchema, [...path, key], notes)
    if (next === undefined) delete result[key]
    else result[key] = next
  }
  return result
}

function repairArray(value: unknown, itemSchema: RepairSchema, path: Path, notes: string[]) {
  const parsed = parseSerialized(value, notes, formatPath(path))
  if (Array.isArray(parsed)) {
    return parsed.map((item, index) => repairValue(item, itemSchema, [...path, index], notes))
  }

  if (typeof parsed === "string" && acceptsString(itemSchema)) {
    notes.push(`${formatPath(path)}: wrapped single string as array`)
    return [repairValue(parsed, itemSchema, [...path, 0], notes)]
  }

  return repairGeneric(parsed, path, notes)
}

function repairString(value: unknown, path: Path, notes: string[]) {
  if (typeof value !== "string") return value
  if (!isPathLike(path)) return value

  const stripped = stripPathMarkup(value)
  if (stripped !== value) {
    notes.push(`${formatPath(path)}: removed markdown link markup from path`)
    return stripped
  }
  return value
}

function repairNumber(value: unknown, path: Path, notes: string[]) {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!trimmed) return value
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return value
  notes.push(`${formatPath(path)}: converted numeric string to number`)
  return numeric
}

function repairBoolean(value: unknown, path: Path, notes: string[]) {
  if (typeof value !== "string") return value
  const trimmed = value.trim().toLowerCase()
  if (trimmed !== "true" && trimmed !== "false") return value
  notes.push(`${formatPath(path)}: converted boolean string to boolean`)
  return trimmed === "true"
}

function repairUnion(value: unknown, options: RepairSchema[], path: Path, notes: string[]) {
  for (const option of options) {
    if (isZodSchema(option) && option.safeParse(value).success) return value
  }

  for (const option of options) {
    const localNotes: string[] = []
    const candidate = repairValue(value, option, path, localNotes)
    if (isZodSchema(option) && option.safeParse(candidate).success) {
      notes.push(...localNotes)
      return candidate
    }
    if (option && !isZodSchema(option) && jsonSchemaAccepts(option, candidate)) {
      notes.push(...localNotes)
      return candidate
    }
  }

  return repairGeneric(value, path, notes)
}

function repairJsonUnion(value: unknown, options: JSONSchemaLike[], path: Path, notes: string[]) {
  for (const option of options) {
    if (jsonSchemaAccepts(option, value)) return value
  }

  for (const option of options) {
    const localNotes: string[] = []
    const candidate = repairJsonSchemaValue(value, option, path, localNotes)
    if (jsonSchemaAccepts(option, candidate)) {
      notes.push(...localNotes)
      return candidate
    }
  }

  return repairGeneric(value, path, notes)
}

function repairGeneric(value: unknown, path: Path, notes: string[]): unknown {
  if (Array.isArray(value)) return value.map((item, index) => repairGeneric(item, [...path, index], notes))
  if (isRecord(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = repairGeneric(item, [...path, key], notes)
    }
    return result
  }
  return repairString(value, path, notes)
}

function unwrapTopLevel(value: unknown, notes: string[]) {
  if (!isRecord(value)) return value
  const keys = Object.keys(value)
  if (keys.length !== 1) return value
  const key = keys[0]
  if (!["args", "input", "parameters"].includes(key)) return value
  notes.push(`input: unwrapped top-level ${key} object`)
  return value[key]
}

function parseSerialized(value: unknown, notes: string[], label: string) {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  if (!trimmed) return value
  if (!["{", "["].includes(trimmed[0])) return value

  try {
    const parsed = JSON.parse(trimmed)
    notes.push(`${label}: parsed JSON string`)
    return parsed
  } catch {
    return value
  }
}

function stripPathMarkup(value: string) {
  const markdown = value.match(/^\s*\[([^\]]+)\]\([^)]+\)\s*$/)
  if (markdown) return markdown[1]
  const angle = value.match(/^\s*<([^>]+)>\s*$/)
  if (angle) return angle[1]
  return value
}

function isPathLike(path: Path) {
  const key = String(path[path.length - 1] ?? "").toLowerCase()
  return ["path", "filepath", "file_path", "absolutepath", "absolute_path", "workdir", "cwd", "directory", "dir"].includes(
    key,
  )
}

function isNullishToken(value: unknown) {
  return value === null || value === undefined || isStringNull(value) || isStringUndefined(value)
}

function isStringNull(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase() === "null"
}

function isStringUndefined(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase() === "undefined"
}

function acceptsString(schema: RepairSchema): boolean {
  if (!schema) return false
  if (isZodSchema(schema)) {
    const def = zodDef(schema)
    if (def?.type === "string") return true
    if (["optional", "default", "catch", "nullable", "pipe"].includes(def?.type)) {
      return acceptsString(def.innerType ?? def.in)
    }
    if (def?.type === "union") return (def.options ?? []).some((option: RepairSchema) => acceptsString(option))
    return false
  }

  const types = new Set(Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [])
  if (types.has("string")) return true
  return [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some((option) => acceptsString(option))
}

function jsonSchemaAccepts(schema: JSONSchemaLike, value: unknown): boolean {
  if (schema.enum && !schema.enum.some((item) => item === value)) return false
  if (schema.anyOf?.length) return schema.anyOf.some((item) => jsonSchemaAccepts(item, value))
  if (schema.oneOf?.length) return schema.oneOf.some((item) => jsonSchemaAccepts(item, value))
  if (schema.allOf?.length) return schema.allOf.every((item) => jsonSchemaAccepts(item, value))

  const types = new Set(Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [])
  if (value === null) return types.has("null")
  if (types.size === 0 && !schema.properties) return true
  if (types.has("string") && typeof value === "string") return true
  if (types.has("number") && typeof value === "number" && Number.isFinite(value)) return true
  if (types.has("integer") && Number.isInteger(value)) return true
  if (types.has("boolean") && typeof value === "boolean") return true
  if (types.has("array") && Array.isArray(value)) {
    const itemSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items
    return !itemSchema || value.every((item) => jsonSchemaAccepts(itemSchema, item))
  }
  if ((types.has("object") || schema.properties) && isRecord(value)) {
    const required = schema.required ?? []
    if (required.some((key) => !(key in value))) return false
    return Object.entries(schema.properties ?? {}).every(([key, child]) => !(key in value) || jsonSchemaAccepts(child, value[key]))
  }
  return false
}

function exampleShape(schema: z.ZodType): unknown {
  const def = zodDef(schema)
  switch (def?.type) {
    case "object":
      return Object.fromEntries(Object.entries(getZodShape(schema)).map(([key, value]) => [key, exampleShape(value as z.ZodType)]))
    case "array":
      return [exampleShape(def.element)]
    case "string":
      return "<string>"
    case "number":
      return "<number>"
    case "boolean":
      return "<boolean>"
    case "optional":
    case "default":
    case "catch":
      return `${String(exampleShape(def.innerType))} | omit`
    case "nullable":
      return `${String(exampleShape(def.innerType))} | null`
    case "pipe":
      return exampleShape(def.in)
    case "union":
      return (def.options ?? []).map((option: z.ZodType) => exampleShape(option)).join(" | ")
    default:
      return "<value>"
  }
}

function getZodShape(schema: z.ZodType): Record<string, z.ZodType> {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape
  if (shape) return shape
  const def = zodDef(schema)
  return typeof def?.shape === "function" ? def.shape() : (def?.shape ?? {})
}

function zodDef(schema: z.ZodType): any {
  return (schema as unknown as { def?: unknown; _def?: unknown }).def ?? (schema as unknown as { _def?: unknown })._def
}

function isZodSchema(schema: RepairSchema): schema is z.ZodType {
  return Boolean(schema && typeof (schema as z.ZodType).safeParse === "function")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function formatPath(path: Path) {
  return path.length ? path.join(".") : "input"
}

function uniqueNotes(notes: string[], toolID: string) {
  return Array.from(new Set(notes)).map((note) => `${toolID}: ${note}`)
}
