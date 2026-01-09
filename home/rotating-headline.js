// /home/rotating-headline.js
// ESM module — React + Framer Motion (runtime) like ReactBits-style character animation.

import React from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";

// Force framer-motion to resolve against the SAME React instance via deps pinning.
import { motion, AnimatePresence } from "https://esm.sh/framer-motion@11.0.0?deps=react@18.2.0,react-dom@18.2.0";

const WORDS = ["Assessment", "Affordability", "Reliability", "Security", "Support"];

function splitChars(text) {
  // Grapheme-safe split (emoji, accents) where supported.
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

function RotatingHeadline() {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % WORDS.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const word = WORDS[index];
  const chars = splitChars(word);

  // Stagger-from-last like ReactBits example.
  const staggerDuration = 0.025;

  return (
    <motion.span
      layout
      className="rt-layout"
      transition={{ type: "spring", damping: 30, stiffness: 400 }}
      aria-label={word}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={word}
          className="rt-word"
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {chars.map((ch, i) => {
            const delay = (chars.length - 1 - i) * staggerDuration;
            const isSpace = ch === " ";
            return (
              <motion.span
                key={i}
                className={isSpace ? "rt-space" : "rt-char"}
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-120%", opacity: 0 }}
                transition={{
                  type: "spring",
                  damping: 30,
                  stiffness: 400,
                  delay,
                }}
                aria-hidden="true"
              >
                {ch}
              </motion.span>
            );
          })}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

const mountNode = document.getElementById("rt-headline");
if (!mountNode) {
  console.warn('[rotating-headline] Mount node "#rt-headline" not found.');
} else {
  const root = createRoot(mountNode);
  root.render(<RotatingHeadline />);
}
