import { Route, Switch, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/ui/theme-provider";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FloatingCTA from "@/components/layout/FloatingCTA";
import { lazy, Suspense, useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "@/contexts/AuthContext";
import { QuoteCartProvider } from "@/contexts/QuoteCartContext";
import { AdminAuthProvider } from "@/hooks/useAdminAuth";
import { GrokWidget } from "@/components/GrokWidget";
import { QuoteCartDrawer } from "@/components/QuoteCartDrawer";
import { GROK_ASSISTANT_ENABLED } from "@/config/featureFlags";
import { trackEvent, trackPhoneClick } from "@/lib/analytics";
import {
  enforceOfficialSupportPhones,
  isCallTrackingExcludedPath,
  setDocumentCallTrackingExclusion,
  synchronizeTrackedSupportPhones,
} from "@/lib/callTracking";

const LandscaperSupply = lazy(() => import("@/pages/LandscaperSupply"));
const RlsMaterialGuide = lazy(() => import("@/pages/RlsMaterialGuide"));
const Home = lazy(() => import("@/pages/Home"));
const Pickup = lazy(() => import("@/pages/Pickup"));
const Products = lazy(() => import("@/pages/Products"));
const ProductDetail = lazy(() => import("@/pages/ProductDetail"));
const MulchDetail = lazy(() => import("@/pages/MulchDetail"));
const About = lazy(() => import("@/pages/About"));
const Contact = lazy(() => import("@/pages/Contact"));
const CreditApplication = lazy(() => import("@/pages/CreditApplication"));
const FAQ = lazy(() => import("@/pages/FAQ"));
const Order = lazy(() => import("@/pages/Order"));
const SpecialRequest = lazy(() => import("@/pages/SpecialRequest"));
const Landscapers = lazy(() => import("@/pages/Landscapers"));
const Distributors = lazy(() => import("@/pages/Distributors"));
const Nurseries = lazy(() => import("@/pages/Nurseries"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Careers = lazy(() => import("@/pages/Careers"));
const CareersSales = lazy(() => import("@/pages/CareersSales"));
const CareersGeneral = lazy(() => import("@/pages/CareersSales").then((module) => ({ default: module.CareersGeneral })));
const CareersDriver = lazy(() => import("@/pages/CareersSales").then((module) => ({ default: module.CareersDriver })));
const StoreLocatorEnhanced = lazy(() => import("@/pages/StoreLocatorEnhanced"));
const YardMap = lazy(() => import("@/pages/YardMap"));
const PayAndPickup = lazy(() => import("@/pages/PayAndPickup"));
const PublicOperationsCalendar = lazy(() => import("@/pages/PublicOperationsCalendar"));
const Classes = lazy(() => import("@/pages/Classes"));
const TriviaGame = lazy(() => import("@/pages/TriviaGame"));
const Checkout = lazy(() => import("@/pages/Checkout"));
const OrderConfirmation = lazy(() => import("@/pages/OrderConfirmation"));
const DriveThruAdmin = lazy(() => import("@/pages/DriveThruAdmin"));
const SignIn = lazy(() => import("@/pages/SignIn"));
const SignUp = lazy(() => import("@/pages/SignUp"));
const SignUpSuccess = lazy(() => import("@/pages/SignUpSuccess"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const GrokAssistant = lazy(() => import("@/pages/GrokAssistant"));
const VideoDemo = lazy(() => import("@/pages/VideoDemo"));
const NotFound = lazy(() => import("@/pages/not-found"));
const ExpiredAugustGift = lazy(() => import("@/pages/ExpiredAugustGift"));
const Unsubscribe = lazy(() => import("@/pages/Unsubscribe"));
const NewsletterSignup = lazy(() => import("@/pages/NewsletterSignup"));
const WormCastingsCoupon = lazy(() => import("@/pages/WormCastingsCoupon"));
const SurveyEntry = lazy(() => import("@/pages/SurveyEntry"));
const BundleOffers = lazy(() => import("@/pages/BundleOffers"));
const InstagramLinks = lazy(() => import("@/pages/InstagramLinks"));
const BigGardenGiveaway = lazy(() => import("@/pages/BigGardenGiveaway"));

// Admin Pages
const Register = lazy(() => import("@/pages/Register"));
const AdminLogin = lazy(() => import("@/pages/admin/Login"));
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminProducts = lazy(() => import("@/pages/admin/Products"));
const AdminProductDetail = lazy(() => import("@/pages/admin/ProductDetail"));
const AdminOrders = lazy(() => import("@/pages/admin/Orders"));
const AdminCustomers = lazy(() => import("@/pages/admin/Customers"));
const AdminInventory = lazy(() => import("@/pages/admin/Inventory"));
const AdminAnalytics = lazy(() => import("@/pages/admin/Analytics"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));
const AdminSurveys = lazy(() => import("@/pages/admin/Surveys"));
const AdminRepresentatives = lazy(() => import("@/pages/admin/Representatives"));
const AdminRepresentativeContacts = lazy(() => import("@/pages/admin/RepresentativeContacts"));
const AdminOperations = lazy(() => import("@/pages/admin/Operations"));
const AdminCreateBOL = lazy(() => import("@/pages/admin/CreateBOL"));
const AdminEditBOL = lazy(() => import("@/pages/admin/EditBOL"));
const AdminViewBOL = lazy(() => import("@/pages/admin/ViewBOL"));
const AdminOperationsOrders = lazy(() => import("@/pages/admin/OperationsOrders"));
const AdminWorkOrders = lazy(() => import("@/pages/admin/WorkOrders"));
const AdminCreateWorkOrder = lazy(() => import("@/pages/admin/CreateWorkOrder"));
const AdminViewWorkOrder = lazy(() => import("@/pages/admin/ViewWorkOrder"));
const AdminOperationsCalendar = lazy(() => import("@/pages/admin/OperationsCalendar"));
const AdminOperationsResources = lazy(() => import("@/pages/admin/OperationsResources"));
const AdminCODs = lazy(() => import("@/pages/admin/CODs"));
const AdminCreateCOD = lazy(() => import("@/pages/admin/CreateCOD"));
const AdminViewCOD = lazy(() => import("@/pages/admin/ViewCOD"));
const AdminOperationsSettings = lazy(() => import("@/pages/admin/OperationsSettings"));
const AdminTaskBoard = lazy(() => import("@/pages/admin/TaskBoard"));
const AdminSettings = lazy(() => import("@/pages/admin/Settings"));
const AcceptInvitation = lazy(() => import("@/pages/admin/AcceptInvitation"));
const RepresentativeLanding = lazy(() => import("@/pages/RepresentativeLanding"));
const RepresentativeCardLanding = lazy(() => import("@/pages/RepresentativeCardLanding"));
const CRMCapture = lazy(() => import("@/pages/CRMCapture"));
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));
const ProtectedAdminRoute = lazy(() => import("@/components/admin/ProtectedAdminRoute"));

// ScrollToTop component to handle auto-scrolling
const ScrollToTop = () => {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [location]);

  return null;
};

const CallTrackingRouteSync = () => {
  const [location] = useLocation();

  useEffect(() => {
    const excluded = isCallTrackingExcludedPath(location);
    setDocumentCallTrackingExclusion(excluded);
    if (typeof document === "undefined") return;

    const synchronize = () => {
      if (excluded) enforceOfficialSupportPhones();
      synchronizeTrackedSupportPhones();
    };
    synchronize();
    let scheduledFrame: number | null = null;
    const scheduleSynchronization = () => {
      if (scheduledFrame !== null) return;
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = null;
        synchronize();
      });
    };

    const observer = new MutationObserver(scheduleSynchronization);
    observer.observe(document.body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (scheduledFrame !== null) window.cancelAnimationFrame(scheduledFrame);
    };
  }, [location]);

  return null;
};

const RedirectTo = ({ href }: { href: string }) => {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(href);
  }, [href, setLocation]);
  return null;
};

const GardenBedKit = lazy(() => import("@/pages/GardenBedKit"));

function Router() {
  const useLandscaperSupplyAsDefault = import.meta.env.VITE_DEFAULT_BRAND === "rls";
  return (
    <Suspense fallback={<div className="flex min-h-[calc(100vh-var(--app-header-height,5rem))] items-center justify-center text-muted-foreground">Loading...</div>}>
      <Switch>
        <Route path="/ig" component={InstagramLinks} />
        <Route path="/links/instagram" component={InstagramLinks} />
        <Route path="/fb" component={InstagramLinks} />
        <Route path="/facebook" component={InstagramLinks} />
        <Route path="/links/facebook" component={InstagramLinks} />
        <Route path="/tiktok" component={InstagramLinks} />
        <Route path="/tt" component={InstagramLinks} />
        <Route path="/links/tiktok" component={InstagramLinks} />
        <Route path="/youtube" component={InstagramLinks} />
        <Route path="/yt" component={InstagramLinks} />
        <Route path="/links/youtube" component={InstagramLinks} />
        <Route path="/landscaper-supply/:step?" component={LandscaperSupply} />
        {useLandscaperSupplyAsDefault && <Route path="/materials/:slug" component={RlsMaterialGuide} />}
        <Route path="/" component={useLandscaperSupplyAsDefault ? LandscaperSupply : Home} />
        <Route path="/pickup" component={Pickup} />
        <Route path="/products/mulch/:id" component={MulchDetail} />
        <Route path="/products/garden-bed-kit" component={GardenBedKit} />
        <Route path="/garden-bed" component={GardenBedKit} />
        <Route path="/products/:slug" component={ProductDetail} />
        <Route path="/products" component={Products} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/credit-application" component={CreditApplication} />
        <Route path="/apply" component={CreditApplication} />
        <Route path="/account-form" component={CreditApplication} />
        <Route path="/faq" component={FAQ} />
        <Route path="/order" component={Order} />
        <Route path="/special-request" component={SpecialRequest} />
        <Route path="/landscapers" component={Landscapers} />
        <Route path="/distributors" component={Distributors} />
        <Route path="/wholesale" component={Distributors} />
        <Route path="/nurseries" component={Nurseries} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/careers/sales" component={CareersSales} />
        <Route path="/careers/truck-driver" component={CareersDriver} />
        <Route path="/careers/general" component={CareersGeneral} />
        <Route path="/careers" component={Careers} />
        <Route path="/jobs">{() => <RedirectTo href="/careers" />}</Route>
        <Route path="/store-locator" component={StoreLocatorEnhanced} />
        <Route path="/yard-map" component={YardMap} />
        <Route path="/pay-and-pickup/:step?" component={PayAndPickup} />
        <Route path="/drive-through/:step?" component={PayAndPickup} />
        <Route path="/qr" component={PayAndPickup} />
        <Route path="/check-in" component={PayAndPickup} />
        <Route path="/reservations">{() => <RedirectTo href="/qr" />}</Route>
        <Route path="/book">{() => <RedirectTo href="/qr" />}</Route>
        <Route path="/operations-calendar" component={PublicOperationsCalendar} />
        <Route path="/classes" component={Classes} />
        <Route path="/garden-classes" component={Classes} />
        <Route path="/trivia" component={TriviaGame} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/drive-thru/admin" component={DriveThruAdmin} />
        <Route path="/order-confirmation" component={OrderConfirmation} />
        {GROK_ASSISTANT_ENABLED && <Route path="/grok" component={GrokAssistant} />}
        <Route path="/video-demo" component={VideoDemo} />
        <Route path="/rep/rodolfo" component={RepresentativeCardLanding} />
        <Route path="/rep/sabrina" component={RepresentativeCardLanding} />
        <Route path="/rep/jonathan" component={RepresentativeCardLanding} />
        <Route path="/rep/astrid" component={RepresentativeCardLanding} />
        <Route path="/rep/vanessa" component={RepresentativeCardLanding} />
        <Route path="/rep/:slug" component={RepresentativeLanding} />
        {/* CRM routes: /crm/:org/:user or /crm/:org */}
        <Route path="/crm/ssw/:user" component={CRMCapture} />
        <Route path="/crm/ufe/:user" component={CRMCapture} />
        <Route path="/crm/ssw" component={CRMCapture} />
        <Route path="/crm/ufe" component={CRMCapture} />
        <Route path="/unsubscribe" component={Unsubscribe} />
        <Route path="/free-worm-castings" component={ExpiredAugustGift} />
        <Route path="/fall-garden-workshop" component={Classes} />
        <Route path="/survey/garden-class" component={SurveyEntry} />
        <Route path="/survey" component={SurveyEntry} />
        <Route path="/offers/:slug" component={BundleOffers} />
        <Route path="/offers" component={BundleOffers} />
        <Route path="/garden-refresh">{() => <RedirectTo href="/offers/garden-refresh" />}</Route>
        <Route path="/garden-refresh-plus">{() => <RedirectTo href="/offers/garden-refresh-plus" />}</Route>
        <Route path="/deals/:slug">{(params: { slug: string }) => <RedirectTo href={`/offers/${params.slug}`} />}</Route>
        <Route path="/deals">{() => <RedirectTo href="/offers" />}</Route>
        <Route path="/promos/:slug">{(params: { slug: string }) => <RedirectTo href={`/offers/${params.slug}`} />}</Route>
        <Route path="/promos">{() => <RedirectTo href="/offers" />}</Route>
        <Route path="/promo/:slug">{(params: { slug: string }) => <RedirectTo href={`/offers/${params.slug}`} />}</Route>
        <Route path="/promo">{() => <RedirectTo href="/offers" />}</Route>
        <Route path="/redeem/worm-castings/:token" component={WormCastingsCoupon} />
        <Route path="/keep-growing"><NewsletterSignup /></Route>
        <Route path="/newsletter"><NewsletterSignup /></Route>
        <Route path="/win" component={BigGardenGiveaway} />
        <Route path="/big-garden-giveaway" component={BigGardenGiveaway} />

        {/* Customer Auth Routes */}
        <Route path="/signin" component={SignIn} />
        <Route path="/signup" component={SignUp} />
        <Route path="/signup-success" component={SignUpSuccess} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password/:token" component={ResetPassword} />
        <Route path="/verify-email/:token" component={VerifyEmail} />

        {/* Admin Routes */}
        <Route path="/register" component={Register} />
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/invite/:token" component={AcceptInvitation} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/products/:productId" component={AdminProductDetail} />
        <Route path="/admin/products" component={AdminProducts} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route path="/admin/customers" component={AdminCustomers} />
        <Route path="/admin/inventory" component={AdminInventory} />
        <Route path="/admin/analytics" component={AdminAnalytics} />
        <Route path="/admin/notifications" component={AdminNotifications} />
        <Route path="/admin/surveys" component={AdminSurveys} />
        <Route path="/admin/representatives" component={AdminRepresentatives} />
        <Route path="/admin/representative-contacts" component={AdminRepresentativeContacts} />
        <Route path="/admin/operations/bols/new" component={AdminCreateBOL} />
        <Route path="/admin/operations/bols/:id/edit" component={AdminEditBOL} />
        <Route path="/admin/operations/bols/:id" component={AdminViewBOL} />
        <Route path="/admin/operations/orders" component={AdminOperationsOrders} />
        <Route path="/admin/operations/work-orders/new" component={AdminCreateWorkOrder} />
        <Route path="/admin/operations/work-orders/:id" component={AdminViewWorkOrder} />
        <Route path="/admin/operations/work-orders" component={AdminWorkOrders} />
        <Route path="/admin/operations/calendar" component={AdminOperationsCalendar} />
        <Route path="/admin/operations/settings" component={AdminOperationsSettings} />
        <Route path="/admin/operations/tasks" component={AdminTaskBoard} />
        <Route path="/admin/operations/resources" component={AdminOperationsResources} />
        <Route path="/admin/operations/cods/new" component={AdminCreateCOD} />
        <Route path="/admin/operations/cods/:id" component={AdminViewCOD} />
        <Route path="/admin/operations/cods" component={AdminCODs} />
        <Route path="/admin/operations" component={AdminOperations} />
        <Route path="/admin/settings" component={AdminSettings} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [location] = useLocation();
  const isLandscaperSupplyProject = import.meta.env.VITE_DEFAULT_BRAND === "rls";
  // /qr is the printed-signage URL at the OSW yard main entrance — no global chrome.
  const isPayAndPickup =
    location.startsWith("/pay-and-pickup") ||
    location.startsWith("/drive-through") ||
    location === "/qr" ||
    location.startsWith("/qr/") ||
    location === "/check-in";
  const isTriviaGame = location.startsWith("/trivia");
  const isCheckoutFlow = location.startsWith("/checkout") || location.startsWith("/order-confirmation") || location.startsWith("/quick-order");
  const isQuoteFlow = location.startsWith("/order");
  const isProductFlow = location.startsWith("/products");
  const isOfferFlow =
    location.startsWith("/offers") ||
    location.startsWith("/deals") ||
    location.startsWith("/promos") ||
    location === "/promo" ||
    location.startsWith("/promo/");
  const isDriveThruAdmin = location.startsWith("/drive-thru/admin");
  const isAdminPanel = location.startsWith("/admin");
  const isRepresentativeLanding = location.startsWith("/rep/");
  const isCRMCapture = location.startsWith("/crm");
  const isUnsubscribe = location.startsWith("/unsubscribe");
  const isOperationsCalendar = location.startsWith("/operations-calendar");
  const isClientSurvey = location === "/survey" || location.startsWith("/survey/");
  const isSocialLinks = [
    "/ig", "/links/instagram",
    "/fb", "/facebook", "/links/facebook",
    "/tiktok", "/tt", "/links/tiktok",
    "/youtube", "/yt", "/links/youtube",
  ].includes(location);
  const isGiveawayCampaign = location === "/win" || location === "/big-garden-giveaway";
  const isCareers = location.startsWith("/careers") || location === "/jobs";
  const isLandscaperSupply = isLandscaperSupplyProject || location.startsWith("/landscaper-supply");
  const showStandardLayout = !isLandscaperSupply && !isPayAndPickup && !isTriviaGame && !isCheckoutFlow && !isDriveThruAdmin && !isAdminPanel && !isRepresentativeLanding && !isCRMCapture && !isUnsubscribe && !isOperationsCalendar && !isClientSurvey && !isSocialLinks && !isGiveawayCampaign;

  useEffect(() => {
    trackEvent("Route Viewed", {
      path: location,
      area: isCheckoutFlow
        ? "checkout"
        : isPayAndPickup
          ? "yard_qr"
          : isProductFlow
            ? "products"
            : isAdminPanel
              ? "admin"
              : "marketing",
    });
  }, [isAdminPanel, isCheckoutFlow, isPayAndPickup, isProductFlow, location]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href^="tel:"]') : null;
      if (!target) return;
      const href = target.getAttribute("href") || "";
      trackPhoneClick({ location, phone_href: href });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [location]);

  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
          <AuthProvider>
            <QuoteCartProvider>
              <AdminAuthProvider>
                <TooltipProvider>
                  <div className="min-h-screen flex flex-col">
                    {showStandardLayout && <Header />}
                    <main className="flex-grow" style={showStandardLayout ? { paddingTop: "var(--app-header-height, 6.5rem)" } : undefined}>
                      <Router />
                    </main>
                    {showStandardLayout && <Footer />}
                    <Toaster />
                    <ScrollToTop />
                    <CallTrackingRouteSync />
                    <Analytics />
                    {showStandardLayout && !isQuoteFlow && !isProductFlow && !isOfferFlow && !isCareers && <FloatingCTA />}
                    {showStandardLayout && <QuoteCartDrawer />}
                    {GROK_ASSISTANT_ENABLED && <GrokWidget />}
                  </div>
                </TooltipProvider>
              </AdminAuthProvider>
            </QuoteCartProvider>
          </AuthProvider>
        </ThemeProvider>
      </HelmetProvider>
    </QueryClientProvider>
  );
}

export default App;
