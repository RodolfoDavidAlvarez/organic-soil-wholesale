import { useState } from "react";
import { Check, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface IngredientDisclosure {
  trigger: string;
  summary: string;
  items: string[];
}

interface PayPickupProductFactsProps {
  includes: string[];
  benefits?: string[];
  /** Compact spacing for grid cards; roomy for product detail hero */
  variant?: "card" | "detail";
  className?: string;
  /** Detail pages can open a long ingredient list from one includes chip */
  ingredientDisclosure?: IngredientDisclosure;
}

export function PayPickupProductFacts({
  includes,
  benefits = [],
  variant = "card",
  className,
  ingredientDisclosure,
}: PayPickupProductFactsProps) {
  const isDetail = variant === "detail";
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const disclosure =
    isDetail && ingredientDisclosure && includes.includes(ingredientDisclosure.trigger)
      ? ingredientDisclosure
      : undefined;

  if (includes.length === 0 && benefits.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {includes.length > 0 && (
        <div>
          <p
            className={cn(
              "font-semibold uppercase tracking-[0.16em] text-stone-500",
              isDetail ? "mb-2 text-xs" : "mb-1.5 text-[10px]",
            )}
          >
            Includes
          </p>
          <div className={cn("flex flex-wrap gap-1.5", isDetail && "gap-2 lg:gap-x-4 lg:gap-y-1")}>
            {includes.map((item) => {
              const opensList = disclosure?.trigger === item;
              const chipClass = cn(
                "inline-flex items-center gap-1 rounded-full border border-[#264027]/15 bg-[#264027]/5 font-semibold text-[#264027]",
                isDetail
                  ? "px-3 py-1.5 text-xs lg:text-sm"
                  : "px-2 py-0.5 text-[11px]",
                opensList && "min-h-11 pr-2.5",
              );
              if (!opensList) {
                return (
                  <span key={item} className={chipClass}>
                    <CheckCircle2 className={cn("shrink-0", isDetail ? "h-3.5 w-3.5" : "h-3 w-3")} strokeWidth={2.5} />
                    {item}
                  </span>
                );
              }
              return (
                <button
                  key={item}
                  type="button"
                  className={cn(chipClass, "transition hover:bg-[#264027]/10")}
                  aria-expanded={ingredientsOpen}
                  onClick={() => setIngredientsOpen((open) => !open)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  {item}
                  <ChevronDown className={cn("h-4 w-4 shrink-0 transition", ingredientsOpen && "rotate-180")} />
                </button>
              );
            })}
          </div>
          {disclosure && ingredientsOpen ? (
            <div className="mt-3">
              <p className="text-sm leading-relaxed text-stone-700">{disclosure.summary}</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {disclosure.items.map((item) => (
                  <li
                    key={item}
                    className="rounded-xl border border-[#264027]/12 bg-[#f4f7f2] px-3.5 py-2.5 text-sm font-semibold text-[#264027]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {benefits.length > 0 && (
        <ul className={cn("space-y-1.5", isDetail && "sm:grid sm:grid-cols-2 sm:gap-x-4 sm:space-y-0 lg:grid-cols-3")}>
          {benefits.map((item) => (
            <li
              key={item}
              className={cn(
                "flex items-start gap-2 leading-snug text-stone-600",
                isDetail ? "text-sm sm:py-1" : "text-xs",
              )}
            >
              <Check className={cn("mt-0.5 shrink-0 text-[#438764]", isDetail ? "h-4 w-4" : "h-3.5 w-3.5")} strokeWidth={2.5} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PayPickupProductFacts;
