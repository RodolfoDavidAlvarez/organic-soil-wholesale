import type { ReactNode } from "react";
import { Link } from "wouter";
import { Phone } from "lucide-react";
import {
  CUSTOMER_SUPPORT_PHONE_DISPLAY,
  CUSTOMER_SUPPORT_PHONE_TEL,
} from "@/config/contact";
import { withUtm } from "@shared/schoolVerification.js";

type SchoolFrameProps = {
  children: ReactNode;
  utm?: Record<string, string>;
};

export function SchoolFrame({ children, utm = {} }: SchoolFrameProps) {
  return (
    <div className="bg-[#f6f4ee] text-[#1c241c]">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6b7468]">
          Organic Soil Wholesale
          <span className="mx-1.5 text-[#b38a58]">·</span>
          by Soil Seed &amp; Water
        </p>
        {children}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={CUSTOMER_SUPPORT_PHONE_TEL}
            data-official-support-phone="true"
            data-phone-number={CUSTOMER_SUPPORT_PHONE_TEL.slice(4)}
            data-callrail-ignore="true"
            data-dynamic-number-ignore="true"
            data-call-tracking-ignore="true"
            className="no-call-tracking inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#183a23] px-5 text-base font-bold text-white"
            aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            <span data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span>
          </a>
          <Link
            href={withUtm("/pickup", utm)}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#183a23]/20 bg-white px-5 text-base font-bold text-[#183a23]"
          >
            Order bagged products for pickup
          </Link>
        </div>
      </div>
    </div>
  );
}
