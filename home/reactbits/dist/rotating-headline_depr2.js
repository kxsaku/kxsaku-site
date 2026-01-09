
import React from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import { motion, AnimatePresence } from "https://esm.sh/framer-motion@11";

const WORDS = [
  "Assessment",
  "Affordability",
  "Reliability",
  "Security",
  "Support"
];

function splitChars(text) {
  return Array.from(text);
}

function RotatingHeadline() {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setIndex(i => (i + 1) % WORDS.length);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  const word = WORDS[index];

  return (
    <motion.span
      layout
      className="rt-layout"
      transition={{ type: "spring", damping: 30, stiffness: 400 }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={word}
          className="rt-word"
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {splitChars(word).map((char, i) => (
            <motion.span
              key={i}
              className="rt-char"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-120%", opacity: 0 }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 400,
                delay: i * 0.025
              }}
            >
              {char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

const mount = document.getElementById("rt-headline");
if (mount) {
  createRoot(mount).render(<RotatingHeadline />);
}
