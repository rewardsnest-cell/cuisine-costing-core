import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import { ArrowLeft, Upload, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/leads/import")({
  head: () => ({
    meta: [
      { title: "Import Leads — Admin" },
      { name: "description", content: "Bulk import leads from CSV or spreadsheet with validation and dedupe." },
    ],
  }),
  component: ImportLeadsPage,
});

// ---------- Field definitions ----------
const TARGET_FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company / Venue" },
  { key: "organization_type", label: "Organization Type" },
  { key: "website", label: "Website" },
  { key: "role_department", label: "Role / Department" },
  { key: "address_street", label: "Address Street" },
  { key: "address_city", label: "City" },
  { key: "address_state", label: "State" },
  { key: "address_zip", label: "ZIP" },
  { key: "venue", label: "Venue" },
  { key: "event_type", label: "Event Type" },
  { key: "event_date", label: "Event Date (YYYY-MM-DD)" },
  { key: "guest_count", label: "Guest Count" },
  { key: "est_budget", label: "Estimated Budget" },
  { key: "lead_type", label: "Lead Type" },
  { key: "source", label: "Source" },
  { key: "priority", label: "Priority (low/medium/high)" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
  { key: "tags", label: "Tags (comma-separated)" },
] as const;

type TargetKey = typeof TARGET_FIELDS[number]["key"];
const SKIP = "__skip__";

// Auto-map common header variants
function autoMapHeader(header: string): TargetKey | typeof SKIP {
  const h = header.toLowerCase().trim().replace(/[\s_\-]+/g, "");
  const map: Record<string, TargetKey> = {
    name: "name", fullname: "name", contactname: "name", contact: "name",
    email: "email", emailaddress: "email", mail: "email",
    phone: "phone", phonenumber: "phone", mobile: "phone", tel: "phone",
    company: "company", venue: "company", organization: "company", org: "company", business: "company",
    organizationtype: "organization_type", orgtype: "organization_type", type: "organization_type",
    website: "website", url: "website", site: "website",
    role: "role_department", title: "role_department", department: "role_department", position: "role_department",
    street: "address_street", address: "address_street", addressline1: "address_street",
    city: "address_city",
    state: "address_state", province: "address_state",
    zip: "address_zip", zipcode: "address_zip", postal: "address_zip", postalcode: "address_zip",
    eventtype: "event_type",
    eventdate: "event_date", date: "event_date",
    guests: "guest_count", guestcount: "guest_count", attendees: "guest_count", headcount: "guest_count",
    budget: "est_budget", estbudget: "est_budget", estimatedbudget: "est_budget",
    leadtype: "lead_type",
    source: "source", leadsource: "source",
    priority: "priority",
    status: "status",
    notes: "notes", note: "notes", comments: "notes",
    tags: "tags",
  };
  return map[h] ?? SKIP;
}

const rowSchema = z.object({
  name: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().toLowerCase().email().max(255).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(50).optional().nullable(),
  company: z.string().trim().max(200).optional().nullable(),
  website: z.string().trim().max(500).optional().nullable(),
  guest_count: z.coerce.number().int().nonnegative().optional().nullable(),
  est_budget: z.coerce.number().nonnegative().optional().nullable(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
  priority: z.enum(["low", "medium", "high"]).optional().nullable(),
});

type ParsedRow = Record<string, string>;
type MappedLead = Record<string, any>;
type ValidatedRow = {
  index: number;
  data: MappedLead;
  errors: string[];
  warnings: string[];
  duplicate: "none" | "in-file" | "in-db";
};

// ---------- Component ----------
function ImportLeadsPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, TargetKey | typeof SKIP>>({});
  const [defaults, setDefaults] = useState({ lead_type: "venue", priority: "medium", status: "new", source: "import" });
  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; failed: number } | null>(null);

  // ----- Step 1: file upload -----
  const handleFile = async (file: File) => {
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      let parsedRows: ParsedRow[] = [];
      let parsedHeaders: string[] = [];
      if (ext === "csv" || ext === "tsv" || ext === "txt") {
        const text = await file.text();
        const result = Papa.parse<ParsedRow>(text, { header: true, skipEmptyLines: true });
        parsedRows = result.data;
        parsedHeaders = result.meta.fields ?? [];
      } else if (ext === "xlsx" || ext === "xls") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: "", raw: false });
        parsedRows = json;
        parsedHeaders = json.length > 0 ? Object.keys(json[0]) : [];
      } else {
        toast.error("Unsupported file. Please upload .csv, .tsv, .xlsx, or .xls");
        return;
      }
      if (parsedRows.length === 0) {
        toast.error("No rows found in file.");
        return;
      }
      setHeaders(parsedHeaders);
      setRows(parsedRows);
      // Auto-map
      const auto: Record<string, TargetKey | typeof SKIP> = {};
      for (const h of parsedHeaders) auto[h] = autoMapHeader(h);
      setMapping(auto);
      setStep(2);
      toast.success(`Loaded ${parsedRows.length} rows with ${parsedHeaders.length} columns.`);
    } catch (err: any) {
      toast.error(`Failed to parse file: ${err.message}`);
    }
  };

  // ----- Step 3: validation + dedupe -----
  const runValidation = async () => {
    const mappedRows: MappedLead[] = rows.map((r) => {
      const out: MappedLead = {};
      for (const [src, tgt] of Object.entries(mapping)) {
        if (tgt === SKIP) continue;
        const val = r[src];
        if (val == null || val === "") continue;
        out[tgt] = typeof val === "string" ? val.trim() : val;
      }
      return out;
    });

    // Apply defaults
    for (const r of mappedRows) {
      if (!r.lead_type) r.lead_type = defaults.lead_type;
      if (!r.priority) r.priority = defaults.priority;
      if (!r.status) r.status = defaults.status;
      if (!r.source) r.source = defaults.source;
      if (typeof r.tags === "string") r.tags = r.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
    }

    // Fetch existing emails for dedupe
    const emails = mappedRows.map((r) => r.email?.toLowerCase()).filter(Boolean);
    let existingEmails = new Set<string>();
    if (emails.length > 0) {
      const { data: existing } = await supabase
        .from("leads")
        .select("email")
        .in("email", emails as string[]);
      existingEmails = new Set((existing ?? []).map((e: any) => e.email?.toLowerCase()).filter(Boolean));
    }

    // Validate + dedupe in-file
    const seenEmails = new Set<string>();
    const v: ValidatedRow[] = mappedRows.map((data, index) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      let duplicate: ValidatedRow["duplicate"] = "none";

      // Schema validation
      const parsed = rowSchema.safeParse(data);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push(`${issue.path.join(".")}: ${issue.message}`);
        }
      }

      // Must have at least name OR company OR email
      if (!data.name && !data.company && !data.email) {
        errors.push("Row needs at least a name, company, or email");
      }

      // Dedupe
      const em = data.email?.toLowerCase();
      if (em) {
        if (existingEmails.has(em)) duplicate = "in-db";
        else if (seenEmails.has(em)) duplicate = "in-file";
        seenEmails.add(em);
      }
      if (duplicate !== "none") warnings.push(`Duplicate email (${duplicate})`);

      return { index, data, errors, warnings, duplicate };
    });

    setValidated(v);
    setStep(3);
  };

  // ----- Step 4: import -----
  const runImport = async () => {
    setImporting(true);
    const toInsert = validated.filter((v) => v.errors.length === 0 && v.duplicate === "none").map((v) => v.data);
    const skipped = validated.length - toInsert.length;
    let inserted = 0;
    let failed = 0;

    // Batch in chunks of 200
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error, count } = await supabase.from("leads").insert(chunk, { count: "exact" });
      if (error) {
        failed += chunk.length;
        console.error("Insert error:", error);
        toast.error(`Batch failed: ${error.message}`);
      } else {
        inserted += count ?? chunk.length;
      }
    }

    setResult({ inserted, skipped, failed });
    setImporting(false);
    setStep(4);
    if (inserted > 0) toast.success(`Imported ${inserted} leads.`);
  };

  const validCount = useMemo(() => validated.filter((v) => v.errors.length === 0 && v.duplicate === "none").length, [validated]);
  const errorCount = useMemo(() => validated.filter((v) => v.errors.length > 0).length, [validated]);
  const dupeCount = useMemo(() => validated.filter((v) => v.errors.length === 0 && v.duplicate !== "none").length, [validated]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/catering-contacts"><ArrowLeft className="h-4 w-4 mr-1" />Back to Leads</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import Leads</h1>
        <p className="text-muted-foreground mt-1">Upload a CSV or spreadsheet to bulk-add leads with validation and dedupe.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { n: 1, label: "Upload" },
          { n: 2, label: "Map columns" },
          { n: 3, label: "Review" },
          { n: 4, label: "Done" },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <Badge variant={step >= s.n ? "default" : "outline"}>{s.n}</Badge>
            <span className={step >= s.n ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
            {i < 3 && <span className="text-muted-foreground mx-1">→</span>}
          </div>
        ))}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload file</CardTitle>
            <CardDescription>Accepted: .csv, .tsv, .xlsx, .xls. First row must be column headers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="border-2 border-dashed border-muted rounded-lg p-12 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-muted/30 transition">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
              <span className="text-sm font-medium">Click to choose a file</span>
              <span className="text-xs text-muted-foreground">CSV, TSV, XLSX, XLS</span>
              <input
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Tips:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Common columns auto-detected: name, email, phone, company, city, state, etc.</li>
                <li>Dates should be in YYYY-MM-DD format</li>
                <li>Tags can be comma-separated in a single column</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
            <CardDescription>{fileName} · {rows.length} rows · {headers.length} columns</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3">
              {headers.map((h) => (
                <div key={h} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="font-mono text-sm bg-muted/50 px-3 py-2 rounded">{h}</div>
                  <span className="text-muted-foreground hidden md:inline">→</span>
                  <Select value={mapping[h] ?? SKIP} onValueChange={(v) => setMapping({ ...mapping, [h]: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>— Skip this column —</SelectItem>
                      {TARGET_FIELDS.map((f) => (
                        <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="border-t pt-4 space-y-3">
              <h3 className="font-medium">Defaults for missing values</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Lead type</Label>
                  <Input value={defaults.lead_type} onChange={(e) => setDefaults({ ...defaults, lead_type: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Select value={defaults.priority} onValueChange={(v) => setDefaults({ ...defaults, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">low</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Input value={defaults.status} onChange={(e) => setDefaults({ ...defaults, status: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Source</Label>
                  <Input value={defaults.source} onChange={(e) => setDefaults({ ...defaults, source: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={runValidation}>Validate & Preview</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>
              <span className="text-green-600 font-medium">{validCount} ready</span>
              {" · "}
              <span className="text-amber-600 font-medium">{dupeCount} duplicates</span>
              {" · "}
              <span className="text-red-600 font-medium">{errorCount} errors</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validated.slice(0, 500).map((v) => {
                    const status =
                      v.errors.length > 0 ? "error" :
                      v.duplicate !== "none" ? "duplicate" : "ok";
                    return (
                      <TableRow key={v.index}>
                        <TableCell className="text-xs text-muted-foreground">{v.index + 2}</TableCell>
                        <TableCell>
                          {status === "ok" && <Badge className="bg-green-600">Ready</Badge>}
                          {status === "duplicate" && <Badge variant="outline" className="border-amber-500 text-amber-700">Skip</Badge>}
                          {status === "error" && <Badge variant="destructive">Error</Badge>}
                        </TableCell>
                        <TableCell className="text-sm">{v.data.name || "—"}</TableCell>
                        <TableCell className="text-sm">{v.data.company || "—"}</TableCell>
                        <TableCell className="text-sm">{v.data.email || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[...v.errors, ...v.warnings].join("; ")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {validated.length > 500 && (
                <div className="p-3 text-xs text-muted-foreground text-center border-t">
                  Showing first 500 of {validated.length} rows. All rows will be processed on import.
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={runImport} disabled={importing || validCount === 0}>
                {importing ? "Importing…" : `Import ${validCount} leads`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 */}
      {step === 4 && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Import complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="border rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{result.inserted}</div>
                <div className="text-sm text-muted-foreground">Imported</div>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-amber-600">{result.skipped}</div>
                <div className="text-sm text-muted-foreground">Skipped</div>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-red-600">{result.failed}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate({ to: "/admin/catering-contacts" })}>View Leads</Button>
              <Button variant="outline" onClick={() => { setStep(1); setRows([]); setHeaders([]); setValidated([]); setResult(null); setFileName(""); }}>
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
