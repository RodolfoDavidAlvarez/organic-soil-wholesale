import { useCallback, useEffect, useState } from "react";

const steps = ["fulfillment", "timing", "customer", "review"] as const;
export type CheckoutStep = (typeof steps)[number];

function writeStep(step: CheckoutStep, replace = false) {
  const state = { ...window.history.state, oswCheckoutStep: step };
  if (replace) window.history.replaceState(state, "");
  else window.history.pushState(state, "");
}

export function useCheckoutStepHistory(initialStep: CheckoutStep) {
  const [step, setStep] = useState(initialStep);

  useEffect(() => {
    if (window.history.state?.oswCheckoutStep !== initialStep) {
      writeStep("fulfillment", true);
      for (const preceding of steps.slice(1, steps.indexOf(initialStep) + 1)) writeStep(preceding);
    }
    function restore(event: PopStateEvent) {
      const target = event.state?.oswCheckoutStep;
      if (steps.includes(target)) setStep(target);
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
