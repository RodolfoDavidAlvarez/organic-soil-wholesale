import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeAsapPickup,
} from "@shared/pickupSchedule.js";
import { PickupSlotPicker, type PickupSelection } from "@/components/PickupSlotPicker";

export type PickupTimingMode = "asap" | "schedule";

export type PickupReadySelection = {
  pickupMode: PickupTimingMode;
  readyAt: string;
  readyLabel: string;
  status: "asap" | "scheduled";
  /** Set when pickupMode === 'schedule' */
  slotLabel?: string;
};

interface PickupReadyTimeProps {
  value: PickupReadySelection | null;
  onChange: (selection: PickupReadySelection | null) => void;
  className?: string;
  refreshMs?: number;
  allowAsap?: boolean;
  minLeadDays?: number;
  scheduleHelpText?: string;
  children: ReactNode;
}

type AsapResult = ReturnType<typeof computeAsapPickup>;

function asapSelection(result: AsapResult): PickupReadySelection | null {
  if (!result.ok) return null;
  return {
    pickupMode: "asap",
    readyAt: result.readyAtIso,
    readyLabel: result.readyLabel,
    status: result.status,
  };
}

function scheduleSelection(slot: PickupSelection): PickupReadySelection {
  return {
    pickupMode: "schedule",
    readyAt: slot.pickupAt,
    readyLabel: `Pickup ${slot.slotLabel}`,
    status: "scheduled",
    slotLabel: slot.slotLabel,
  };
}

export function PickupReadyTime({
  value,
  onChange,
  className,
  refreshMs = 60_000,
  allowAsap = true,
  minLeadDays = 0,
  scheduleHelpText,
  children,
}: PickupReadyTimeProps) {
  const [mode, setMode] = useState<PickupTimingMode>(allowAsap ? (value?.pickupMode ?? "asap") : "schedule");
  const [tick, setTick] = useState(0);
  const [scheduleSlot, setScheduleSlot] = useState<PickupSelection | null>(
    value?.pickupMode === "schedule" && value.readyAt
      ? {
          pickupDate: value.readyAt.slice(0, 10),
          slotLabel: value.slotLabel ?? value.readyLabel,
          pickupAt: value.readyAt,
        }
      : null,
  );

  const computedAsap = useMemo(() => computeAsapPickup(), [tick]);

  useEffect(() => {
    if (!allowAsap && mode !== "schedule") {
      setMode("schedule");
      onChange(null);
    }
  }, [allowAsap, mode, onChange]);

  useEffect(() => {
    if (mode !== "asap") return;
    const selection = asapSelection(computedAsap);
    if (!selection) return;
    if (
      value?.pickupMode !== "asap" ||
      value.readyAt !== selection.readyAt ||
      value.readyLabel !== selection.readyLabel
    ) {
      onChange(selection);
    }
  }, [computedAsap, mode, onChange, value?.pickupMode, value?.readyAt, value?.readyLabel]);

  useEffect(() => {
    if (mode !== "schedule") return;
    if (scheduleSlot) {
      onChange(scheduleSelection(scheduleSlot));
    } else {
      onChange(null);
    }
  }, [mode, scheduleSlot, onChange]);

  useEffect(() => {
    if (!refreshMs || mode !== "asap") return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs, mode]);

  const displayAsap = value?.pickupMode === "asap" ? value : asapSelection(computedAsap);

  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <h2 className="text-[clamp(1.65rem,4vw,2.25rem)] font-semibold leading-tight tracking-tight text-stone-950">
          {mode === "asap" ? displayAsap?.readyLabel ?? "Calculating pickup time…" : "Choose a pickup time"}
        </h2>
        {children}
      </div>
      {mode === "schedule" && (
        <div className="space-y-4">
          {scheduleHelpText && <p className="text-sm text-stone-600">{scheduleHelpText}</p>}
          <PickupSlotPicker value={scheduleSlot} onChange={setScheduleSlot} minLeadDays={minLeadDays} />
        </div>
      )}
      {allowAsap && (
        <button
          type="button"
          onClick={() => setMode(mode === "asap" ? "schedule" : "asap")}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-[#264027] hover:bg-stone-50 focus-visible:ring-2"
        >
          <Calendar aria-hidden="true" className="h-4 w-4" />
          {mode === "asap" ? "Choose another time" : "Use next available pickup"}
        </button>
      )}
    </div>
  );
}

export default PickupReadyTime;
