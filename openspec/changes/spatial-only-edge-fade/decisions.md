# Decisions

Generated from the decision store. Edits here are not read back as answers.

## planning — y-axis-column

- Kind: question
- Blocking: no

Issue #75 asks for two things: stop the right edge fade masking pie/heatmap charts, and *potentially* stop reserving the 55px Y-axis column for them too. The fade fix is one gated predicate in `chart.ts`. Collapsing the column is a layout change — a pie is centred in `width - yAxisWidth`, so today it sits left of centre with an empty gutter; collapsing recentres it and gives it ~55px more width, but shifts the layout of every existing pie/heatmap chart and touches `yAxisWidth`'s other consumers (navigator, `<YAxis>` element, overlay geometry). Which scope should this task take?

Options:

- `fade-only`: Fade only (recommended — fixes the reported masking, no layout shift for existing charts)
- `collapse-column`: Also auto-collapse the Y-axis column on spatial-only charts (pie recentres and grows; every existing pie/heatmap chart shifts)

Status: answered by owner at 2026-08-29T10:16:06.379Z.
Answer: Also auto-collapse the Y-axis column on spatial-only charts (pie recentres and grows; every existing pie/heatmap chart shifts)

