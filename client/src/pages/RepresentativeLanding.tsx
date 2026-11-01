import { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Mail,
  Phone,
  Globe,
  MapPin,
  Facebook,
  Twitter,
  Linkedin,
  Instagram,
  Send,
  CheckCircle2,
  CreditCard,
  Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { usePhoneNumberLock } from '@/hooks/usePhoneNumberLock';
import { formatPhoneNumber, getPhoneNumberForTel } from '@/utils/phone';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import BusinessCardCapture from '@/components/BusinessCardCapture';

interface Representative {
  id: number;
  slug: string;
  name: string;
  email: string;
  phone?: string;
  website?: string;
  bio?: string;
  photo_url?: string;
  banner_image_url?: string;
  gallery_images?: string[];
  company_name?: string;
  title?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  social_links?: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    instagram?: string;
  };
  contact_button_text?: string;
  contact_card_button_text?: string;
  contact_form_title?: string;
  contact_form_description?: string;
  video_urls?: string[];
}

const getYouTubeVideoId = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '').trim() || null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.replace('/shorts/', '').trim() || null;
      }
      return parsed.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
};

const getYouTubeEmbedUrl = (url: string): string | null => {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0&controls=1&loop=1&playlist=${videoId}`;
};

export default function RepresentativeLanding() {
  const [, params] = useRoute('/rep/:slug');
  const slug = (params as { slug?: string })?.slug || '';
  const { toast } = useToast();

  // Exclude this page from phone number tracking systems (CallRail, etc.)
  // Use useLayoutEffect to set attributes before paint, preventing script from running
  useEffect(() => {
    // Set on html element
    document.documentElement.setAttribute('data-callrail-ignore', 'true');
    document.documentElement.setAttribute('data-dynamic-number-ignore', 'true');
    document.documentElement.setAttribute('data-call-tracking-ignore', 'true');
    document.documentElement.setAttribute('data-calltrk-noswap', 'true');
    
    // Also set on body element
    document.body.setAttribute('data-callrail-ignore', 'true');
    document.body.setAttribute('data-dynamic-number-ignore', 'true');
    document.body.setAttribute('data-call-tracking-ignore', 'true');
    document.body.setAttribute('data-calltrk-noswap', 'true');
    
    // Set class for additional exclusion methods
    document.documentElement.classList.add('no-call-tracking');
    document.body.classList.add('no-call-tracking');
    
    // Prevent phone number replacement by wrapping in protected container
    const style = document.createElement('style');
    style.textContent = `
      [data-callrail-ignore="true"],
      [data-dynamic-number-ignore="true"],
      .no-call-tracking a[href^="tel:"] {
        pointer-events: auto !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.documentElement.removeAttribute('data-callrail-ignore');
      document.documentElement.removeAttribute('data-dynamic-number-ignore');
      document.documentElement.removeAttribute('data-call-tracking-ignore');
      document.documentElement.removeAttribute('data-calltrk-noswap');
      document.body.removeAttribute('data-callrail-ignore');
      document.body.removeAttribute('data-dynamic-number-ignore');
      document.body.removeAttribute('data-call-tracking-ignore');
      document.body.removeAttribute('data-calltrk-noswap');
      document.documentElement.classList.remove('no-call-tracking');
      document.body.classList.remove('no-call-tracking');
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
  }, []);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);
  const [isBusinessCardDialogOpen, setIsBusinessCardDialogOpen] = useState(false);

  useEffect(() => {
    if (!isContactDialogOpen) {
      setIsSubmitted(false);
    }
  }, [isContactDialogOpen]);

  const {
    data: representative,
    isLoading,
    error,
  } = useQuery<Representative>({
    queryKey: ['representative', slug],
    queryFn: async () => {
      const response = await fetch(`/api/representatives/${slug}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to fetch landing page (${response.status})`;
        throw new Error(errorMessage);
      }
      return response.json();
    },
    enabled: !!slug,
    retry: false, // Don't retry on 404 errors
  });

  const submitMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch(`/api/representatives/${slug}/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          message: data.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit form');
      }

      return response.json();
    },
    onSuccess: () => {
      setIsSubmitted(true);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        notes: '',
      });
      toast({
        title: 'Success!',
        description: 'Your message has been sent successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }
    submitMutation.mutate(formData);
  };

  usePhoneNumberLock({ enabled: Boolean(representative?.phone) });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !representative) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">Landing Page Not Found</h1>
          <p className="text-muted-foreground mb-2">
            {errorMessage.includes('404') || errorMessage.includes('not found') 
              ? "The contact card you're looking for doesn't exist or is inactive."
              : `Error: ${errorMessage}`}
          </p>
          {errorMessage.includes('Failed to fetch') && (
            <p className="text-sm text-muted-foreground mt-2">
              Please make sure your contact card is saved and the landing page is enabled in Settings.
            </p>
          )}
        </div>
      </div>
    );
  }

  const galleryImages = Array.isArray(representative.gallery_images)
    ? representative.gallery_images.filter((url) => !!url)
    : [];
  const videoUrls = Array.isArray(representative.video_urls)
    ? representative.video_urls.filter((url) => !!url)
    : [];
  const contactButtonLabel = representative.contact_button_text || 'Enter Your Contact Details';
  const contactCardLabel = representative.contact_card_button_text || 'Download Contact Card';
  const contactFormTitle = representative.contact_form_title || 'Stay Connected';
  const contactFormDescription =
    representative.contact_form_description ||
    'Share a few quick details and I will follow up with tailored wholesale recommendations.';
  const locationLine = [representative.address, representative.city, representative.state, representative.zip_code]
    .filter(Boolean)
    .join(', ');
  const socialLinks = representative.social_links || {};
  const hasBanner = Boolean(representative.banner_image_url);
  const primaryCtaClasses =
    'w-full bg-emerald-400 text-emerald-950 hover:bg-emerald-300 shadow-lg font-semibold border border-emerald-50/70';
  const secondaryCtaClasses =
    'w-full border border-white/80 bg-white/15 text-white hover:bg-white/25 hover:text-white shadow-lg backdrop-blur-sm disabled:border-white/40 disabled:bg-white/5 disabled:text-white/50';

  const handleDownloadContactCard = async () => {
    if (!representative) return;
    try {
      setIsDownloadingCard(true);
      const response = await fetch(`/api/representatives/${slug}/contact-card`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Unable to download contact card');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${representative.slug || representative.name || 'contact'}.vcf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({
        title: 'Contact card ready',
        description: 'Check your downloads to add it to your contacts.',
      });
    } catch (downloadError: any) {
      toast({
        title: 'Download failed',
        description: downloadError.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingCard(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950/5 via-white to-emerald-50/40 text-slate-900">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-0 lg:py-10">
        <section className="relative overflow-hidden rounded-2xl border border-emerald-100/80 bg-white shadow-2xl shadow-emerald-900/10 sm:rounded-3xl">
          <div className="absolute inset-0">
            {hasBanner && representative.banner_image_url ? (
              <img
                src={representative.banner_image_url}
                alt={`${representative.name} banner`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-700" />
            )}
            <div className="absolute inset-0 bg-emerald-950/60" />
          </div>
          <div className="relative flex flex-col items-center px-4 py-10 text-center text-white sm:px-6 sm:py-12 md:px-10 md:py-14">
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-100/90 sm:text-[11px] sm:tracking-[0.4em]">
              Soil Seed &amp; Water
            </span>
            {representative.photo_url ? (
              <img
                src={representative.photo_url}
                alt={representative.name}
                className="my-5 h-24 w-24 rounded-full border-4 border-white/60 object-cover shadow-lg shadow-black/20 sm:my-6 sm:h-28 sm:w-28"
              />
            ) : (
              <div className="my-5 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/60 bg-white/15 text-2xl font-semibold uppercase text-white sm:my-6 sm:h-28 sm:w-28 sm:text-3xl">
                {representative.name?.charAt(0) || '?'}
              </div>
            )}
            <h1 className="text-2xl font-heading font-semibold sm:text-3xl md:text-4xl lg:text-5xl">
              Hey there, I'm {representative.name}
            </h1>
            {representative.title && (
              <p className="mt-2 text-sm text-emerald-100/90 sm:text-base">{representative.title}</p>
            )}
            {representative.company_name && (
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-emerald-100/70 sm:text-sm sm:tracking-[0.3em]">
                {representative.company_name}
              </p>
            )}
            <div className="mt-6 grid w-full gap-3 sm:mt-8 sm:max-w-xl sm:grid-cols-2">
              <Button
                size="lg"
                className={primaryCtaClasses}
                onClick={() => setIsContactDialogOpen(true)}
              >
                {contactButtonLabel}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className={secondaryCtaClasses}
                onClick={handleDownloadContactCard}
                disabled={isDownloadingCard}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                {isDownloadingCard ? 'Preparing...' : contactCardLabel}
              </Button>
            </div>
            <div className="mt-3 w-full sm:max-w-xl">
              <Button
                size="lg"
                variant="outline"
                className={secondaryCtaClasses}
                onClick={() => setIsBusinessCardDialogOpen(true)}
              >
                <Camera className="mr-2 h-4 w-4" />
                Submit Business Card
              </Button>
            </div>
            <p className="mt-4 text-xs text-emerald-100/80 sm:text-sm">
              Prefer to call or email? Everything you need lives below.
            </p>
          </div>
        </section>

        <section className="mt-6 sm:mt-8 lg:mt-10">
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="rounded-2xl border border-emerald-300/40 bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-700 p-5 text-white shadow-xl shadow-emerald-900/30 sm:rounded-3xl sm:p-6">
              <h2 className="mb-4 text-xl font-semibold text-white sm:text-2xl">Direct contact</h2>
              <div className="space-y-4 sm:space-y-5">
                {representative.email && (
                  <div className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm sm:rounded-2xl sm:p-4">
                    <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-100 sm:mt-1 sm:h-5 sm:w-5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/80 sm:text-xs sm:tracking-[0.25em]">Email</p>
                      <a
                        href={`mailto:${representative.email}`}
                        className="mt-0.5 block break-words text-sm font-semibold text-white underline-offset-4 hover:underline sm:text-base"
                      >
                        {representative.email}
                      </a>
                    </div>
                  </div>
                )}
                {representative.phone && (
                  <div
                    className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm sm:rounded-2xl sm:p-4"
                    data-callrail-ignore="true" data-calltrk-noswap="true"
                    data-dynamic-number-ignore="true"
                    data-call-tracking-ignore="true"
                  >
                    <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-100 sm:mt-1 sm:h-5 sm:w-5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/80 sm:text-xs sm:tracking-[0.25em]">Phone</p>
                      <a
                        href={`tel:${getPhoneNumberForTel(representative.phone)}`}
                        className="mt-0.5 block text-sm font-semibold text-white underline-offset-4 hover:underline no-call-tracking sm:text-base"
                        data-callrail-ignore="true" data-calltrk-noswap="true"
                        data-dynamic-number-ignore="true"
                        data-call-tracking-ignore="true"
                        data-phone-number={representative.phone}
                      >
                        {formatPhoneNumber(representative.phone)}
                      </a>
                    </div>
                  </div>
                )}
                {representative.website && (
                  <div className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm sm:rounded-2xl sm:p-4">
                    <Globe className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-100 sm:mt-1 sm:h-5 sm:w-5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/80 sm:text-xs sm:tracking-[0.25em]">
                        Website
                      </p>
                      <a
                        href={representative.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block break-words text-sm font-semibold text-white underline-offset-4 hover:underline sm:text-base"
                      >
                        {representative.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  </div>
                )}
                {locationLine && (
                  <div className="flex items-start gap-3 rounded-xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm sm:rounded-2xl sm:p-4">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-100 sm:mt-1 sm:h-5 sm:w-5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/80 sm:text-xs sm:tracking-[0.25em]">
                        Location
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{locationLine}</p>
                    </div>
                  </div>
                )}
              </div>

              {(socialLinks.facebook ||
                socialLinks.twitter ||
                socialLinks.linkedin ||
                socialLinks.instagram) && (
                <div className="mt-5 border-t border-white/20 pt-5 sm:mt-6 sm:pt-6">
                  <p className="mb-3 text-xs font-medium text-emerald-100 sm:text-sm">Connect online</p>
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    {socialLinks.facebook && (
                      <a
                        href={socialLinks.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-white/20 p-2 text-white transition hover:bg-white/30 backdrop-blur-sm"
                        aria-label="Facebook"
                      >
                        <Facebook className="h-4 w-4 sm:h-5 sm:w-5" />
                      </a>
                    )}
                    {socialLinks.twitter && (
                      <a
                        href={socialLinks.twitter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-white/20 p-2 text-white transition hover:bg-white/30 backdrop-blur-sm"
                        aria-label="Twitter"
                      >
                        <Twitter className="h-4 w-4 sm:h-5 sm:w-5" />
                      </a>
                    )}
                    {socialLinks.linkedin && (
                      <a
                        href={socialLinks.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-white/20 p-2 text-white transition hover:bg-white/30 backdrop-blur-sm"
                        aria-label="LinkedIn"
                      >
                        <Linkedin className="h-4 w-4 sm:h-5 sm:w-5" />
                      </a>
                    )}
                    {socialLinks.instagram && (
                      <a
                        href={socialLinks.instagram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-white/20 p-2 text-white transition hover:bg-white/30 backdrop-blur-sm"
                        aria-label="Instagram"
                      >
                        <Instagram className="h-4 w-4 sm:h-5 sm:w-5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {(galleryImages.length > 0 || videoUrls.length > 0) && (
              <div className="rounded-2xl border border-emerald-100 bg-white/90 p-5 shadow-lg shadow-emerald-900/5 sm:rounded-3xl sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  {galleryImages.map((image, index) => (
                    <div
                      key={`${image}-${index}`}
                      className="overflow-hidden rounded-xl border border-emerald-50 bg-muted/20 sm:rounded-2xl"
                    >
                      <img
                        src={image}
                        alt={`${representative.name} gallery ${index + 1}`}
                        className="h-40 w-full object-cover transition duration-300 hover:scale-105 sm:h-48"
                      />
                    </div>
                  ))}
                  {videoUrls.map((url, index) => {
                    const embedUrl = getYouTubeEmbedUrl(url);
                    return (
                      <div
                        key={`${url}-${index}`}
                        className="relative overflow-hidden rounded-xl border border-emerald-100 bg-emerald-900/20 shadow-inner aspect-video sm:rounded-2xl"
                      >
                        {embedUrl ? (
                          <iframe
                            src={embedUrl}
                            title={`Video ${index + 1}`}
                            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                            allowFullScreen
                            loading="lazy"
                            className="h-full w-full"
                          />
                        ) : (
                          <video
                            src={url}
                            className="h-full w-full object-cover"
                            autoPlay
                            muted
                            loop
                            playsInline
                            controls
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {representative.bio && (
            <div className="mt-6 rounded-2xl border border-emerald-100 bg-white/90 p-5 shadow-lg shadow-emerald-900/5 sm:mt-8 sm:rounded-3xl sm:p-6">
              <h2 className="mb-3 text-xl font-semibold text-emerald-900 sm:mb-4 sm:text-2xl">About Soil Seed &amp; Water</h2>
              <p className="text-sm leading-relaxed text-emerald-900/90 sm:text-base">{representative.bio}</p>
            </div>
          )}
        </section>
      </main>

      <Dialog open={isContactDialogOpen} onOpenChange={setIsContactDialogOpen}>
        <DialogContent className="w-[94vw] max-w-xl rounded-xl border border-gray-200 bg-white p-5 shadow-xl sm:p-6 md:p-8">
          <DialogHeader className="space-y-2 pb-3 sm:pb-4">
            <DialogTitle className="text-xl font-bold text-gray-900 tracking-tight sm:text-2xl">
              {contactFormTitle}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-600 leading-relaxed sm:text-sm">
              Provide a few quick details so {representative.name} can follow up within one business day.
            </DialogDescription>
          </DialogHeader>

          {isSubmitted ? (
            <div className="py-6 text-center sm:py-8">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 sm:mb-4 sm:h-16 sm:w-16">
                <CheckCircle2 className="h-8 w-8 text-blue-600 sm:h-10 sm:w-10" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-gray-900 sm:text-xl">Thank You!</h3>
              <p className="mb-5 text-xs text-gray-600 leading-relaxed sm:mb-6 sm:text-sm">
                Your message has been sent successfully. {representative.name} will get back to you
                soon.
              </p>
              <Button 
                className="w-full h-10 rounded-lg bg-gray-900 text-white text-sm font-medium shadow-sm hover:bg-gray-800 transition-colors sm:h-11 sm:text-base" 
                onClick={() => setIsContactDialogOpen(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label 
                    htmlFor="firstName"
                    className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide sm:text-xs"
                  >
                    First Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    className="h-10 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-all duration-150 focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-offset-0 sm:h-11 sm:text-base"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="John"
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label 
                    htmlFor="lastName"
                    className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide sm:text-xs"
                  >
                    Last Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    className="h-10 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-all duration-150 focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-offset-0 sm:h-11 sm:text-base"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label 
                  htmlFor="email"
                  className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide sm:text-xs"
                >
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  className="h-10 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-all duration-150 focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-offset-0 sm:h-11 sm:text-base"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label 
                  htmlFor="phone"
                  className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide sm:text-xs"
                >
                  Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  className="h-10 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-all duration-150 focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-offset-0 sm:h-11 sm:text-base"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label 
                  htmlFor="notes"
                  className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide sm:text-xs"
                >
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  className="min-h-[90px] rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-all duration-150 focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:ring-offset-0 resize-none sm:min-h-[100px] sm:text-base"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  placeholder="Briefly describe how we can help..."
                />
              </div>

              <Button
                type="submit"
                className="mt-1 w-full h-11 rounded-lg bg-gray-900 text-white text-sm font-semibold tracking-wide shadow-sm transition-all duration-150 hover:bg-gray-800 hover:shadow-md focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:text-base"
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Message
                  </>
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <BusinessCardCapture
        isOpen={isBusinessCardDialogOpen}
        onClose={() => setIsBusinessCardDialogOpen(false)}
        representativeSlug={slug}
        representativeName={representative.name}
        isRepMode={new URLSearchParams(window.location.search).get('crm') === 'true'}
        defaultLeadSource={new URLSearchParams(window.location.search).get('source') || 'uscc_2026'}
      />
    </div>
  );
}
