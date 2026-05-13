# Operational Hardening QA Report Fallback Note

- Requested output path: repository root, so the canonical QA artifact tree stays under `./qa/`.
- Preferred planner: the installed `qa-report` skill.
- Execution reality for task 08:
  - the skill is present in this environment
  - the referenced helper scripts under `.agents/skills/qa-report/scripts/` are interactive shell workflows
  - no callable non-interactive generator, MCP endpoint, or repository command was exposed to batch-create the required artifacts
- Result:
  - the Operational Hardening QA plan, regression suite, and test cases were created manually under `./qa/`
  - the structure, sections, automation metadata, and regression tiers follow the `qa-report` skill references
- Impact on task 09:
  - treat these manually created artifacts as the authoritative QA package
  - update execution evidence in `qa/verification-report.md`
  - do not replace the artifacts unless a callable `qa-report` automation path becomes available and produces equivalent or better coverage
