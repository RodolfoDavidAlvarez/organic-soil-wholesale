import { useCallback, useEffect, useRef, useState } from "react";

const steps = ["fulfillment", "timing", "customer", "review"] as const;
export type CheckoutStep = (typeof steps)[number];

function isStep(value: unknown): value is CheckoutStep {
  return steps.some(step => step === value);
}

export function requestedCheckoutStep() {
  const param = new URLSearchParams(window.location.search).get("step");
  return isStep(param) ? param : null;
}

export function limitCheckoutStep(requested: CheckoutStep, lastAllowed: CheckoutStep) {
  return steps.indexOf(requested) <= steps.indexOf(lastAllowed) ? requested : lastAllowed;
}

function writeStep(step: CheckoutStep, replace = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("step", step);
  const state = { ...window.history.state, oswCheckoutStep: step };
  if (replace) window.history.replaceState(state, "", url);
  else window.history.pushState(state, "", url);
}

export function useCheckoutStepHistory(initialStep: CheckoutStep, lastAllowed: CheckoutStep) {
  const [step, setStep] = useState(initialStep);
  const allowed = useRef(lastAllowed);
  allowed.current = lastAllowed;

  useEffect(() => {
    if (window.history.state?.oswCheckoutStep !== initialStep) {
      writeStep("fulfillment", true);
      for (const preceding of steps.slice(1, steps.indexOf(initialStep) + 1)) writeStep(preceding);
    } else if (requestedCheckoutStep() !== initialStep) {
      writeStep(initialStep, true);
    }
    function restore(event: PopStateEvent) {
      if (window.location.pathname.replace(/\/$/, "") !== "/checkout") return;
      const requested = requestedCheckoutStep() ?? event.state?.oswCheckoutStep;
      if (!isStep(requested)) return;
      const target = limitCheckoutStep(requested, allowed.current);
      if (target !== requested) writeStep(target, true);
      setStep(target);
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [initialStep]);

  const selectStep = useCallback((target: CheckoutStep) => {
    const current = steps.indexOf(window.history.state?.oswCheckoutStep);
    const next = steps.indexOf(target);
    if (current > next) {
      window.history.go(next - current);
      return;
    }
    for (const entry of steps.slice(current + 1, next + 1)) writeStep(entry);
    setStep(target);
  }, []);

  return [step, selectStep] as const;
}
