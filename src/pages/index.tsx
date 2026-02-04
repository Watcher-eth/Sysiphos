import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import { WorkflowBuilder } from "@/components/home";
import { PageWrapper } from "@/components/layout/pageWrapper";
import { Sidebar } from "@/components/layout/sidebar";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  return (
    <WorkflowBuilder />

  );
}
