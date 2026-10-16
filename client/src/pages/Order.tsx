import React from "react";
import { SimpleOrderForm } from "@/components/SimpleOrderForm";
import SEO from "@/components/layout/SEO";

const Order: React.FC = () => {
  return <>
    <SEO title="Request a Soil Quote" description="Tell us your product, quantity and pickup or delivery needs. Our Arizona team will help you plan your order." canonical="https://www.organicsoilwholesale.com/order" robots="noindex, follow" />
    <SimpleOrderForm />
  </>;
};

export default Order;
