-- Governance prompts: versioned, immutable prompt definitions
CREATE TABLE public.governance_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_name text NOT NULL,
  prompt_version text NOT NULL,
  prompt_status text NOT NULL DEFAULT 'Draft' CHECK (prompt_status IN ('Draft', 'Stable', 'Deprecated')),
  prompt_content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (prompt_name, prompt_version)
);

ALTER TABLE public.governance_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage governance prompts"
  ON public.governance_prompts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Project audit exports: log of generated snapshots
CREATE TABLE public.project_audit_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_version text NOT NULL,
  executed_at timestamp with time zone NOT NULL DEFAULT now(),
  executed_by uuid,
  output_content text NOT NULL,
  output_filename text NOT NULL
);

ALTER TABLE public.project_audit_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit exports"
  ON public.project_audit_exports FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Change impact analyses
CREATE TABLE public.change_impact_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_version text NOT NULL,
  executed_at timestamp with time zone NOT NULL DEFAULT now(),
  executed_by uuid,
  audit_export_id uuid REFERENCES public.project_audit_exports(id) ON DELETE SET NULL,
  change_description text NOT NULL,
  output_content text NOT NULL,
  output_filename text NOT NULL
);

ALTER TABLE public.change_impact_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage impact analyses"
  ON public.change_impact_analyses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Decision logs: immutable governance decisions
CREATE TABLE public.decision_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_title text NOT NULL,
  problem_statement text NOT NULL,
  options_considered text NOT NULL,
  final_decision text NOT NULL,
  decision_rationale text NOT NULL,
  expected_impact text NOT NULL,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Proposed', 'Active', 'Superseded', 'Reversed')),
  owner uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.decision_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage decision logs"
  ON public.decision_logs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_governance_prompts_name_status ON public.governance_prompts(prompt_name, prompt_status);
CREATE INDEX idx_audit_exports_executed_at ON public.project_audit_exports(executed_at DESC);
CREATE INDEX idx_impact_analyses_executed_at ON public.change_impact_analyses(executed_at DESC);
CREATE INDEX idx_decision_logs_created_at ON public.decision_logs(created_at DESC);

-- Seed the three v1.0.0 Stable prompts
INSERT INTO public.governance_prompts (prompt_name, prompt_version, prompt_status, prompt_content) VALUES
('UNIVERSAL PROJECT STATE EXPORT', 'v1.0.0', 'Stable',
'SYSTEM INSTRUCTION: You are operating in STRICT READ-ONLY AUDIT MODE.

ABSOLUTE RULES:
- Do NOT create, modify, refactor, or suggest features
- Do NOT infer or assume missing information
- Do NOT optimize or analyze intent
- Only report what CURRENTLY EXISTS

If something does not exist, explicitly state: "Not currently implemented."

OBJECTIVE: Export a factual snapshot of the current project state.

Sections:
1. Core Data Structures
2. Business Logic & Rules
3. User Input & Data Origins
4. Automation & Background Processes
5. AI or Machine-Assisted Features
6. Integrations & External Dependencies
7. Storage, Files & Assets
8. Constraints & Limits

End with: END OF UNIVERSAL PROJECT STATE EXPORT'),

('UNIVERSAL CHANGE IMPACT ANALYSIS', 'v1.0.0', 'Stable',
'SYSTEM INSTRUCTION: You are operating in ANALYSIS-ONLY MODE.

ABSOLUTE RULES:
- Do NOT implement changes
- Do NOT generate code
- Do NOT propose solutions
- Analyze impact ONLY

OBJECTIVE: Assess how proposed changes would affect the existing system.

Sections:
1. Proposed Changes Summary
2. Affected Components
3. Data Impact
4. Logic & Behavior Impact
5. AI & Automation Impact
6. Risk Identification
7. Dependency & Coupling Analysis
8. Impact Classification (Safe | Moderate | High Risk)

End with: END OF CHANGE IMPACT ANALYSIS'),

('UNIVERSAL DECISION LOG', 'v1.0.0', 'Stable',
'SYSTEM INSTRUCTION: You are operating in DOCUMENTATION-ONLY MODE.

OBJECTIVE: Create an auditable decision record.

Sections:
1. Decision Identifier
2. Problem Statement
3. Options Considered
4. Final Decision
5. Decision Rationale
6. Expected Impact
7. Status

End with: END OF DECISION LOG');