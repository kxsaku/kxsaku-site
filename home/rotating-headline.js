// /home/rotating-headline.js
// Production-safe: NO JSX (runs directly in browser as an ES module)

import React from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client";
import { motion, AnimatePresence } from "https://esm.sh/framer-motion@11.0.0?deps=react@18.2.0,react-dom@18.2.0";

const WORDS = ["Assessment", "Affordability", "Reliability", "Security", "Support"];

function splitChars(text) {
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

  return React.createElement(
    motion.span,
    {
      layout: true,
      className: "rt-layout",
      transition: { type: "spring", damping: 30, stiffness: 400 },
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
              animate: { y: "0%", opacity: 1 },
              exit: { y: "-100%", opacity: 0 },
              transition: {
                duration: 0.35,
                delay: i * 0.02,
                ease: [0.2, 0.9, 0.2, 1],
              },
            },
            char == " " ? "\u00A0" : char
          )
        )
      )
    )
  );
}

const mountNode = document.getElementById("rt-headline");
if (mountNode) {
  createRoot(mountNode).render(React.createElement(RotatingHeadline));
} else {
  console.warn('[rotating-headline] Mount node "#rt-headline" not found.');
}
