import { useMemo, useState } from "react";
import {
  Phone,
  Loader2,
  MessageCircle,
  CheckCircle2,
  Clock,
  Package,
  Truck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuoteCart, type CartItem } from "@/contexts/QuoteCartContext";
import { cartFlatbedSpots, spotsForFormat } from "@/lib/flatbedSpots";
import { loadDeliveryDraft } from "@/lib/deliveryDraft";
import { trackEvent } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";
import { attributedPageUrl } from "@/lib/pageAttribution";

type OrderCallbackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extra lines not yet flushed into cart state (e.g. just-added from PDP). */
  pendingItems?: CartItem[];
  sourceUrl?: string;
};

type CallWindow = "morning" | "afternoon" | "evening" | "";

const CALL_WINDOWS: { id: Exclude<CallWindow, "">; label: string; hint: string }[] = [
  { id: "morning", label: "Morning", hint: "8–11am" },
  { id: "afternoon", label: "Afternoon", hint: "12–4pm" },
  { id: "evening", label: "Evening", hint: "4–6pm" },
];

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function mergeItems(cart: CartItem[], pending: CartItem[] = []): CartItem[] {
  const out = [...cart];
  for (const item of pending) {
    const idx = out.findIndex(
      (i) => i.productId === item.productId && i.format === item.format,
    );
    if (idx >= 0) {
      out[idx] = {
        ...out[idx],
        quantity: out[idx].quantity + item.quantity,
      };
    } else {
      out.push(item);
    }
  }
  return out;
}

function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function OrderCallbackDialog({
  open,
  onOpenChange,
  pendingItems = [],
  sourceUrl,
}: OrderCallbackDialogProps) {
  const { items, clearCart, closeDrawer } = useQuoteCart();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [callWindow, setCallWindow] = useState<CallWindow>("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const orderItems = useMemo(
    () => mergeItems(items, pendingItems),
    [items, pendingItems],
  );
  const estimatedTotal = useMemo(
    () => orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    [orderItems],
  );
  const flatbedSpots = useMemo(() => cartFlatbedSpots(orderItems), [orderItems]);
  const deliveryDraft = typeof window !== "undefined" ? loadDeliveryDraft() : null;

  const reset = () => {
    setName("");
    setPhone("");
    setEmail("");
    setNote("");
    setCallWindow("");
    setSubmitting(false);
    setDone(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast({
        title: "Name and phone required",
        description: "We’ll call you back about this order.",
        variant: "destructive",
      });
      return;
    }
    if (orderItems.length === 0) {
      toast({
        title: "Add items first",
        description: "Build your order, then request a callback.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    const lineItems = orderItems.map((item) => ({
      product_id: item.productId,
      product_name: item.productName,
      product_slug: item.productSlug,
      format: item.format,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.unitPrice * item.quantity,
      unit: item.unit,
      flatbed_spots: spotsForFormat(item.format, item.quantity),
      mode: item.mode ?? "pay",
    }));

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      notes: note.trim() || undefined,
      lead_type: "order_callback",
      source: "osw_order_callback",
      source_url:
        sourceUrl ||
        attributedPageUrl(),
      order: {
        line_items: lineItems,
        item_count: orderItems.length,
        estimated_total: estimatedTotal,
        flatbed_spots: flatbedSpots,
        delivery_zip: deliveryDraft?.zip || undefined,
        delivery_fee: deliveryDraft?.quote?.costDollars,
        delivery_city: deliveryDraft?.city || undefined,
        delivery_state: deliveryDraft?.state || undefined,
        preferred_call_window: callWindow || undefined,
      },
    };

    trackEvent("Order Callback Requested", {
      item_count: orderItems.length,
      estimated_total: estimatedTotal,
      flatbed_spots: flatbedSpots,
      has_delivery_zip: Boolean(deliveryDraft?.zip),
      preferred_call_window: callWindow || null,
    });

    try {
      const res = await fetch("/api/leads/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not submit callback request");
      }
      setDone(true);
      clearCart();
      closeDrawer();
      toast({
        title: "We’ll call you",
        description: "Your order details are in our inbound leads — a rep will reach out soon.",
      });
    } catch (err) {
      toast({
        title: "Couldn’t send request",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[92vh] max-w-[440px] gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:rounded-[1.75rem]",
          "[&>button]:right-3 [&>button]:top-3 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-white/90 [&>button]:p-1.5 [&>button]:opacity-100 [&>button]:shadow-sm [&>button]:ring-1 [&>button]:ring-black/5",
        )}
      >
        <div className="overflow-hidden rounded-[1.75rem] border border-[#264027]/15 bg-white shadow-[0_28px_80px_-28px_rgba(38,64,39,0.55)]">
          {/* Hero header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#264027] via-[#2f4d30] to-[#3c5233] px-5 pb-5 pt-6 text-white sm:px-6">
            <div
              className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#b38a58]/25 blur-2xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-white/10 blur-2xl"
              aria-hidden
            />
            <DialogHeader className="relative space-y-3 text-left">
              <div className="flex items-start gap-3">
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                  <MessageCircle className="h-6 w-6" strokeWidth={2.25} />
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#b38a58] ring-2 ring-[#264027]">
                    <Phone className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
                  </span>
                </span>
                <div className="min-w-0 pt-0.5">
                  <DialogTitle className="text-xl font-bold tracking-tight text-white sm:text-[1.35rem]">
                    Not sure? Call me
                  </DialogTitle>
                  <DialogDescription className="mt-1.5 text-sm leading-relaxed text-white/80">
                    Leave your number — a real person will call with your cart already pulled up.
                    No payment now.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="max-h-[min(68vh,560px)] overflow-y-auto px-5 py-5 sm:px-6">
            {done ? (
              <div className="space-y-5 py-2 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef3eb] text-[#264027] ring-8 ring-[#eef3eb]/60">
                  <CheckCircle2 className="h-9 w-9" strokeWidth={2} />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-bold text-[#264027]">You’re on the list</p>
                  <p className="mx-auto max-w-sm text-sm leading-relaxed text-stone-600">
                    Your order landed in our inbound leads. We’ll call
                    {phone ? (
                      <>
                        {" "}
                        <span className="font-semibold text-stone-800">{formatPhoneDisplay(phone)}</span>
                      </>
                    ) : null}{" "}
                    shortly
                    {callWindow
                      ? ` (${CALL_WINDOWS.find((w) => w.id === callWindow)?.label.toLowerCase()})`
                      : ""}
                    .
                  </p>
                </div>
                <div className="rounded-2xl border border-[#264027]/10 bg-[#f7f4ef] px-4 py-3 text-left text-xs text-stone-600">
                  Need us sooner?{" "}
                  <a
                    href={CUSTOMER_SUPPORT_PHONE_TEL}
                    className="font-semibold text-[#264027] underline-offset-2 hover:underline"
                  >
                    Call {CUSTOMER_SUPPORT_PHONE_DISPLAY}
                  </a>
                </div>
                <Button
                  className="h-12 w-full rounded-2xl bg-[#264027] font-bold hover:bg-[#1f3320]"
                  onClick={() => handleOpenChange(false)}
                >
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                {/* Order snapshot */}
                <div className="overflow-hidden rounded-2xl border border-[#264027]/12 bg-gradient-to-b from-[#f7f4ef] to-[#eef3eb]/70">
                  <div className="flex items-center justify-between gap-2 border-b border-[#264027]/10 px-3.5 py-2.5">
                    <div className="flex items-center gap-2 text-[#264027]">
                      <Package className="h-4 w-4 shrink-0" />
                      <p className="text-sm font-bold">
                        Your order · {money(estimatedTotal)}
                      </p>
                    </div>
                    {flatbedSpots > 0 && (
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-[#264027] ring-1 ring-[#264027]/12">
                        {flatbedSpots}/22 spots
                      </span>
                    )}
                  </div>
                  <ul className="max-h-32 space-y-0 divide-y divide-[#264027]/8 overflow-y-auto px-1">
                    {orderItems.map((item) => (
                      <li
                        key={`${item.productId}-${item.format}`}
                        className="flex items-start justify-between gap-3 px-2.5 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-stone-900">
                            {item.quantity}× {item.productName}
                          </p>
                          <p className="truncate text-xs text-stone-500">{item.format}</p>
                        </div>
                        <p className="shrink-0 tabular-nums text-xs font-semibold text-stone-700">
                          {money(item.unitPrice * item.quantity)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {deliveryDraft?.zip && (
                    <div className="flex items-center gap-1.5 border-t border-[#264027]/10 px-3.5 py-2 text-xs text-stone-600">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-[#264027]" />
                      <span>
                        Delivery ZIP {deliveryDraft.zip}
                        {deliveryDraft.quote?.costDollars != null
                          ? ` · est. ${money(deliveryDraft.quote.costDollars)}`
                          : ""}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid gap-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="callback-name" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Your name
                    </Label>
                    <Input
                      id="callback-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      required
                      placeholder="First and last"
                      className="h-12 rounded-xl border-stone-200 bg-white text-base shadow-sm focus-visible:ring-[#264027]/30"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="callback-phone" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Phone <span className="normal-case tracking-normal text-[#b38a58]">· we’ll call this</span>
                    </Label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#264027]/55" />
                      <Input
                        id="callback-phone"
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={(e) => setPhone(formatPhoneDisplay(e.target.value))}
                        autoComplete="tel"
                        required
                        placeholder="(602) 555-0123"
                        className="h-12 rounded-xl border-stone-200 bg-white pl-10 text-base shadow-sm focus-visible:ring-[#264027]/30"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="callback-email" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Email <span className="normal-case tracking-normal text-stone-400">optional</span>
                    </Label>
                    <Input
                      id="callback-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="For a written summary"
                      className="h-12 rounded-xl border-stone-200 bg-white text-base shadow-sm focus-visible:ring-[#264027]/30"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                      <Clock className="h-3.5 w-3.5" />
                      Best time to call{" "}
                      <span className="normal-case tracking-normal text-stone-400">optional</span>
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {CALL_WINDOWS.map((window) => {
                        const selected = callWindow === window.id;
                        return (
                          <button
                            key={window.id}
                            type="button"
                            onClick={() =>
                              setCallWindow((prev) => (prev === window.id ? "" : window.id))
                            }
                            className={cn(
                              "rounded-xl border px-2 py-2.5 text-center transition touch-manipulation",
                              selected
                                ? "border-[#264027] bg-[#264027] text-white shadow-sm"
                                : "border-stone-200 bg-white text-stone-700 hover:border-[#264027]/35",
                            )}
                          >
                            <span className="block text-xs font-bold">{window.label}</span>
                            <span
                              className={cn(
                                "mt-0.5 block text-[10px] font-medium",
                                selected ? "text-white/75" : "text-stone-400",
                              )}
                            >
                              {window.hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="callback-note" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                      Anything else{" "}
                      <span className="normal-case tracking-normal text-stone-400">optional</span>
                    </Label>
                    <Textarea
                      id="callback-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="Site access, questions about size, mix of products…"
                      className="min-h-[72px] resize-none rounded-xl border-stone-200 bg-white text-sm shadow-sm focus-visible:ring-[#264027]/30"
                    />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Button
                    type="submit"
                    size="lg"
                    className="min-h-[52px] w-full rounded-2xl bg-gradient-to-b from-[#2f4d30] to-[#264027] text-base font-bold shadow-[0_10px_24px_-10px_rgba(38,64,39,0.85)] hover:from-[#264027] hover:to-[#1c2e1d]"
                    disabled={submitting || orderItems.length === 0}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending to our team…
                      </>
                    ) : (
                      <>
                        <Phone className="mr-2 h-4 w-4" />
                        Request my callback
                      </>
                    )}
                  </Button>
                  <p className="text-center text-[11px] leading-relaxed text-stone-500">
                    Saves to our inbound leads with your cart attached.
                    Or call{" "}
                    <a
                      href={CUSTOMER_SUPPORT_PHONE_TEL}
                      className="font-semibold text-[#264027] underline-offset-2 hover:underline"
                    >
                      {CUSTOMER_SUPPORT_PHONE_DISPLAY}
                    </a>
                    .
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
