// /home/rotating-headline.js
// ReactBits-style rotating headline (character-by-character) for a plain HTML page.
// Requirements: modern browser with ES modules.

import * as React from "https://esm.sh/react@18.3.1?dev=false";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client?dev=false";
// IMPORTANT: externalize React so Framer Motion uses the SAME React instance.
import { motion, AnimatePresence } from "https://esm.sh/framer-motion@11.2.12?external=react&dev=false";

const FIXED = "Network";
const WORDS = ["Assessment", "Affordability", "Reliability", "Security", "Support"];

function splitChars(text) {
  // Grapheme-safe split (emojis, accents, etc.)
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
  const chars = React.useMemo(() => splitChars(word), [word]);

  const spring = { type: "spring", damping: 30, stiffness: 400 };

  // Build DOM without JSX (browser cannot parse JSX without a build step)
  return React.createElement(
    motion.span,
    { className: "rt-layout", layout: true, transition: spring },
    // Fixed word (moves via layout as the rotating word changes width)
    React.createElement(
      motion.span,
      { className: "rt-fixed", layout: true, transition: spring },
      FIXED
    ),
    React.createElement("span", { className: "rt-space", "aria-hidden": "true" }, " "),
    React.createElement(
      "span",
      { className: "rt-inline" },
      React.createElement(
        AnimatePresence,
        { mode: "wait", initial: false },
        React.createElement(
          motion.span,
          {
            key: word,
            className: "rt-word",
            layout: true,
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 },
            transition: spring,
            "aria-hidden": "true",
          },
          chars.map((ch, i) =>
            React.createElement(
              motion.span,
              {
                key: i,
                className: "rt-char",
                initial: { y: "100%", opacity: 0 },
                animate: { y: 0, opacity: 1 },
                exit: { y: "-120%", opacity: 0 },
                transition: { ...spring, delay: i * 0.025 },
              },
              ch
            )
          )
        )
      ),
      // Screen reader text (full phrase)
      React.createElement("span", { className: "rt-sr-only" }, `${FIXED} ${word}`)
    )
  );
}

function mount() {
  const mountNode = document.getElementById("rt-headline");
  if (!mountNode) return;

  // Prevent double-mount if hot-reloaded or injected twice
  if (mountNode.__rtMounted) return;
  mountNode.__rtMounted = true;

  const root = createRoot(mountNode);
  root.render(React.createElement(RotatingHeadline));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
