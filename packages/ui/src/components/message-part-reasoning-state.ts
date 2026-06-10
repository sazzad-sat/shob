export type ReasoningDisplayState = {
  text: string
  visible: boolean
  defaultOpen: boolean
  autoOpenOnPending: boolean
}

export function getReasoningDisplayState(
  text: string | null | undefined,
  _options: { streaming?: boolean } = {},
): ReasoningDisplayState {
  const trimmed = text?.trim() ?? ""
  const visible = trimmed.length > 0

  return {
    text: trimmed,
    visible,
    defaultOpen: false,
    autoOpenOnPending: visible,
  }
}
