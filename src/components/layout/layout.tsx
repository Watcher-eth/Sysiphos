import { Sidebar } from "@/components/layout/sidebar";
import { PageWrapper } from "./pageWrapper";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-gray-100 overflow-hidden">
      <Sidebar />
      <PageWrapper>{children}</PageWrapper>
    </div>
  );
}