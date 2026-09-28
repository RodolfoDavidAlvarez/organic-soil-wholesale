import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";

type UnsubscribeState = "loading" | "confirm" | "processing" | "success" | "error";

const Unsubscribe = () => {
  const [state, setState] = useState<UnsubscribeState>("loading");
  const [email, setEmail] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Get email from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");

    if (emailParam) {
      setEmail(emailParam);
      setState("confirm");
    } else {
      setState("confirm");
    }
  }, []);

  const handleUnsubscribe = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage("Enter a valid email address to unsubscribe.");
      return;
    }
    setErrorMessage("");
    setState("processing");

    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), reason }),
      });

      const data = await response.json();

      if (response.ok) {
        setState("success");
      } else {
        setState("error");
        setErrorMessage(data.error || "Failed to unsubscribe. Please try again.");
      }
    } catch (error) {
      setState("error");
      setErrorMessage("Network error. Please try again later.");
    }
  };

  return (
    <section className="min-h-screen bg-gradient-to-b from-primary to-primary-light flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-xl">
        {/* Header */}
        <div className="bg-primary text-white p-6 text-center rounded-t-lg">
          <h1 className="text-lg font-semibold tracking-wide text-accent">SOIL SEED & WATER</h1>
          <p className="text-sm text-white/70 mt-1">Regenerative Soil Solutions</p>
        </div>

        <CardContent className="p-6">
          {/* Loading State */}
          {state === "loading" && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          )}

          {/* Confirm State */}
          {state === "confirm" && (
            <div className="text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-muted-foreground" />
              </div>

              <h2 className="text-xl font-semibold text-primary mb-2">Unsubscribe from Emails</h2>
              <p className="text-muted-foreground mb-4">
                Enter the address that receives our emails, then confirm below.
              </p>

              <div className="mb-6 text-left">
                <label htmlFor="unsubscribe-email" className="block text-sm font-medium mb-2">Email address</label>
                <Input id="unsubscribe-email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setErrorMessage(""); }} placeholder="you@example.com" className="min-h-11" />
                {errorMessage && <p role="alert" className="mt-2 text-sm text-red-700">{errorMessage}</p>}
              </div>

              <div className="space-y-4">
                <Button
                  onClick={handleUnsubscribe}
                  className="w-full bg-primary hover:bg-primary-light"
                >
                  Yes, Unsubscribe Me
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.location.href = "https://www.organicsoilwholesale.com"}
                >
                  No, Keep Me Subscribed
                </Button>
              </div>

              <div className="mt-6 pt-4 border-t">
                <label className="block text-sm text-muted-foreground mb-2 text-left">
                  Optional: Let us know why you're leaving
                </label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Your feedback helps us improve..."
                  className="resize-none"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Processing State */}
          {state === "processing" && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Processing your request...</p>
            </div>
          )}

          {/* Success State */}
          {state === "success" && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>

              <h2 className="text-xl font-semibold text-primary mb-2">You've Been Unsubscribed</h2>
              <p className="text-muted-foreground mb-6">
                You will no longer receive marketing emails from Soil Seed & Water.
                <br /><br />
                If this was a mistake, you can always re-subscribe by contacting us.
              </p>

              <Button
                className="w-full bg-primary hover:bg-primary-light"
                onClick={() => window.location.href = "https://www.organicsoilwholesale.com"}
              >
                Return to Website
              </Button>
            </div>
          )}

          {/* Error State */}
          {state === "error" && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>

              <h2 className="text-xl font-semibold text-primary mb-2">Something Went Wrong</h2>
              <p className="text-muted-foreground mb-6">
                {errorMessage}
              </p>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.location.href = "mailto:ralvarez@soilseedandwater.com"}
              >
                Contact Support
              </Button>
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <div className="bg-muted px-6 py-4 text-center border-t rounded-b-lg">
          <p className="text-sm text-muted-foreground">
            Soil Seed & Water | 1634 N 19th Ave, Phoenix, AZ 85009
            <br />
            <a href="mailto:ralvarez@soilseedandwater.com" className="text-primary hover:underline">
              ralvarez@soilseedandwater.com
            </a>
          </p>
        </div>
      </Card>
    </section>
  );
};

export default Unsubscribe;
