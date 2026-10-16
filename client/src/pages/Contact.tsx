import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Map, Phone, Mail, Clock } from "lucide-react";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { CUSTOMER_SUPPORT_PHONE_DISPLAY, CUSTOMER_SUPPORT_PHONE_TEL } from "@/config/contact";
import { trackEcommerceEvent, trackEvent } from "@/lib/analytics";
import { HOURS_LABEL } from "@shared/pickupSchedule.js";
import { attributedPageUrl } from "@/lib/pageAttribution";

// const WEBHOOK_URL = "https://hook.us1.make.com/bm4eqe7ie77vxt06gx2529x97ecgh28e"; // Deprecated - using internal API now

const generateAdminEmail = (data: FormValues) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2C3E50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        .message-box { background: #f9f9f9; padding: 15px; margin: 15px 0; border-radius: 6px; }
        .customer-info { background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 6px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>New Contact Form Submission</h1>
        </div>
        <div class="content">
            <div class="customer-info">
                <h2>Contact Information</h2>
                <p><strong>Name:</strong> ${data.name}</p>
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Subject:</strong> ${data.subject}</p>
            </div>
            
            <div class="message-box">
                <h3>Message</h3>
                <p>${data.message.replace(/\n/g, "<br>")}</p>
            </div>
            
            <p>This message was submitted through the contact form on ${new Date().toLocaleDateString()}.</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} Organic Soil Wholesale</p>
        </div>
    </div>
</body>
</html>
`;

const generateCustomerEmail = (data: FormValues) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Thank You for Contacting Us</h1>
        </div>
        <div class="content">
            <p>Dear ${data.name},</p>
            <p>Thank you for reaching out to Organic Soil Wholesale. We have received your message and will get back to you as soon as possible.</p>
            
            <div style="background: #f9f9f9; padding: 15px; margin: 20px 0; border-radius: 6px;">
                <h3>Your Message Details</h3>
                <p><strong>Subject:</strong> ${data.subject}</p>
                <p><strong>Message:</strong></p>
                <p>${data.message.replace(/\n/g, "<br>")}</p>
            </div>
            
            <p>If you have any additional questions or information to provide, please don't hesitate to contact us.</p>
            <p>Best regards,<br>The Organic Soil Wholesale Team</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} Organic Soil Wholesale</p>
        </div>
    </div>
</body>
</html>
`;

const formSchema = z.object({
  name: z.string().min(2, { message: "Name is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  subject: z.string().min(2, { message: "Subject is required" }),
  message: z.string().min(10, { message: "Message must be at least 10 characters" }),
});

type FormValues = z.infer<typeof formSchema>;

const Contact = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/contact/submit', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...data,
          source_url: attributedPageUrl(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to submit contact form");
      }

      const result = await response.json();
      trackEvent("Contact Form Submitted", {
        source: "contact_page",
        subject: data.subject,
      });
      trackEcommerceEvent("generate_lead", {
        lead_type: "contact_form",
        source: "contact_page",
        pickup_sales_channel: "osw_yard",
      });

      toast({
        title: "Message Sent",
        description: "Thank you for your message. We'll get back to you soon!",
      });

      form.reset();
      setIsSubmitted(true);
    } catch (error) {
      console.error("Contact form error:", error);
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: "There was an error sending your message. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact" className="py-8 sm:py-12 lg:py-16 bg-neutral-50">
      <div className="container mx-auto px-3 sm:px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6 sm:mb-8 lg:mb-12">
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-primary mb-3 sm:mb-4">Contact Us</h1>
            <p className="text-base sm:text-lg text-neutral-800 max-w-3xl mx-auto">
              Have questions about our products or wholesale program? We're here to help.
              <span className="block text-xs sm:text-sm text-neutral-600 mt-2">
                A division of{" "}
                <a href="https://soilseedandwater.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                  Soil Seed and Water
                </a>
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:gap-6 md:flex-row md:gap-8">
            <div className="w-full md:w-1/3">
              <Card className="h-full">
                <CardContent className="p-4 sm:p-6">
                  <h3 className="font-heading font-semibold text-base sm:text-lg mb-3 sm:mb-4">Contact Information</h3>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-1 sm:space-y-4 sm:gap-0">
                    <div className="flex items-start min-h-[44px]">
                      <Map className="text-primary mt-0.5 mr-2.5 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-sm sm:text-base">Address</h4>
                        <p className="text-xs sm:text-sm text-neutral-700">
                          1634 N 19th Ave
                          <br />
                          Phoenix, AZ 85009
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start min-h-[44px]">
                      <Phone className="text-primary mt-0.5 mr-2.5 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-sm sm:text-base">Phone</h4>
                        <p className="text-xs sm:text-sm text-neutral-700">
                          <a href={CUSTOMER_SUPPORT_PHONE_TEL} className="text-primary hover:underline touch-manipulation">
                            {CUSTOMER_SUPPORT_PHONE_DISPLAY}
                          </a>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start min-h-[44px]">
                      <Mail className="text-primary mt-0.5 mr-2.5 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-sm sm:text-base">Email</h4>
                        <p className="text-xs sm:text-sm text-neutral-700 break-all">info@soilseedandwater.com</p>
                      </div>
                    </div>

                    <div className="flex items-start min-h-[44px]">
                      <Clock className="text-primary mt-0.5 mr-2.5 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                      <div>
                        <h4 className="font-medium text-sm sm:text-base">Yard hours</h4>
                        <p className="text-xs sm:text-sm text-neutral-700">
                          {HOURS_LABEL}
                          <br />
                          Sunday &amp; Monday: Closed
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 overflow-hidden rounded-xl bg-neutral-100">
                    <img
                      src="/images/field-content/team-yard-visit.jpg"
                      alt="Soil Seed and Water field partners in Arizona"
                      className="h-44 w-full object-cover"
                      loading="lazy"
                    />
                    <p className="bg-primary px-3 py-2 text-xs font-semibold text-white">
                      Local team. Arizona yards. Simple pickup and delivery support.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="w-full md:w-2/3">
              {isSubmitted ? (
                <Card>
                  <CardContent className="p-6 sm:p-10 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                      <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-heading font-bold text-foreground mb-2">Thank You!</h3>
                    <p className="text-muted-foreground mb-6">Your message has been sent. We'll get back to you shortly.</p>
                    <Button
                      variant="outline"
                      onClick={() => setIsSubmitted(false)}
                      className="min-h-[48px] px-6 touch-manipulation"
                    >
                      Send Another Message
                    </Button>
                  </CardContent>
                </Card>
              ) : (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h3 className="font-heading font-semibold text-base sm:text-lg mb-3 sm:mb-4">Send Us a Message</h3>

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">Your Name *</FormLabel>
                              <FormControl>
                                <Input placeholder="John Doe" className="min-h-[48px] text-base" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm">Email Address *</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="you@example.com" className="min-h-[48px] text-base" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="subject"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">Subject *</FormLabel>
                            <FormControl>
                              <Input placeholder="How can we help you?" className="min-h-[48px] text-base" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="message"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">Message *</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Please provide details about your inquiry..." className="resize-none min-h-[120px] sm:min-h-[150px] text-base" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button type="submit" className="w-full sm:w-auto min-h-[48px] h-12 px-8 bg-primary hover:bg-primary-light text-white text-base font-semibold touch-manipulation" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          "Send Message"
                        )}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
