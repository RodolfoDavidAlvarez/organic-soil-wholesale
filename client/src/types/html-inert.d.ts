export {};

declare module "react" {
  interface HTMLAttributes<T> {
    /**
     * Boolean HTML attribute. React 18's stable types omit it; the DOM property is real.
     * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inert
     */
    inert?: boolean | undefined;
  }
}
