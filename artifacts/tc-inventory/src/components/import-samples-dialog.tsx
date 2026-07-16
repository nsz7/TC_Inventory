import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Upload, FileText, X } from "lucide-react";

// ── column mapping ─────────────────────────────────────────────────────────

interface CsvRow {
  id: string;
  cultivar: string;
  stageCode: string;
  stage: string;
  date: string;
  media: string;
  vessel: string;
  vessels: string;
  vesselsCurrent: string;
  status: string;
  location: string;
}

interface ImportRow {
  sampleCode: string;
  cultivar: string;
  stage: string;
  dateInitiated: string;
  mediaType: string | null;
  containerType: string | null;
  quantity: number;
  status: string;
  location: string;
  _warning?: string;
}

/** Stage name normalisation — handles typos in the CSV */
function mapStage(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s.includes("introd")) return "initiation";
  if (s.includes("revit") || s.includes("root")) return "rooting";
  if (s.includes("mult")) return "multiplication";
  if (s.includes("accli")) return "acclimatization";
  if (s.includes("long") || s.includes("stor")) return "long-term storage";
  return s || "initiation";
}

/** Status mapping from CSV to DB values */
function mapStatus(raw: string): string {
  switch (raw.toLowerCase().trim()) {
    case "active": return "active";
    case "inactive": return "archived";
    case "removed": return "discarded";
    case "contaminated": return "contaminated";
    default: return "active";
  }
}

/** Parse M/D/YYYY or MM/DD/YYYY → YYYY-MM-DD */
function parseDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parts = raw.trim().split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

/** Simple CSV parser — handles comma-separated values, no quoting complexity */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

/** Detect which CSV column corresponds to which field by checking headers */
function detectColumn(headers: string[], ...candidates: string[]): string {
  const hs = headers.map((h) => h.toLowerCase());
  for (const c of candidates) {
    const idx = hs.indexOf(c.toLowerCase());
    if (idx !== -1) return headers[idx];
  }
  return "";
}

function csvRowToImport(raw: Record<string, string>, colMap: Record<string, string>): ImportRow {
  const id = (raw[colMap.id] ?? "").trim();
  const stageCode = (raw[colMap.stageCode] ?? "").trim();
  const sampleCode = stageCode ? `${id}-${stageCode}` : id;

  const qty = parseInt(raw[colMap.vesselsCurrent] ?? raw[colMap.vessels] ?? "0", 10);
  const status = mapStatus(raw[colMap.status] ?? "");
  const stage = mapStage(raw[colMap.stage] ?? "");
  const location = (raw[colMap.location] ?? "").trim();
  const cultivar = (raw[colMap.cultivar] ?? "").trim();
  const dateInitiated = parseDate(raw[colMap.date] ?? "");
  const mediaType = (raw[colMap.media] ?? "").trim() || null;
  const containerType = (raw[colMap.vessel] ?? "").trim() || null;

  const warnings: string[] = [];
  if (!id) warnings.push("Missing ID");
  if (!cultivar) warnings.push("Missing cultivar");
  if (!location) warnings.push("Missing location");

  return {
    sampleCode,
    cultivar,
    stage,
    dateInitiated,
    mediaType,
    containerType,
    quantity: isNaN(qty) ? 0 : qty,
    status,
    location,
    _warning: warnings.join("; ") || undefined,
  };
}

// ── status / stage badge colours ───────────────────────────────────────────

function StatusBadge({ s }: { s: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    archived: "bg-blue-100 text-blue-800",
    discarded: "bg-gray-100 text-gray-800",
    contaminated: "bg-red-100 text-red-800",
  };
  return (
    <Badge variant="outline" className={`border-0 text-xs capitalize ${colors[s] ?? "bg-gray-100 text-gray-800"}`}>
      {s}
    </Badge>
  );
}

// ── main component ─────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}

type Step = "upload" | "preview" | "importing" | "done";

export function ImportSamplesDialog({ open, onOpenChange, onImported }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ created: 0, skipped: 0, errors: [] as string[] });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function reset() {
    setStep("upload");
    setFileName("");
    setRows([]);
    setProgress(0);
    setResults({ created: 0, skipped: 0, errors: [] });
    if (textareaRef.current) textareaRef.current.value = "";
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function processText(text: string, name = "") {
    const raw = parseCSV(text);
    if (raw.length === 0) return;
    const headers = Object.keys(raw[0]);
    const colMap = {
      id: detectColumn(headers, "ID", "id", "sample_id", "code"),
      stageCode: detectColumn(headers, "stage_code", "stagecode", "sub_code", "subcode"),
      cultivar: detectColumn(headers, "Cultivar", "cultivar", "variety"),
      stage: detectColumn(headers, "Stage", "stage"),
      date: detectColumn(headers, "Date", "date", "date_initiated", "dateInitiated"),
      media: detectColumn(headers, "Media", "media", "media_type", "mediaType"),
      vessel: detectColumn(headers, "Vessel", "vessel", "container", "container_type"),
      vesselsCurrent: detectColumn(headers, "Vessels_current", "vessels_current", "current_vessels", "quantity"),
      vessels: detectColumn(headers, "Vessels", "vessels", "initial_vessels"),
      status: detectColumn(headers, "Status", "status"),
      location: detectColumn(headers, "Location", "location"),
    };
    const parsed = raw.map((r) => csvRowToImport(r, colMap)).filter((r) => r.sampleCode);
    setRows(parsed);
    setFileName(name);
    setStep("preview");
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => processText(e.target?.result as string, file.name);
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handlePasteImport() {
    const text = textareaRef.current?.value ?? "";
    if (text.trim()) processText(text, "pasted CSV");
  }

  async function runImport() {
    setStep("importing");
    setProgress(0);
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row._warning && !row.sampleCode) {
        skipped++;
      } else {
        try {
          const resp = await fetch("/api/samples", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sampleCode: row.sampleCode,
              cultivar: row.cultivar,
              stage: row.stage,
              dateInitiated: row.dateInitiated,
              mediaType: row.mediaType,
              containerType: row.containerType,
              quantity: row.quantity,
              status: row.status,
              location: row.location,
            }),
          });
          if (resp.ok) {
            created++;
          } else {
            const body = await resp.json().catch(() => ({}));
            const msg = body?.message ?? body?.error ?? resp.statusText;
            errors.push(`${row.sampleCode}: ${msg}`);
            skipped++;
          }
        } catch (err) {
          errors.push(`${row.sampleCode}: network error`);
          skipped++;
        }
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }

    setResults({ created, skipped, errors });
    setStep("done");
    if (created > 0) onImported();
  }

  const validRows = rows.filter((r) => !r._warning);
  const warnRows = rows.filter((r) => r._warning);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Samples from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file or paste CSV text. Columns detected: ID, stage_code, Cultivar, Stage, Date, Media, Vessel, Vessels_current, Status, Location.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ── UPLOAD STEP ──────────────────────────────────────── */}
          {step === "upload" && (
            <div className="space-y-4 py-2">
              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium text-foreground">Drop a CSV file here</p>
                <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">or paste CSV text</span>
                <div className="flex-1 border-t" />
              </div>

              <textarea
                ref={textareaRef}
                rows={6}
                placeholder={"ID,Cultivar,stage_code,Stage,Date,Media,Vessel,Vessels,Vessels_current,Status,Location\nFA26_001,E_123,m1,multiplication,5/22/2026,MS,magenta,1,1,Active,Shelf A"}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex justify-end">
                <Button onClick={handlePasteImport}>
                  <FileText className="mr-2 h-4 w-4" />Parse CSV
                </Button>
              </div>
            </div>
          )}

          {/* ── PREVIEW STEP ─────────────────────────────────────── */}
          {step === "preview" && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">{fileName}</span>
                <Badge variant="outline" className="bg-green-50 text-green-800 border-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />{rows.length} rows parsed
                </Badge>
                {warnRows.length > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-0">
                    <AlertTriangle className="h-3 w-3 mr-1" />{warnRows.length} with warnings
                  </Badge>
                )}
              </div>

              <div className="rounded-md border overflow-auto max-h-[44vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sample Code</TableHead>
                      <TableHead>Cultivar</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Media</TableHead>
                      <TableHead>Container</TableHead>
                      <TableHead>Vessels</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={i} className={r._warning ? "bg-amber-50/60" : ""}>
                        <TableCell className="font-mono text-xs font-semibold text-primary whitespace-nowrap">
                          {r.sampleCode}
                          {r._warning && (
                            <span className="ml-1.5 text-amber-600" title={r._warning}>
                              <AlertTriangle className="inline h-3 w-3" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.cultivar}</TableCell>
                        <TableCell className="text-xs capitalize">{r.stage}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.dateInitiated}</TableCell>
                        <TableCell className="text-xs">{r.mediaType ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.containerType ?? "—"}</TableCell>
                        <TableCell className="text-xs tabular-nums">{r.quantity}</TableCell>
                        <TableCell><StatusBadge s={r.status} /></TableCell>
                        <TableCell className="text-xs">{r.location}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {warnRows.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
                  <p className="font-medium">Rows with warnings (will still be imported with available data):</p>
                  {warnRows.map((r, i) => (
                    <p key={i}>• <span className="font-mono">{r.sampleCode || "(no code)"}</span> — {r._warning}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── IMPORTING STEP ───────────────────────────────────── */}
          {step === "importing" && (
            <div className="py-10 space-y-6 text-center">
              <p className="text-muted-foreground">Importing {rows.length} samples…</p>
              <Progress value={progress} className="h-2" />
              <p className="text-sm font-mono text-foreground">{progress}%</p>
            </div>
          )}

          {/* ── DONE STEP ────────────────────────────────────────── */}
          {step === "done" && (
            <div className="py-8 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Import complete</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {results.created} sample{results.created !== 1 ? "s" : ""} created
                    {results.skipped > 0 ? `, ${results.skipped} skipped` : ""}
                  </p>
                </div>
              </div>
              {results.errors.length > 0 && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-800 flex items-center gap-1">
                    <X className="h-3 w-3" />Errors:
                  </p>
                  {results.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-700 font-mono">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <DialogFooter className="pt-2 border-t">
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={runImport} disabled={rows.length === 0}>
                Import {rows.length} row{rows.length !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step === "importing" && (
            <Button variant="outline" disabled>Importing…</Button>
          )}
          {step === "done" && (
            <>
              {results.created > 0 && (
                <Button variant="outline" onClick={() => { reset(); }}>
                  Import another file
                </Button>
              )}
              <Button onClick={handleClose}>Close</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
