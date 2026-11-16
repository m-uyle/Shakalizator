# Project Architecture Manifest (`ARCHITECTURE.md`)

## 1. Layer Hierarchy & Dependency Direction
Dependencies flow strictly downward from upper presentation layers to lower domain and shared layers:
- **Tier 4 (`src/app/`)**: Application bootstrap, routing, global providers, root styles.
- **Tier 3 (`src/pages/`, `src/widgets/`)**: Page compositions and independent presentation widgets (`[FSD-01..04]`).
- **Tier 2 (`src/features/`, `src/state/`)**: User scenarios and headless reactive state (`[DOM-02]`: zero direct DOM mutations).
- **Tier 1 (`src/entities/`, `src/core/`)**: Pure business models and deterministic calculations (`[DOM-01..08]`: zero browser/DOM/network I/O).
- **Tier 0 (`src/shared/`)**: Reusable UI primitives (`src/shared/ui/`), utilities, and CSS tokens (`[TOK-01..06]`).

<!-- AUTO-SYNC:ARCHITECTURE-START -->
## 2. Live Module & Slice Registry

| Layer | Discovered Modules / Slices |
| :--- | :--- |
| `src/app/` | `main.js` |
| `src/pages/` | _(none)_ |
| `src/widgets/` | `compression-controls`, `queue-panel`, `viewport-canvas`, `viewport-toolbar` |
| `src/features/` | _(none)_ |
| `src/state/` | `index.js`, `store.js` |
| `src/entities/` | _(none)_ |
| `src/core/` | `compression`, `viewport` |
| `src/shared/` | `platform`, `ui` |
<!-- AUTO-SYNC:ARCHITECTURE-END -->
