"use client";

import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Layout from "@/components/layout/layout";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/router";
import * as React from "react";

function stripQuery(path: string) {
  return path.split("?")[0] || path;
}

function useRouteDirection() {
  const router = useRouter();
  const lastIndexRef = React.useRef<number>(0);
  const orderRef = React.useRef<Map<string, number>>(new Map());

  const getIndex = React.useCallback((path: string) => {
    const clean = stripQuery(path);
    const map = orderRef.current;
    const existing = map.get(clean);
    if (existing != null) return existing;
    const next = map.size + 1;
    map.set(clean, next);
    return next;
  }, []);

  const [direction, setDirection] = React.useState<1 | -1>(1);

  React.useEffect(() => {
    const handleStart = (url: string) => {
      const next = getIndex(url);
      const prev = lastIndexRef.current || getIndex(router.asPath);
      setDirection(next >= prev ? 1 : -1);
      lastIndexRef.current = next;
    };

    router.events.on("routeChangeStart", handleStart);
    return () => {
      router.events.off("routeChangeStart", handleStart);
    };
  }, [router, getIndex]);

  return direction;
}

// Airbnb-ish: tiny scale, soft fade, extremely subtle directional nudge.
// (Scale tweak: 0.995 -> 0.997) + slightly faster but still soft spring.
const pageVariants = {
  initial: (direction: 1 | -1) => ({
    opacity: 0,
    y: 4,
    x: direction * 4,
    scale: 0.997,
    filter: "blur(1.5px)",
  }),
  animate: {
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
  },
  exit: (direction: 1 | -1) => ({
    opacity: 0,
    y: -2,
    x: direction * -3,
    scale: 0.998,
    filter: "blur(1.5px)",
  }),
};

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const direction = useRouteDirection();

  return (
    <Layout>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={router.asPath}
          custom={direction}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{
            stiffness: 260,
            damping: 34,
            mass: 1,
            type: "spring",
          }}
          className="h-full motion-blur-fix"
        >
          <Component {...pageProps} />
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}