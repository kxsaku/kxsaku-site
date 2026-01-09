import React from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import {
  motion,
  AnimatePresence,
} from "https://esm.sh/framer-motion@11";

/* ================= CONFIG ================= */

const WORDS = [
  "Assessment",
  "Affordability",
  "Reliability",
  "Security",
  "Support",
];

const INTERVAL = 2200;

/* ========================================== */

function splitChars(text) {
  return Array.from(text);
}

function RotatingHeadline() {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % WORDS.length);
    }, INTERVAL);
    return () => clearInterval(id);
  }, []);

  const word = WORDS[index];

  return React.createElement(
    motion.span,
    {
      className: "rt-layout",
      layout: true,
      transition: {
        type: "spring",
        damping: 30,
        stiffness: 400,
      },
    },
    React.createElement(
      AnimatePresence,
      { mode: "wait" },
      React.createElement(
        motion.span,
        {
          key: word,
          className: "rt-word",
          layout: true,
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
        },
        splitChars(word).map((char, i) =>
          React.createElement(
            motion.span,
            {
              key: i,
              className: "rt-char",
              initial: { y: "100%", opacity: 0 },
              animate: { y: 0, opacity: 1 },
              exit: { y: "-120%", opacity: 0 },
              transition: {
                type: "spring",
                damping: 30,
                stiffness: 400,
                delay: i * 0.025,
              },
            },
            char
          )
        )
      )
    )
  );
}

/* ============ MOUNT (NO JSX) ============ */

const mountNode = document.getElementById("rt-headline");

if (mountNode) {
  const root = createRoot(mountNode);
  root.render(React.createElement(RotatingHeadline));
}
