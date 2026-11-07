/** Props that give a chart's svg an accessible name and a one-sentence description. */
export function chartA11y(name: string, description: string) {
  return { role: "img" as const, "aria-label": name, title: name, desc: description };
}
