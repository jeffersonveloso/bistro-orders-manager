# Real External Integration — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Define provider sync contracts and domain types | completed | medium | — |
| 02 | Add SQLite sync schema and repository support | completed | high | task_01 |
| 03 | Implement provider adapter selection and Anota canonical snapshot adapter | completed | high | task_01 |
| 04 | Build sync orchestration, idempotency, and exception lifecycle | completed | high | task_01, task_02, task_03 |
| 05 | Expose authenticated webhook, reconciliation, and acknowledge routes | completed | high | task_02, task_03, task_04 |
| 06 | Surface sync exceptions in board, order detail, and salão flows | completed | high | task_02, task_04, task_05 |
| 07 | Draft live integration docs and post-QA finalization checklist | completed | medium | task_05, task_06 |
| 08 | Plan QA coverage and generate QA artifacts with qa-report | completed | medium | task_07 |
| 09 | Execute end-to-end QA and verification with qa-execution | pending | high | task_08 |
