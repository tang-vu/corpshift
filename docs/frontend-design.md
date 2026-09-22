# CorpShift visual language

The interface treats corporate actions as a matter of precise accounting.
Warm paper, dark green ink and vermilion signals reference financial documents
and technical field notes. Large DM Sans headlines pair with Instrument Serif
emphasis; IBM Plex Mono is reserved for labels, addresses and measurements.

The overview explains the product through an interactive stock-split model,
then exposes public deployment evidence, the processing sequence, a valuation
comparison and actual API observations. The model is explicitly an illustration
and never submits transactions. Protocol Lab remains the transactional demo.

Use whitespace, rules and typographic hierarchy to group information. Keep
colour semantic: green for preserved/allowed, red for loss/blocked, and orange
for the primary action. Preserve visible focus rings, labelled controls,
reduced-motion behaviour and scroll containers around wide data tables.

Shared tokens and the editorial layouts live in `apps/web/src/index.css`;
common data surfaces live in `components/ui.tsx`. The public website serves the
production Vite build, so a frontend update needs `pnpm --filter @corpshift/web
build`; no PM2 restart or sandbox reset is needed for static changes.
