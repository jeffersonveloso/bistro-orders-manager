# Operational Hardening — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Define area access policies, session cookie, and shared guard infrastructure | completed | high | — |
| 02 | Build the `/access` entry flow and session lifecycle routes | completed | high | task_01 |
| 03 | Add protected read models and auth-first read APIs for kitchen and salão | completed | high | task_01 |
| 04 | Protect server pages and canonical area redirects | completed | high | task_02, task_03 |
| 05 | Enforce write authorization for kitchen mutations and salão acknowledge flows | completed | high | task_01 |
| 06 | Protect and defer catalog APIs behind the auth matrix | completed | high | task_01 |
| 07 | Align operator clients with protected surfaces and salão contract | completed | high | task_03, task_04, task_05, task_06 |
| 08 | Plan QA coverage and generate QA artifacts with qa-report | completed | medium | task_07 |
| 09 | Execute end-to-end QA and verification with qa-execution | completed | high | task_08 |
