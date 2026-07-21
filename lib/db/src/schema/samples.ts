import { pgTable, text, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { varietiesTable } from "./varieties";
import { strainsTable } from "./strains";
import { usersTable } from "./users";

/**
 * The permanent identity of a line of material (e.g. FA26_001). Holds no
 * quantity/stage/location — those live on `batches`. A sample gets a new row
 * only on entry into the lab or a genuine lineage branch, never on routine
 * subculture.
 */
export const samplesTable = pgTable(
  "samples",
  {
    id: serial("id").primaryKey(),
    sampleCode: text("sample_code").notNull().unique(), // e.g. "FA26_001"
    categoryCode: text("category_code").notNull(), // e.g. "FA"
    year: text("year").notNull(), // two-digit year, e.g. "26"
    serial: integer("serial").notNull(), // 1, 2, 3... displayed zero-padded to 3 digits
    varietyId: integer("variety_id")
      .notNull()
      .references(() => varietiesTable.id),
    strainId: integer("strain_id").references(() => strainsTable.id),
    archived: boolean("archived").notNull().default(false),
    archivedBy: integer("archived_by").references(() => usersTable.id),
    archivedAt: timestamp("archived_at"),
    archivedReason: text("archived_reason"),
    voided: boolean("voided").notNull().default(false),
    voidedBy: integer("voided_by").references(() => usersTable.id),
    voidedAt: timestamp("voided_at"),
    voidedReason: text("voided_reason"),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedBy: integer("updated_by").references(() => usersTable.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.categoryCode, table.year, table.serial)],
);

export const insertSampleSchema = createInsertSchema(samplesTable).omit({
  id: true,
  sampleCode: true,
  createdAt: true,
  updatedAt: true,
  archived: true,
  archivedBy: true,
  archivedAt: true,
  archivedReason: true,
  voided: true,
  voidedBy: true,
  voidedAt: true,
  voidedReason: true,
});

export type InsertSample = z.infer<typeof insertSampleSchema>;
export type Sample = typeof samplesTable.$inferSelect;
