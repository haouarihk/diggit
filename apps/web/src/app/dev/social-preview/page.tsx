import { notFound } from "next/navigation";
import { SocialPreviewDevClient } from "./SocialPreviewDevClient";

export const metadata = {
  title: "Social Preview Tester",
};

export default function SocialPreviewDevPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <SocialPreviewDevClient />;
}
