/** The groups the Projections page is divided into, in page order. Each is a section-index link. */
export const PROJECTION_SECTIONS = [
  "overview",
  "income",
  "savings",
  "spending",
  "risk",
  "age",
  "insurance",
] as const;

export type ProjectionSection = (typeof PROJECTION_SECTIONS)[number];

export const sectionAnchor = (section: ProjectionSection) => `projections-${section}`;
