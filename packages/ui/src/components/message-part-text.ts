export function readPartText(accum: Record<string, string> | undefined, part: { id: string; text?: string }) {
  return (accum?.[part.id] ?? part.text ?? "").trim()
}
