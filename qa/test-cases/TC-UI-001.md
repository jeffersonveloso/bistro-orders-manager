## TC-UI-001: Salon Consolidated Status Clarity

**Priority:** P1 (High)
**Type:** UI
**Status:** Not Run
**Estimated Time:** 5 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** Manual-only
**Automation Status:** N/A
**Automation Command/Spec:** none
**Automation Notes:** This case depends on qualitative visual judgment because there is no Figma or visual baseline to assert against.

### Objective

Verify that the salon view communicates one clear consolidated status per order without leaking kitchen-specific operational jargon.

### Preconditions

- [ ] Local app is running
- [ ] Salon route is reachable

### Test Steps

1. Open `/salon`
   **Expected:** The page loads with the heading `Salão`

2. Review the status chips and descriptions
   **Expected:** Orders use customer-facing labels such as `Recebido`, `Em preparo`, `Finalizando`, or `Pronto para entregar`

3. Review one partially-ready order
   **Expected:** The description explains the state without listing per-kitchen breakdown

### Edge Cases

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Mixed progress order | `Pedido 102` | Language stays consolidated and understandable |
| Ready order | `Pedido 103` | Ready state is immediately obvious |

### Automation Notes

- Keep manual until a visual baseline or explicit design contract exists.
