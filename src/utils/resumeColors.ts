/**
 * Resume colour choice: "classic" is all black; the others colour only the name,
 * section headings and divider lines. Body text always stays black so it prints well
 * and hiring software reads it the same.
 */
export type ResumeColor = "classic" | "navy" | "teal" | "burgundy" | "charcoal";

export const RESUME_COLORS: { id: ResumeColor; label: string; hex: string }[] = [
  { id: "classic", label: "Classic black", hex: "#141414" },
  { id: "navy", label: "Navy", hex: "#1F3A5F" },
  { id: "teal", label: "Teal", hex: "#0F5F5C" },
  { id: "burgundy", label: "Burgundy", hex: "#7A1F2B" },
  { id: "charcoal", label: "Charcoal", hex: "#3D3D3D" },
];

export const DEFAULT_RESUME_COLOR: ResumeColor = "navy";

export function resumeColorHex(color: ResumeColor | undefined): string {
  return (RESUME_COLORS.find(c => c.id === color) || RESUME_COLORS[0]).hex;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
