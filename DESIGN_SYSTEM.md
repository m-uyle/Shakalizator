# Design System & UI Component Manifest (`DESIGN_SYSTEM.md`)

## 1. CSS Custom Properties Hierarchy

- **Surface & Background**: `--surface-canvas`, `--surface-checker`, `--surface-panel`, `--surface-tooltip`
- **Text & Typography**: `--font-sans`, `--text-contrast`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-warning`, `--text-size-caption`, `--text-size-body`, `--text-size-control`, `--text-size-brand`
- **Borders & Dividers**: `--border-active`, `--border-control`, `--border-control-hover`, `--border-divider`, `--border-focus`, `--border-subtle`
- **Interactive States**: `--state-hover`, `--state-active`, `--state-selected`, `--state-fill`, `--state-fill-hover`
- **Elevation & Shadows**: `--shadow-lg`, `--shadow-canvas`, `--elevation-dropdown`, `--elevation-canvas`
- **Motion & Opacity**: `--opacity-disabled`, `--opacity-locked`, `--duration-scrubber`, `--duration-fast`, `--duration-ui`, `--duration-spin`, `--transition-ui`, `--transition-fast`, `--transition-scrubber`, `--press-scale-control`, `--press-scale-pill`, `--press-scale-icon`
- **Spacing Scale**: `--space-0`, `--space-0-5`, `--space-1`, `--space-1-5`, `--space-2`, `--space-2-5`, `--space-3`, `--space-3-5`, `--space-4`, `--space-5`, `--space-6`, `--space-12`, `--space-control-px`, `--space-viewport-frame`, `--space-toolbar-inset`, `--space-toolbar-dock-pad`
- **Layout, Control & Icon Dimensions**: `--size-sidebar-w`, `--size-control-h`, `--size-pill-h`, `--size-icon-btn`, `--size-checkbox`, `--size-thumb`, `--size-icon-xs`, `--size-icon-sm`, `--size-icon-md`, `--size-icon-check`, `--size-arrow-h`, `--size-dropdown-max-h`, `--size-mobile-stage-min-h`, `--size-mobile-stage-min-h-compact`, `--size-mobile-sidebar-max-h`, `--size-scrollbar`
- **Radius Scale**: `--radius-checkbox`, `--radius-control`, `--radius-full`, `--radius-item`, `--radius-viewport-panel`, `--radius-pill`
- **Z-Index Layers**: `--z-canvas`, `--z-scrubber-label`, `--z-sidebar`, `--z-floating`, `--z-dropdown`, `--z-tooltip`
- **Component Tokens (Checkbox)**: `--checkbox-bg`, `--checkbox-bg-hover`, `--icon-check`, `--icon-minus`

## 2. UI Component Governance (`[UI-01..08]`)

- Interactive HTML primitives (`<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`) are encapsulated inside `src/shared/ui/`.
- Non-interactive tags (`<div>`, `<span>`) must not be disguised with `role="button"`, `onClick`, or untyped JSX spread outside `src/shared/ui/`.

<!-- AUTO-SYNC:DESIGN-SYSTEM-START -->
## 3. UI Component Registry (`src/shared/ui/`)

| Component | Path | Contract |
| :--- | :--- | :--- |
| `button` | `src/shared/ui/button` | Canonical shared UI primitive |
| `checkbox` | `src/shared/ui/checkbox` | Canonical shared UI primitive |
| `file-trigger` | `src/shared/ui/file-trigger` | Canonical shared UI primitive |
| `icon` | `src/shared/ui/icon` | Canonical shared UI primitive |
| `scrubber` | `src/shared/ui/scrubber` | Canonical shared UI primitive |
| `select` | `src/shared/ui/select` | Canonical shared UI primitive |
| `tooltip` | `src/shared/ui/tooltip` | Canonical shared UI primitive |
<!-- AUTO-SYNC:DESIGN-SYSTEM-END -->

## 4. Documented Component Contracts

### `button` (`src/shared/ui/button/button.js`, `src/shared/ui/button/button.css`)

- **Level:** Atomic Control (native `<button>`, default `type="button"`).
- **CAS 4-Slot Anatomy:** `leading` (`.ui-btn__leading`, `aria-hidden="true"`), `label` (`.ui-btn__content`), `trailing` (`.ui-btn__trailing`, `aria-hidden="true"`), `meta` (`.ui-btn__meta`).
- **Orthogonal Variants & Sizes:** `variant`: `"default" | "ghost" | "pill" | "pillActive" | "pillGhost"`; `size`: `"full" | "pill" | "icon" | "pillIcon"`.
- **Lifecycle & Controls:** `{ element, setLabel, setDisabled, setPressed, setVariant, setExtraClass, destroy }`; hold events (`onHoldStart`/`onHoldEnd`) track active hold state per instance and tear down via `AbortController`.

### `checkbox` (`src/shared/ui/checkbox/checkbox.js`, `src/shared/ui/checkbox/checkbox.css`)

- **Level:** Atomic Toggle Control (native `<input type="checkbox">`, optional `<label>` wrapper).
- **Slots & States:** `.ui-checkbox`, `.ui-checkbox-label`, `.ui-checkbox-label__text`; supports checked, indeterminate (`mixed`), disabled, focus-visible, and forced-colors states.
- **Lifecycle & Controls:** `{ element, input, setChecked, setIndeterminate, setDisabled, isChecked, destroy }` via `AbortController`.

### `file-trigger` (`src/shared/ui/file-trigger/file-trigger.js`)

- **Level:** Compound Upload Trigger (composes `button` with hidden `<input type="file">`).
- **Slots & States:** `.ui-file-trigger`, hidden `<input type="file" tabindex="-1" aria-hidden="true">`, interactive `button` (supports CAS slots `leading`, `trailing`, `variant`, `size`, `tooltip`).
- **Lifecycle & Controls:** `{ element, button, input, openPicker, setDisabled, destroy }` with synchronized `disabled` and `AbortController` teardown.

### `icon` (`src/shared/ui/icon/icon.js`, `src/shared/ui/icon/icon.css`)

- **Level:** Atomic Visual / Indicator Primitive (`<svg>` DOM elements without `innerHTML`).
- **Icons:** `chevron-down`, `close`, `arrow-right`, `shakal-demo`, `spinner`, `check`, `trash`, `alert`.
- **A11y:** Default decorative (`aria-hidden="true"`, `focusable="false"`, `pointer-events: none`); standalone support with `options.ariaLabel` (`role="img"`).
- **Animation:** Continuous GPU rotation on `.ui-icon--spinner` with `prefers-reduced-motion` suppression.

### `scrubber` (`src/shared/ui/scrubber/scrubber.js`, `src/shared/ui/scrubber/scrubber.css`)

- **Level:** Data & Visualization Control (`role="slider"`, `tabindex="0"`, WAI-ARIA APG slider pattern).
- **Slots & Visuals:** `.ui-scrubber`, GPU-translated `.ui-scrubber__fill`, `.ui-scrubber__value`, `.ui-scrubber__empty`.
- **Interaction & Keyboard:** Drag scrubbing with pointer/touch bounding clamping; keyboard navigation (`ArrowLeft/Right/Down/Up`, `PageUp/Down`, `Home/End`).
- **Lifecycle & Controls:** `{ element, update({ value, min, max, percent, isFull, disabled, emptyLabel }), destroy }` with window blur/touchcancel safety and `AbortController` teardown.

### `select` (`src/shared/ui/select/select.js`, `src/shared/ui/select/select.css`)

- **Level:** Compound Selection Control (CAS 4 slots: leading, label/content, trailing chevron, popup listbox).
- **A11y:** WAI-ARIA APG Collapsible Listbox pattern (`role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, `role="listbox"`, `role="group"`, `role="option"`, `aria-selected`).
- **Keyboard Navigation:** Trigger opens with `ArrowDown`/`ArrowUp`; listbox navigates via `ArrowDown`/`ArrowUp`, `Home`/`End`, `PageUp`/`PageDown`, `Tab` closes; `Escape` closes and restores focus without leaking to parent dialogs.
- **Lifecycle & Controls:** `{ element, trigger, panel, setOptions(groups, selectedValue, fallbackLabel), setValue(value, fallbackLabel), setDisabled(disabled, emptyText), setLocked(locked), getValue(), isOpen(), open(), close(), destroy() }` with clean `AbortController` signal teardown.

### `tooltip` (`src/shared/ui/tooltip/tooltip.js`, `src/shared/ui/tooltip/tooltip.css`)

- **Level:** Floating Feedback / Hint Primitive (`role="tooltip"`, HTML Top-Layer popover `hint`/`manual`, `@starting-style`).
- **A11y & WCAG 1.4.13:** `aria-describedby` linkage to trigger (cleared when text is empty); hoverable (`pointer-events: auto` on open); dismissible on `Escape` with event propagation suppression without moving focus.
- **Positioning:** Clamped viewport bounds with dynamic flip (`data-placement="top|bottom"`), subpixel CSS custom property anchoring (`--tooltip-x`, `--tooltip-y`).
- **Lifecycle & Controls:** `{ show(), hide(), isOpen(), element, setText(nextText), destroy() }` with external `options.signal` lifecycle binding, timer debouncing, and DOM cleanup.

### `select` (`src/shared/ui/select/select.js`, `src/shared/ui/select/select.css`)

- **Level:** Compound Selection Control (CAS 4 slots: leading, label/content, trailing chevron, popup listbox).
- **A11y:** WAI-ARIA APG Collapsible Listbox pattern (`role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`, `role="listbox"`, `role="group"`, `role="option"`, `aria-selected`).
- **Keyboard Navigation:** Trigger opens with `ArrowDown`/`ArrowUp`; listbox navigates via `ArrowDown`/`ArrowUp`, `Home`/`End`, `PageUp`/`PageDown`, `Tab` closes; `Escape` closes and restores focus without leaking to parent dialogs.
- **Lifecycle & Controls:** `{ element, trigger, panel, setOptions(groups, selectedValue, fallbackLabel), setValue(value, fallbackLabel), setDisabled(disabled, emptyText), setLocked(locked), getValue(), isOpen(), open(), close(), destroy() }` with clean `AbortController` signal teardown.

### `tooltip` (`src/shared/ui/tooltip/tooltip.js`, `src/shared/ui/tooltip/tooltip.css`)

- **Level:** Floating Feedback / Hint Primitive (`role="tooltip"`, HTML Top-Layer popover `hint`/`manual`, `@starting-style`).
- **A11y & WCAG 1.4.13:** `aria-describedby` linkage to trigger (cleared when text is empty); hoverable (`pointer-events: auto` on open); dismissible on `Escape` with event propagation suppression without moving focus.
- **Positioning:** Clamped viewport bounds with dynamic flip (`data-placement="top|bottom"`), subpixel CSS custom property anchoring (`--tooltip-x`, `--tooltip-y`).
- **Lifecycle & Controls:** `{ show(), hide(), isOpen(), element, setText(nextText), destroy() }` with external `options.signal` lifecycle binding, timer debouncing, and DOM cleanup.
