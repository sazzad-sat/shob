import { type ComponentProps, splitProps } from "solid-js"

export interface ShineBorderProps extends ComponentProps<"div"> {
  borderWidth?: number
  duration?: number
  shineColor?: string | string[]
  animate?: boolean
}

export function ShineBorder(props: ShineBorderProps) {
  const [split, rest] = splitProps(props, [
    "borderWidth",
    "duration",
    "shineColor",
    "animate",
    "class",
    "classList",
    "style",
  ])

  const colorVars = () => {
    const raw = split.shineColor
    const list = Array.isArray(raw) ? raw : raw ? [raw] : []
    const result: Record<string, string> = {}
    list.forEach((c, i) => {
      result[`--shine-color-${i + 1}`] = c
    })
    return result
  }

  return (
    <div
      data-component="shine-border"
      data-animate={split.animate ?? false}
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
      style={{
        "--shine-border-width": `${split.borderWidth ?? 2}px`,
        "--shine-duration": `${split.duration ?? 4}s`,
        ...colorVars(),
        ...((split.style as Record<string, string>) ?? {}),
      }}
      {...(rest as Record<string, unknown>)}
    />
  )
}
