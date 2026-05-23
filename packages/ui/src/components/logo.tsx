import { ComponentProps } from "solid-js"
import logo from "../../../logo.png"

export const Mark = (props: { class?: string }) => {
  return (
    <img
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      src={logo}
      alt="Goglaby logo"
      draggable={false}
      style={{ "object-fit": "contain" }}
    />
  )
}

export const Splash = (props: Pick<ComponentProps<"img">, "ref" | "class">) => {
  return (
    <img
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      src={logo}
      alt="Goglaby logo"
      draggable={false}
      ref={props.ref}
      style={{ "object-fit": "contain" }}
    />
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <img
      classList={{ [props.class ?? ""]: !!props.class }}
      src={logo}
      alt="Goglaby logo"
      draggable={false}
      style={{ "object-fit": "contain" }}
    />
  )
}
