import {
  CUSTOMER_SUPPORT_PHONE_DIAL,
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
} from "@/config/contact";

type UsPhone = { dial: string; display: string };

export function normalizeUsPhone(value: string | null | undefined): UsPhone | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;

  return {
    dial: `+1${digits}`,
    display: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
  };
}

function replaceVisiblePhoneText(link: HTMLAnchorElement, display: string): void {
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const value = node.textContent || "";
    const next = value.replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g, display);
    if (next !== value) node.textContent = next;
    node = walker.nextNode();
  }
}

function applyPhoneLink(link: HTMLAnchorElement, phone: UsPhone, updateText: boolean): void {
  const canonicalHref = `tel:${phone.dial}`;
  if (link.getAttribute("href") !== canonicalHref) link.setAttribute("href", canonicalHref);
  if (link.getAttribute("aria-label") !== `Call ${phone.display}`) {
    link.setAttribute("aria-label", `Call ${phone.display}`);
  }
  if (link.getAttribute("data-phone-number") !== phone.dial) {
    link.setAttribute("data-phone-number", phone.dial);
  }

  if (!updateText) return;
  const textNode = link.querySelector<HTMLElement>("[data-official-support-phone-text]");
  if (textNode && textNode.textContent !== phone.display) textNode.textContent = phone.display;
  else if (!textNode) replaceVisiblePhoneText(link, phone.display);
}

/** Keep a CallRail replacement's visible number, dial target, and accessible label aligned. */
export function synchronizeTrackedSupportPhones(root: ParentNode = document): void {
  const official = { dial: CUSTOMER_SUPPORT_PHONE_DIAL, display: CUSTOMER_SUPPORT_PHONE_DISPLAY };

  root.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]').forEach((link) => {
    if (link.hasAttribute("data-official-support-phone")) {
      applyPhoneLink(link, official, true);
      return;
    }
    const textNode = link.querySelector<HTMLElement>("[data-official-support-phone-text]");
    const textPhone = normalizeUsPhone(textNode?.textContent);
    const hrefPhone = normalizeUsPhone(link.getAttribute("href"));
    const phone =
      textPhone && textPhone.dial !== official.dial
        ? textPhone
        : hrefPhone && hrefPhone.dial !== official.dial
          ? hrefPhone
          : textPhone || hrefPhone || official;

    applyPhoneLink(link, phone, true);
  });
}

/**
 * Paths where the official support number must stay fixed (no CallRail DNI).
 * Keep in sync with the early exclusion script in client/index.html.
 */
export function isCallTrackingExcludedPath(
  pathname: string,
  search: string = typeof window !== "undefined" ? window.location.search : ""
): boolean {
  const path = pathname || "/";
  const source = new URLSearchParams(search).get("source");

  return (
    import.meta.env.VITE_DEFAULT_BRAND === "rls" ||
    path.startsWith("/rep/") ||
    path.startsWith("/landscaper-supply") ||
    path === "/free-worm-castings" ||
    path === "/survey" ||
    path.startsWith("/survey/") ||
    (path === "/newsletter" && source === "july-community-gift") ||
    path === "/qr" ||
    path === "/check-in" ||
    path === "/yard-map" ||
    path === "/checkout" ||
    path === "/order-confirmation" ||
    path.startsWith("/pay-and-pickup") ||
    path.startsWith("/drive-through") ||
    path.startsWith("/admin/outreach")
  );
}

export function setDocumentCallTrackingExclusion(excluded: boolean): void {
  if (typeof document === "undefined") return;

  const targets = [document.documentElement, document.body].filter(Boolean);
  for (const el of targets) {
    if (excluded) {
      el.setAttribute("data-callrail-ignore", "true");
      el.setAttribute("data-dynamic-number-ignore", "true");
      el.setAttribute("data-call-tracking-ignore", "true");
      el.classList.add("no-call-tracking");
    } else {
      el.removeAttribute("data-callrail-ignore");
      el.removeAttribute("data-dynamic-number-ignore");
      el.removeAttribute("data-call-tracking-ignore");
      el.classList.remove("no-call-tracking");
    }
  }
}

/** Force official support tel links back if CallRail swaps them on excluded routes. */
export function enforceOfficialSupportPhones(root: ParentNode = document): void {
  root.querySelectorAll<HTMLAnchorElement>("[data-official-support-phone]").forEach((link) => {
    applyPhoneLink(
      link,
      { dial: CUSTOMER_SUPPORT_PHONE_DIAL, display: CUSTOMER_SUPPORT_PHONE_DISPLAY },
      true,
    );

    const textNode = link.querySelector<HTMLElement>("[data-official-support-phone-text]");
    if (!textNode) {
      // Icon-only or plain-text links: restore visible phone text when present.
      const text = (link.textContent || "").replace(/\s+/g, " ").trim();
      if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text) && text !== CUSTOMER_SUPPORT_PHONE_DISPLAY) {
        link.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && /\d/.test(node.textContent || "")) {
            node.textContent = ` ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`;
          }
        });
      }
    }
  });
}
