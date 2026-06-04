import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import type { ProjectID } from "../project/schema"
import { Timestamps } from "../storage/schema.sql"
import { MessageTable, SessionTable } from "./session.sql"
import type { MessageID, SessionID } from "./schema"

export type MemoryType = "episodic" | "semantic" | "procedural"

export const MemoryTable = sqliteTable(
  "session_memory",
  {
    id: text().primaryKey(),
    project_id: text()
      .$type<ProjectID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    session_id: text()
      .$type<SessionID>()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    message_id: text()
      .$type<MessageID>()
      .references(() => MessageTable.id, { onDelete: "set null" }),
    type: text().$type<MemoryType>().notNull(),
    source: text().notNull(),
    title: text(),
    content: text().notNull(),
    keywords: text({ mode: "json" }).$type<string[]>().notNull(),
    weight: integer().notNull(),
    time_accessed: integer(),
    ...Timestamps,
  },
  (table) => [
    index("session_memory_project_idx").on(table.project_id),
    index("session_memory_project_type_idx").on(table.project_id, table.type),
    index("session_memory_session_idx").on(table.session_id),
    index("session_memory_updated_idx").on(table.project_id, table.time_updated),
  ],
)
