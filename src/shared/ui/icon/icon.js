const SVG_NS = "http://www.w3.org/2000/svg";

const ICON_SPECS = Object.freeze({
  "chevron-down": {
    viewBox: "0 0 24 24",
    strokeWidth: "1.75",
    lineCap: "round",
    lineJoin: "round",
    className: "ui-icon ui-icon--chevron",
    shapes: [{ tag: "polyline", attrs: { points: "6 9 12 15 18 9" } }],
  },
  close: {
    viewBox: "0 0 24 24",
    strokeWidth: "2",
    lineCap: "round",
    lineJoin: "round",
    className: "ui-icon ui-icon--close",
    shapes: [
      { tag: "line", attrs: { x1: "18", y1: "6", x2: "6", y2: "18" } },
      { tag: "line", attrs: { x1: "6", y1: "6", x2: "18", y2: "18" } },
    ],
  },
  "arrow-right": {
    viewBox: "0 0 16 8",
    strokeWidth: "1.5",
    lineCap: "square",
    lineJoin: "miter",
    className: "ui-icon ui-icon--arrow",
    shapes: [
      { tag: "line", attrs: { x1: "0", y1: "4", x2: "14", y2: "4" } },
      { tag: "polyline", attrs: { points: "10 1 14 4 10 7" } },
    ],
  },
  "shakal-demo": {
    viewBox: "0 0 48 48",
    filled: true,
    className: "ui-icon ui-icon--demo",
    shapes: [
      {
        tag: "path",
        attrs: {
          d: "M29.38,35.25s-1.66,9.82-7.19,9.74-2.45-5.75-3.81-8.04c-1.36-2.29-13.38-12.05-13.38-12.05,1.72-2.78,3.62-5.22,5.79-7.14,0,0-3.65-1.77-3.01-5.76S11.5,3.4,14.81,3.62c3.31.22,3.58,5.64,3.3,9.79,3.63-1.03,7.44-1.27,10.87-.45,0,0-1.77-6.65,1.83-9.33,3.6-2.68,8.77,3.91,8.24,7.98-.52,4.07-2.32,4.68-2.32,4.68,2.62,1.79,4.81,4.07,6.27,7.22-5.55,4.19-10.25,8.2-13.62,11.74ZM20.56,36.75c1.19,2.6-.79,5.46,1.24,5.67s4.16-.57,4.7-7.44c0,0-2.62-2.83-6.57-2.9-2.33-.04.13,3.6.62,4.68ZM18.93,21.14c.05-1.94-.98-3.53-2.31-3.55s-2.44,1.53-2.5,3.47c-.05,1.94.98,3.53,2.31,3.55s2.44-1.53,2.5-3.47ZM29.2,21.32c.05-1.94-.98-3.53-2.31-3.55s-2.44,1.53-2.5,3.47.98,3.53,2.31,3.55,2.44-1.53,2.5-3.47ZM24.02,27.84c.03-1.15-1.94-1.65-4.31-1.69s-3.84.44-3.87,1.59,2.07,2.43,3.92,2.41,4.24-1.16,4.27-2.31Z",
        },
      },
    ],
  },
  spinner: {
    viewBox: "0 0 24 24",
    strokeWidth: "2.25",
    lineCap: "round",
    lineJoin: "round",
    className: "ui-icon ui-icon--spinner",
    shapes: [{ tag: "path", attrs: { d: "M12 3a9 9 0 1 0 9 9" } }],
  },
  check: {
    viewBox: "0 0 16 16",
    strokeWidth: "1.75",
    lineCap: "round",
    lineJoin: "round",
    className: "ui-icon ui-icon--check",
    shapes: [{ tag: "polyline", attrs: { points: "3.5 8.5 6.5 11.5 12.5 5" } }],
  },
  trash: {
    viewBox: "0 0 24 24",
    strokeWidth: "1.75",
    lineCap: "round",
    lineJoin: "round",
    className: "ui-icon ui-icon--trash",
    shapes: [
      { tag: "polyline", attrs: { points: "3 6 5 6 21 6" } },
      {
        tag: "path",
        attrs: { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" },
      },
      { tag: "path", attrs: { d: "M10 11v6" } },
      { tag: "path", attrs: { d: "M14 11v6" } },
      { tag: "path", attrs: { d: "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" } },
    ],
  },
  alert: {
    viewBox: "0 0 24 24",
    strokeWidth: "1.75",
    lineCap: "round",
    lineJoin: "round",
    className: "ui-icon ui-icon--alert",
    shapes: [
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "9" } },
      { tag: "line", attrs: { x1: "12", y1: "8", x2: "12", y2: "13" } },
      { tag: "circle", attrs: { cx: "12", cy: "16.5", r: "0.75" } },
    ],
  },
});

export const ICON_NAMES = Object.freeze(Object.keys(ICON_SPECS));

/**
 * Check if an icon name is registered.
 * @param {string} name
 * @returns {boolean}
 */
export function isKnownIcon(name) {
  return typeof name === "string" && Boolean(ICON_SPECS[name]);
}

/**
 * Create an accessible SVG icon element without innerHTML.
 * Default: decorative with aria-hidden="true" and focusable="false".
 * Standalone: pass options.ariaLabel to create a semantic role="img".
 * @param {string} name
 * @param {{ className?: string, ariaLabel?: string }} [options]
 * @returns {SVGSVGElement}
 */
export function createIcon(name, options = {}) {
  const safeOptions = options || {};
  const spec = ICON_SPECS[name];
  if (!spec) {
    throw new Error(`Unknown icon: ${name}`);
  }

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", spec.viewBox);
  if (spec.filled) {
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("stroke", "none");
  } else {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", spec.strokeWidth);
    svg.setAttribute("stroke-linecap", spec.lineCap);
    svg.setAttribute("stroke-linejoin", spec.lineJoin);
  }

  if (safeOptions.ariaLabel) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", String(safeOptions.ariaLabel));
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  svg.setAttribute("focusable", "false");

  const extraClass =
    typeof safeOptions.className === "string"
      ? safeOptions.className.trim()
      : "";
  svg.setAttribute(
    "class",
    extraClass ? `${spec.className} ${extraClass}` : spec.className,
  );

  for (const shape of spec.shapes) {
    const node = document.createElementNS(SVG_NS, shape.tag);
    for (const [attr, val] of Object.entries(shape.attrs)) {
      node.setAttribute(attr, val);
    }
    svg.appendChild(node);
  }

  return svg;
}
