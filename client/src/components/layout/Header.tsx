import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Menu, ShoppingCart, ChevronDown, Phone, User, LogOut, ArrowRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useQuoteCart } from "@/contexts/QuoteCartContext";
import { GROK_ASSISTANT_ENABLED } from "@/config/featureFlags";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";
import { isCallTrackingExcludedPath } from "@/lib/callTracking";

const MENU_PRODUCTS = [
  {
    name: "Simon's Gold",
    type: "Dairy Compost",
    path: "/products/simons-gold",
  },
  {
    name: "Nature's Blanket",
    type: "Organic Mulch",
    path: "/products/natures-blanket",
  },
  {
    name: "Nature's Blanket Premium",
    type: "Premium Dark Mulch",
    path: "/products/natures-blanket-premium",
  },
  {
    name: "Mikey's Worm Poop",
    type: "Worm Castings",
    path: "/products/mikeys-worm-poop",
  },
  {
    name: "Sabrina Kills Bugs",
    type: "All-Organic Insecticide",
    path: "/products/sabrina-kills-bugs",
  },
];

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, user, signOut } = useAuth();
  const { totalItems, openDrawer } = useQuoteCart();
  const headerRef = useRef<HTMLElement | null>(null);
  const prevItemCount = useRef(totalItems);
  const [orderBadgePulse, setOrderBadgePulse] = useState(false);

  useEffect(() => {
    if (totalItems > prevItemCount.current) {
      setOrderBadgePulse(true);
      const timer = window.setTimeout(() => setOrderBadgePulse(false), 1000);
      prevItemCount.current = totalItems;
      return () => window.clearTimeout(timer);
    }
    prevItemCount.current = totalItems;
  }, [totalItems]);

  const updateHeaderHeight = useCallback(() => {
    if (!headerRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!headerRef.current) {
        return;
      }

      const height = Math.ceil(headerRef.current.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--app-header-height", `${height}px`);
    });
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu when location changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const isActive = (path: string) => {
    if (path === "/products") return location === "/products" || location.startsWith("/products/");
    if (path === "/offers") return location === "/offers" || location.startsWith("/offers/") || location.startsWith("/deals");
    if (path === "/careers") return location === "/careers" || location.startsWith("/careers/");
    return location === path;
  };

  const navItemClass = (active: boolean) =>
    `relative inline-flex h-11 items-center whitespace-nowrap rounded-md px-3 text-[14px] font-semibold tracking-[0.01em] transition-colors ${
      active ? "text-[#183a23]" : "text-[#3d4a41] hover:bg-[#183a23]/[0.06] hover:text-[#183a23]"
    }`;

  const navLinks = [
    { name: "Products", path: "/products" },
    { name: "Deals", path: "/offers" },
    { name: "About Us", path: "/about" },
    { name: "Operations", path: "/operations" },
    { name: "Careers", path: "/careers" },
    { name: "Contact", path: "/contact" },
    { name: "FAQ", path: "/faq" },
    ...(GROK_ASSISTANT_ENABLED ? [{ name: "AI Assistant", path: "/grok" }] : []),
  ];

  useLayoutEffect(() => {
    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);
    window.addEventListener("orientationchange", updateHeaderHeight);

    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
      window.removeEventListener("orientationchange", updateHeaderHeight);
    };
  }, [updateHeaderHeight]);

  const lockOfficialPhone = isCallTrackingExcludedPath(location);
  const phoneLinkClass = lockOfficialPhone
    ? "no-call-tracking inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-[#183a23]/[0.08] px-3.5 text-[13px] font-semibold text-[#183a23] transition-colors hover:bg-[#183a23]/[0.12]"
    : "inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-[#183a23]/[0.08] px-3.5 text-[13px] font-semibold text-[#183a23] transition-colors hover:bg-[#183a23]/[0.12]";

  useEffect(() => {
    updateHeaderHeight();
  }, [isScrolled, isMobileMenuOpen, updateHeaderHeight]);

  return (
    <header
      ref={headerRef}
      className={`fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md ${
        isScrolled ? "shadow-[0_8px_24px_rgba(24,58,35,0.08)]" : ""
      }`}
    >
      <div className="h-[3px] bg-[#b38a58]" />
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        <div className="flex h-[4.25rem] items-center gap-3 lg:gap-5">
          {/* Logo */}
          <Link href="/">
            <div className="flex cursor-pointer flex-col leading-tight">
              <span className="font-heading text-[1.05rem] font-extrabold tracking-tight text-[#183a23] sm:text-[1.35rem]">
                Organic <span className="text-[#215330]">Soil</span>{" "}
                <span className="font-display italic text-[#8f7000]">Wholesale</span>
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#6b7468] sm:text-[10px]">
                by Soil Seed &amp; Water
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden min-w-0 flex-1 items-center xl:flex">
            <div className="flex items-center">
            {/* Products Dropdown */}
            <div className="relative flex items-center">
              <Link href="/products">
                <div className={navItemClass(isActive("/products"))}>
                  Products
                  {isActive("/products") ? (
                    <span className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-[#b38a58]" />
                  ) : null}
                </div>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`-ml-1 inline-flex h-11 w-8 items-center justify-center rounded-md transition-colors ${
                      isActive("/products")
                        ? "text-[#183a23]"
                        : "text-[#3d4a41] hover:bg-[#183a23]/[0.06] hover:text-[#183a23]"
                    }`}
                    aria-label="Product categories dropdown"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="z-[60] w-72 rounded-xl border border-[#183a23]/12 !bg-white p-2 text-[#183a23] shadow-[0_16px_40px_rgba(24,58,35,0.18)]"
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setLocation("/products");
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-sm cursor-pointer rounded-lg hover:bg-primary/5 hover:text-primary transition-colors duration-200 font-medium"
                  >
                    <span>All Products</span>
                  </DropdownMenuItem>
                  <div className="h-px w-full bg-border my-1"></div>
                  <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Pay &amp; pick up
                  </div>
                  {MENU_PRODUCTS.map((product) => (
                    <DropdownMenuItem
                      key={product.path}
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        setLocation(product.path);
                      }}
                      className="flex cursor-pointer flex-col items-start gap-0.5 rounded-lg px-4 py-3 text-sm transition-colors duration-200 hover:bg-primary/5 hover:text-primary"
                    >
                      <span className="font-semibold">{product.name}</span>
                      <span className="text-xs text-muted-foreground">{product.type}</span>
                    </DropdownMenuItem>
                  ))}
                  <div className="h-px w-full bg-border my-1"></div>
                  <DropdownMenuItem
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setLocation("/products#request-quote");
                    }}
                    className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium cursor-pointer hover:bg-primary/5 hover:text-primary transition-colors duration-200"
                  >
                    <span>Bulk quote catalog</span>
                    <ArrowRight className="h-4 w-4" />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Other Navigation Links */}
            {navLinks.slice(1).map((link) => (
              <Link key={link.path} href={link.path} className={navItemClass(isActive(link.path))} aria-current={isActive(link.path) ? "page" : undefined}>
                  {link.name}
                  {isActive(link.path) ? (
                    <span className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-[#b38a58]" />
                  ) : null}
              </Link>
            ))}
            </div>

            <div className="ml-auto flex items-center gap-3">
              <a
                href={CUSTOMER_SUPPORT_PHONE_TEL}
                aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}
                {...(lockOfficialPhone
                  ? {
                      "data-callrail-ignore": "true",
                      "data-dynamic-number-ignore": "true",
                      "data-call-tracking-ignore": "true",
                      "data-calltrk-noswap": "true",
                      className: phoneLinkClass,
                    }
                  : {
                      className: phoneLinkClass,
                    })}
                data-official-support-phone="true"
              >
                <Phone className="h-3.5 w-3.5" />
                <span className="tabular-nums" data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span>
              </a>
              {/* Authentication buttons temporarily hidden */}
              {false &&
                (isAuthenticated ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>{user?.email}</span>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link href="/account/orders">
                          <a className="flex items-center w-full">Order History</a>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/account/profile">
                          <a className="flex items-center w-full">My Profile</a>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => signOut()} className="flex items-center cursor-pointer text-red-600">
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link href="/signin">
                      <Button variant="outline" className="border-gray-600 text-gray-700 hover:bg-gray-100 hover:text-gray-900">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/signup">
                      <Button>Sign Up</Button>
                    </Link>
                  </div>
                ))}
              <button
                type="button"
                onClick={openDrawer}
                aria-label={`Open order, ${totalItems} item${totalItems === 1 ? "" : "s"}`}
                className="relative inline-flex h-11 items-center gap-2 rounded-full bg-[#183a23] px-5 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(24,58,35,0.22)] transition-colors hover:bg-[#215330]"
              >
                <ShoppingCart className="h-4 w-4" />
                <span>Order</span>
                {totalItems > 0 && (
                  <span
                    className={`absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#b38a58] px-1 text-[10px] font-bold text-white ${
                      orderBadgePulse ? "animate-bounce" : ""
                    }`}
                  >
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </nav>

          {/* Mobile + iPad portrait Cart + Menu (desktop nav kicks in at lg/1024px) */}
          <div className="ml-auto flex items-center gap-1 xl:hidden">
            {/* Visible cart icon so customers don't have to dig through the menu */}
            <button
              type="button"
              onClick={openDrawer}
              aria-label={`Open order, ${totalItems} item${totalItems === 1 ? "" : "s"}`}
              className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full touch-manipulation ${
                totalItems > 0 ? "bg-[#183a23] text-white" : "text-[#183a23] hover:bg-[#183a23]/[0.08] active:bg-[#183a23]/[0.12]"
              }`}
            >
              <ShoppingCart className="h-5 w-5" />
              {totalItems > 0 && (
                <span
                  className={`absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#b38a58] px-1 text-[10px] font-bold text-white ${
                    orderBadgePulse ? "animate-bounce" : ""
                  }`}
                >
                  {totalItems}
                </span>
              )}
            </button>
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 touch-manipulation text-[#183a23] hover:bg-[#183a23]/[0.08]" aria-label="Open menu">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex h-[100svh] max-h-[100svh] w-[min(90vw,360px)] flex-col overflow-hidden p-0 sm:w-[400px]">
                <SheetTitle className="sr-only">Site navigation</SheetTitle>
                <SheetDescription className="sr-only">Browse products, careers, company information, and contact options.</SheetDescription>
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-col gap-2 border-b border-[#183a23]/10 px-5 pb-4 pr-16 pt-5">
                    <Link href="/">
                      <div className="flex cursor-pointer flex-col leading-tight">
                        <span className="font-heading text-lg font-extrabold text-[#183a23]">
                          Organic <span className="text-[#215330]">Soil</span>{" "}
                          <span className="font-display italic text-[#8f7000]">Wholesale</span>
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#6b7468]">
                          by Soil Seed &amp; Water
                        </span>
                      </div>
                    </Link>
                  </div>

                  <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                    {/* Products Section */}
                    <div className="space-y-1">
                      <Link href="/products">
                        <div
                          className={`cursor-pointer rounded-lg px-4 py-3 font-semibold transition-colors ${
                            isActive("/products")
                              ? "bg-[#183a23] text-white"
                              : "text-[#183a23] hover:bg-[#183a23]/[0.06]"
                          }`}
                        >
                          Products
                        </div>
                      </Link>
                      <div className="space-y-2 pl-3">
                        {MENU_PRODUCTS.map((product) => (
                          <Link key={product.path} href={product.path}>
                            <div className="rounded-lg border border-border/70 bg-white px-4 py-3 text-foreground shadow-sm transition-colors duration-200 hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold leading-snug">{product.name}</div>
                                  <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{product.type}</div>
                                </div>
                                <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                                  Pickup
                                </span>
                              </div>
                            </div>
                          </Link>
                        ))}
                        <Link href="/products#request-quote">
                          <div
                            className="flex items-center justify-between rounded-md px-4 py-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary/5"
                          >
                            <span>Bulk quote catalog</span>
                            <ArrowRight className="h-4 w-4" />
                          </div>
                        </Link>
                      </div>
                    </div>

                    {/* Other Navigation Links */}
                    {navLinks.slice(1).map((link) => (
                      <Link key={link.path} href={link.path} aria-current={isActive(link.path) ? "page" : undefined}
                        className={`block min-h-11 rounded-lg px-4 py-3 font-semibold transition-colors ${
                          isActive(link.path) ? "bg-[#183a23] text-white" : "text-[#183a23] hover:bg-[#183a23]/[0.06]"
                        }`}
                      >
                        {link.name}
                      </Link>
                    ))}

                    {/* Auth section in mobile menu - temporarily hidden */}
                    {false &&
                      (isAuthenticated ? (
                        <div className="space-y-2">
                          <div className="py-3 px-4 text-sm text-gray-600">Signed in as: {user?.email}</div>
                          <Link href="/account/orders">
                            <div className="py-3 px-4 rounded-md text-foreground hover:bg-primary/5 hover:text-primary">Order History</div>
                          </Link>
                          <Link href="/account/profile">
                            <div className="py-3 px-4 rounded-md text-foreground hover:bg-primary/5 hover:text-primary">My Profile</div>
                          </Link>
                          <div
                            onClick={() => {
                              signOut();
                              setIsMobileMenuOpen(false);
                            }}
                            className="py-3 px-4 rounded-md text-red-600 hover:bg-red-50 cursor-pointer flex items-center"
                          >
                            <LogOut className="h-4 w-4 mr-2" />
                            Sign Out
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Link href="/signin">
                            <Button
                              variant="outline"
                              className="w-full border-gray-600 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                              size="lg"
                            >
                              Sign In
                            </Button>
                          </Link>
                          <Link href="/signup">
                            <Button className="w-full" size="lg">
                              Sign Up
                            </Button>
                          </Link>
                        </div>
                      ))}
                  </nav>

                  <div className="shrink-0 border-t border-[#183a23]/10 bg-[#f6f4ee] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
                    <a
                      href={CUSTOMER_SUPPORT_PHONE_TEL}
                      aria-label={`Call ${CUSTOMER_SUPPORT_PHONE_DISPLAY}`}
                      {...(lockOfficialPhone
                        ? {
                            "data-callrail-ignore": "true",
                            "data-dynamic-number-ignore": "true",
                            "data-call-tracking-ignore": "true",
                            "data-calltrk-noswap": "true",
                            className:
                              "no-call-tracking mb-3 flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-[#183a23] shadow-sm",
                          }
                        : {
                            className:
                              "mb-3 flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-[#183a23] shadow-sm",
                          })}
                      data-official-support-phone="true"
                    >
                      <Phone className="h-4 w-4" />
                      <span className="tabular-nums" data-official-support-phone-text="true">{CUSTOMER_SUPPORT_PHONE_DISPLAY}</span>
                    </a>

                    <Button
                      className="relative h-12 w-full rounded-full bg-[#183a23] text-white shadow-[0_8px_20px_rgba(24,58,35,0.22)] hover:bg-[#215330]"
                      size="lg"
                      onClick={() => { setIsMobileMenuOpen(false); openDrawer(); }}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Cart
                      {totalItems > 0 && (
                        <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">
                          {totalItems}
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
