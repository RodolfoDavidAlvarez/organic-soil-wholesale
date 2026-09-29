import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, CalendarDays, Check, CheckCircle2, ExternalLink, Instagram, Loader2, Trophy, Volume2 } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { GIVEAWAY_DRAFT } from "@/config/giveawayDraft";
import { trackEvent } from "@/lib/analytics";
import { GIVEAWAY_ENTRIES_CLOSED_MESSAGE } from "@shared/giveawayEntries.js";

type SocialKey = "ig" | "fb" | "yt";
type FollowedState = Record<SocialKey, boolean>;

const emptyFollowed = (): FollowedState => ({
  ig: false,
  fb: false,
  yt: false,
});

const FIELD_CLASS =
  "mt-1.5 min-h-12 w-full rounded-xl border border-[#c8cfc8] bg-white px-3 text-base text-[#173d25]";

export default function BigGardenGiveaway() {
  const entriesOpen = GIVEAWAY_DRAFT.acceptingEntries === true;
  const attribution = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      attributionSource: params.get("source") || "direct",
      utmSource: params.get("utm_source") || "",
      utmMedium: params.get("utm_medium") || "",
      utmCampaign: params.get("utm_campaign") || "",
      utmContent: params.get("utm_content") || "",
    };
  }, []);
  const followTimers = useRef<Partial<Record<SocialKey, number>>>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showUnmuteHint, setShowUnmuteHint] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [customerTypes, setCustomerTypes] = useState<string[]>([]);
  const [gardenStatus, setGardenStatus] = useState("");
  const [growing, setGrowing] = useState<string[]>([]);
  const [growingOther, setGrowingOther] = useState("");
  const [notes, setNotes] = useState("");
  const [emailConsent, setEmailConsent] = useState(false);
  const [rulesConsent, setRulesConsent] = useState(false);
  const [followed, setFollowed] = useState<FollowedState>(emptyFollowed);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<"created" | "already" | "">("");

  useEffect(() => {
    trackEvent("Giveaway Page Viewed", { source: GIVEAWAY_DRAFT.source, preview: false });
    return () => {
      Object.values(followTimers.current).forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const startDeepLinkPlayback = async (video: HTMLVideoElement) => {
      video.muted = false;
      try {
        await video.play();
      } catch {
        if (cancelled) return;
        video.muted = true;
        try {
          await video.play();
          if (!cancelled) setShowUnmuteHint(true);
        } catch {
          // Native controls stay visible so the visitor can still tap to play.
        }
      }
    };

    const focusVideo = () => {
      const figure = document.getElementById("video");
      figure?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      const video = figure?.querySelector("video");
      if (video) void startDeepLinkPlayback(video);
    };

    const runIfDeepLinked = () => {
      const params = new URLSearchParams(window.location.search);
      const wantsVideo =
        window.location.hash === "#video" ||
        params.get("play") === "1";
      if (!wantsVideo) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(focusVideo, 50);
    };

    runIfDeepLinked();
    window.addEventListener("hashchange", runIfDeepLinked);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", runIfDeepLinked);
    };
  }, []);

  function unmuteVideo() {
    const video = videoRef.current ?? document.getElementById("video")?.querySelector("video");
    if (!video) return;
    video.muted = false;
    void video.play();
    setShowUnmuteHint(false);
  }

  const goToEnter = () => {
    document.getElementById("enter")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  function toggleGrowing(value: string) {
    setGrowing((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  }

  function toggleCustomerType(value: string) {
    setCustomerTypes((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  }

  function markFollowed(key: SocialKey) {
    setFollowed((current) => ({ ...current, [key]: true }));
  }

  function handleFollowClick(key: SocialKey) {
    trackEvent("Giveaway Follow Clicked", { channel: key, source: GIVEAWAY_DRAFT.source });
    if (followTimers.current[key]) window.clearTimeout(followTimers.current[key]);
    followTimers.current[key] = window.setTimeout(() => markFollowed(key), 1500);
  }

  function clientError() {
    if (fullName.trim().length < 2) return "Please enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Please enter a valid email address.";
    if (phone.replace(/\D/g, "").length < 10) return "Please enter a valid phone number.";
    if (!/^\d{5}(?:-?\d{4})?$/.test(zipCode.replace(/\s/g, ""))) return "Please enter a valid US ZIP code.";
    if (!customerTypes.length) return "Please tell us who you are.";
    if (!gardenStatus) return "Please tell us if this is a brand new or existing garden.";
    if (!growing.length) return "Please tell us what you are growing.";
    if (!Object.values(followed).some(Boolean)) return "Please follow at least one account, then check the box.";
    if (!emailConsent) return "Please confirm we may email you if you win and about this giveaway.";
    if (!rulesConsent) return "Please confirm you are eligible and agree to the official rules.";
    return "";
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const localError = clientError();
    if (localError) {
      setError(localError);
      return;
    }
    if (!entriesOpen) {
      setError(GIVEAWAY_ENTRIES_CLOSED_MESSAGE);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/giveaway/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          zipCode,
          customerTypes,
          gardenStatus,
          growing,
          growingOther,
          notes,
          emailConsent,
          rulesConsent,
          followed,
          website,
          source: GIVEAWAY_DRAFT.source,
          ...attribution,
        }),
      });
      const raw = await response.text();
      let body: any = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = {};
      }
      if (!response.ok) {
        throw new Error(body.error || "We could not save your entry. Please try again.");
      }
      trackEvent("Giveaway Entered", {
        source: GIVEAWAY_DRAFT.source,
        already_entered: body.alreadyEntered === true,
      });
      setSuccess(body.alreadyEntered ? "already" : "created");
    } catch (submitError: any) {
      setError(submitError?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4efe2] text-[#142219]">
      <Helmet>
        <title>{GIVEAWAY_DRAFT.campaignName} | Organic Soil Wholesale</title>
        <meta name="description" content={GIVEAWAY_DRAFT.subheadline} />
        <link rel="canonical" href="https://organicsoilwholesale.com/win" />
      </Helmet>

      <header className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/">
          <a aria-label="Back to the Organic Soil Wholesale website" className="inline-flex min-h-11 items-center gap-3">
            <img
              src="/images/soil-seed-and-water-logo.png"
              alt="Soil Seed and Water"
              className="h-10 w-auto object-contain sm:h-12"
            />
            <span className="hidden items-center gap-1 text-xs font-black text-[#526056] sm:inline-flex"><ArrowLeft className="h-3.5 w-3.5" />Back to website</span>
          </a>
        </Link>
        <button
          type="button"
          onClick={goToEnter}
          className="inline-flex min-h-11 items-center rounded-full bg-[#f5b934] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#102f1d]"
        >
          Enter to win
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6 sm:pb-16 sm:pt-10">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a34f2b]">
              {GIVEAWAY_DRAFT.eyebrow}
            </p>
            <h1 className="mt-4 max-w-xl font-heading text-5xl font-black leading-[0.92] tracking-tight text-[#173d25] sm:text-7xl">
              {GIVEAWAY_DRAFT.headline}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-7 text-[#56635a] sm:text-xl">
              {GIVEAWAY_DRAFT.subheadline}
            </p>
          </div>

          <figure
            id="video"
            className="relative mx-auto w-full max-w-[16.5rem] scroll-mt-24 overflow-hidden rounded-[1.5rem] border border-[#d2c8b5] bg-black shadow-[0_12px_40px_rgba(20,34,25,0.18)] sm:max-w-[18rem] lg:mx-0 lg:max-w-[22rem] lg:justify-self-end lg:row-span-2"
          >
            <video
              ref={videoRef}
              className="aspect-[9/16] w-full bg-black object-cover"
              controls
              playsInline
              preload="metadata"
              poster={GIVEAWAY_DRAFT.video.poster}
              aria-label={GIVEAWAY_DRAFT.video.title}
              onVolumeChange={() => {
                if (videoRef.current && !videoRef.current.muted) {
                  setShowUnmuteHint(false);
                }
              }}
            >
              <source src={GIVEAWAY_DRAFT.video.src} type="video/mp4" />
            </video>
            {showUnmuteHint ? (
              <button
                type="button"
                onClick={unmuteVideo}
                className="absolute left-1/2 top-3 z-10 inline-flex min-h-11 min-w-[11rem] -translate-x-1/2 items-center justify-center gap-2 rounded-full bg-black/80 px-4 text-sm font-black text-white shadow-lg"
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                Tap to unmute
              </button>
            ) : null}
          </figure>

          <div>
            <ul className="space-y-3">
              {GIVEAWAY_DRAFT.prizeHighlights.map((item) => (
                <li key={item} className="flex items-start gap-3 font-bold text-[#2e4938]">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dbe8d7] text-[#24703e]">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={goToEnter}
              className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#f5b934] px-6 text-base font-black text-[#102f1d] shadow-[0_5px_0_#a66b0a] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#173d25] sm:w-auto"
            >
              {GIVEAWAY_DRAFT.cta}
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="mt-4 max-w-lg text-xs font-semibold leading-5 text-[#6d756f]">
              No purchase necessary. One entry per email. For the Phoenix Valley and qualifying nearby areas.
            </p>
          </div>
        </section>

        <section aria-label="Winner announcement" className="mt-10 rounded-[1.5rem] border border-[#e6b43c] bg-[#fff8df] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
          <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f5b934] text-[#173d25]"><CalendarDays className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#a34f2b]">Winners announced live</p><h2 className="mt-1 font-heading text-2xl font-black text-[#173d25]">{GIVEAWAY_DRAFT.announcement.date} at {GIVEAWAY_DRAFT.announcement.time}</h2><p className="mt-1 text-sm leading-6 text-[#56635a]">Join our {GIVEAWAY_DRAFT.announcement.event} on Instagram Live.</p><p className="mt-3 text-sm font-semibold leading-6 text-[#173d25]">{GIVEAWAY_DRAFT.announcement.callRule}</p></div></div>
          <a href="https://www.instagram.com/soilseedandwater/" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#173d25] px-5 text-sm font-black text-white sm:mt-0 sm:w-auto"><Instagram className="h-4 w-4" />Follow for the live drawing</a>
        </section>

        <section aria-labelledby="prizes-title" className="pt-12 sm:pt-16">
          <div className="mx-auto max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#a34f2b]">Three winners</p><h2 id="prizes-title" className="mt-2 font-heading text-3xl font-black leading-tight text-[#173d25] sm:text-5xl">Here’s what you can win.</h2></div>
          <div className="mt-7 grid gap-4 lg:grid-cols-3">{GIVEAWAY_DRAFT.prizes.map((prize) => <article key={prize.rank} className={`rounded-[1.5rem] border p-5 sm:p-6 ${prize.featured ? "border-[#f5b934] bg-[#173d25] text-white" : "border-[#d2c8b5] bg-[#fffdf8] text-[#173d25]"}`}><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-full ${prize.featured ? "bg-[#f5b934] text-[#173d25]" : "bg-[#dbe8d7] text-[#24703e]"}`}><Trophy className="h-5 w-5" /></span><div><p className={`text-xs font-black uppercase tracking-[0.14em] ${prize.featured ? "text-[#f5bb45]" : "text-[#a34f2b]"}`}>{prize.rank}</p><h3 className="font-heading text-xl font-black">{prize.title}</h3></div></div><ul className="mt-5 space-y-2.5">{prize.items.map((item) => <li key={item} className="flex gap-2 text-sm font-semibold leading-5"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${prize.featured ? "text-[#f5bb45]" : "text-[#24703e]"}`} />{item}</li>)}</ul></article>)}</div>
        </section>

        <section id="enter" className="scroll-mt-6 pt-10 sm:pt-14">
          <div className="mx-auto max-w-3xl rounded-[1.75rem] bg-[#173d25] p-5 text-white shadow-xl sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5bb45]">Free entry</p>
            <h2 className="mt-2 font-heading text-3xl font-black leading-tight sm:text-4xl">
              {GIVEAWAY_DRAFT.form.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#d8e2da]">{GIVEAWAY_DRAFT.form.intro}</p>

            {success ? (
              <div className="mt-6 rounded-2xl bg-[#fffdf8] p-6 text-center text-[#173d25] sm:p-8">
                <CheckCircle2 className="mx-auto h-14 w-14 text-[#24703e]" aria-hidden="true" />
                <h3 className="mt-4 font-heading text-2xl font-black sm:text-3xl">
                  {success === "already" ? "This email is already entered." : "You’re entered."}
                </h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#536057]">
                  {success === "already"
                    ? `We already have a giveaway entry for ${email}. One entry per email.`
                    : `We saved your entry for ${email}. Keep your phone nearby on October 3 from 10–11 AM Phoenix time. You must answer our call to claim a prize.`}
                </p>
              </div>
            ) : (
              <form
                onSubmit={submit}
                noValidate
                aria-label="Giveaway entry form"
                className="mt-6 rounded-2xl bg-[#fffdf8] p-4 text-[#173d25] sm:p-6"
              >
                <div className="grid gap-4">
                  <label className="text-sm font-black" htmlFor="giveaway-name">
                    Full name
                    <input
                      id="giveaway-name"
                      name="fullName"
                      autoComplete="name"
                      maxLength={120}
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="text-sm font-black" htmlFor="giveaway-email">
                    Email
                    <input
                      id="giveaway-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      maxLength={254}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={FIELD_CLASS}
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-black" htmlFor="giveaway-phone">
                      Phone
                      <input
                        id="giveaway-phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode="tel"
                        maxLength={30}
                        placeholder="(623) 555-0123"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        className={FIELD_CLASS}
                      />
                    </label>
                    <label className="text-sm font-black" htmlFor="giveaway-zip">
                      ZIP code
                      <input
                        id="giveaway-zip"
                        name="zip"
                        autoComplete="postal-code"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="85009"
                        value={zipCode}
                        onChange={(event) => setZipCode(event.target.value)}
                        className={FIELD_CLASS}
                      />
                    </label>
                  </div>

                  <fieldset>
                    <legend className="mb-2 text-sm font-black">Who are you? <span className="font-normal text-[#6d756f]">Select all that apply.</span></legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {GIVEAWAY_DRAFT.form.customerTypes.map(([value, label]) => (
                        <ChoiceButton
                          key={value}
                          selected={customerTypes.includes(value)}
                          onClick={() => toggleCustomerType(value)}
                        >
                          {label}
                        </ChoiceButton>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="mb-2 text-sm font-black">Which best describes your garden?</legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {GIVEAWAY_DRAFT.form.gardenStatuses.map(([value, label]) => (
                        <ChoiceButton
                          key={value}
                          selected={gardenStatus === value}
                          onClick={() => setGardenStatus(value)}
                        >
                          {label}
                        </ChoiceButton>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="mb-2 text-sm font-black">What are you growing?</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {GIVEAWAY_DRAFT.form.growingOptions.map(([value, label]) => (
                        <ChoiceButton
                          key={value}
                          selected={growing.includes(value)}
                          onClick={() => toggleGrowing(value)}
                        >
                          {label}
                        </ChoiceButton>
                      ))}
                    </div>
                    <label className="mt-3 block text-sm font-black" htmlFor="giveaway-growing-other">
                      Other <span className="font-normal text-[#6d756f]">(optional)</span>
                      <input
                        id="giveaway-growing-other"
                        name="growingOther"
                        maxLength={80}
                        placeholder="Figs, grapes"
                        value={growingOther}
                        onChange={(event) => setGrowingOther(event.target.value)}
                        className={FIELD_CLASS}
                      />
                    </label>
                  </fieldset>

                  <label className="text-sm font-black" htmlFor="giveaway-notes">
                    Anything else we should know? <span className="font-normal text-[#6d756f]">(optional)</span>
                    <textarea
                      id="giveaway-notes"
                      name="notes"
                      maxLength={500}
                      rows={4}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className={`${FIELD_CLASS} min-h-[96px] py-3`}
                    />
                  </label>

                  <fieldset className="rounded-2xl border border-[#d7cebd] bg-white p-4">
                    <legend className="px-1 text-sm font-black">{GIVEAWAY_DRAFT.form.followCopy}</legend>
                    <ul className="mt-3 space-y-2">
                      {GIVEAWAY_DRAFT.form.socialChannels.map((channel) => (
                        <li
                          key={channel.key}
                          className="flex items-center gap-2 rounded-xl border border-[#d7cebd] bg-[#f4efe2] p-2 sm:gap-3 sm:p-2.5"
                        >
                          <a
                            href={channel.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleFollowClick(channel.key)}
                            className="inline-flex min-h-11 min-w-[5.75rem] items-center justify-center gap-1 rounded-full bg-[#173d25] px-3 text-sm font-black text-white"
                          >
                            Follow
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                          <span className="min-w-0 flex-1 text-sm font-bold leading-5">{channel.label}</span>
                          <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center">
                            <span className="sr-only">I followed {channel.label}</span>
                            <input
                              type="checkbox"
                              checked={followed[channel.key]}
                              onChange={(event) => setFollowed((current) => ({
                                ...current,
                                [channel.key]: event.target.checked,
                              }))}
                              className="h-5 w-5 accent-[#173d25]"
                            />
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#f4efe2] p-4 text-sm leading-6">
                    <input
                      type="checkbox"
                      checked={emailConsent}
                      onChange={(event) => setEmailConsent(event.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[#173d25]"
                    />
                    <span>{GIVEAWAY_DRAFT.form.emailConsent}</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#f4efe2] p-4 text-sm leading-6">
                    <input
                      type="checkbox"
                      checked={rulesConsent}
                      onChange={(event) => setRulesConsent(event.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[#173d25]"
                    />
                    <span>{GIVEAWAY_DRAFT.form.rulesConsent}</span>
                  </label>

                  <div className="hidden" aria-hidden="true">
                    <label htmlFor="giveaway-website">Website</label>
                    <input
                      id="giveaway-website"
                      name="website"
                      value={website}
                      onChange={(event) => setWebsite(event.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>
                </div>

                {error ? (
                  <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#f5b934] px-5 font-black text-[#102f1d] shadow-[0_5px_0_#a66b0a] disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Saving your entry…
                    </>
                  ) : (
                    GIVEAWAY_DRAFT.cta
                  )}
                </button>
                <p className="mt-3 text-center text-xs font-semibold leading-5 text-[#6d756f]">
                  One entry per email. No purchase necessary.
                </p>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-12 rounded-xl border px-3 text-sm font-bold ${
        selected
          ? "border-[#173d25] bg-[#173d25] text-white"
          : "border-[#c8cfc8] bg-white text-[#173d25]"
      }`}
    >
      {children}
    </button>
  );
}
