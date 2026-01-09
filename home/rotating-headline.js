import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState
} from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence } from "motion/react";

import "./rotating-headline.css";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const RotatingText = forwardRef((props, ref) => {
  const {
    texts,
    transition = { type: "spring", damping: 30, stiffness: 400 },
    initial = { y: "100%", opacity: 0 },
    animate = { y: 0, opacity: 1 },
    exit = { y: "-120%", opacity: 0 },
    rotationInterval = 2000,
    staggerDuration = 0.025,
    staggerFrom = "last",
    loop = true,
    auto = true
  } = props;

  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  const splitIntoCharacters = text => {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
      return Array.from(segmenter.segment(text), s => s.segment);
    }
    return Array.from(text);
  };

  const characters = useMemo(() => {
    return splitIntoCharacters(texts[currentTextIndex]);
  }, [texts, currentTextIndex]);

  const getDelay = index => {
    if (staggerFrom === "last") {
      return (characters.length - index) * staggerDuration;
    }
    return index * staggerDuration;
  };

  const next = useCallback(() => {
    setCurrentTextIndex(i =>
      i === texts.length - 1 ? (loop ? 0 : i) : i + 1
    );
  }, [texts.length, loop]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(next, rotationInterval);
    return () => clearInterval(id);
  }, [next, rotationInterval, auto]);

  return (
    <motion.span
      className="rt-inline"
      layout
      transition={transition}
    >
      <span className="rt-static">Network&nbsp;</span>

      <span className="rt-dynamic">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentTextIndex}
            className="text-rotate"
            layout
            aria-hidden
          >
            {characters.map((char, i) => (
              <motion.span
                key={i}
                className="text-rotate-element"
                initial={initial}
                animate={animate}
                exit={exit}
                transition={{
                  ...transition,
                  delay: getDelay(i)
                }}
              >
                {char}
              </motion.span>
            ))}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.span>
  );
});

RotatingText.displayName = "RotatingText";

/* ---------- MOUNT ---------- */

const mount = document.getElementById("rt-root");

if (mount) {
  createRoot(mount).render(
    <RotatingText
      texts={[
        "Assessment",
        "Reliability",
        "Security",
        "Support"
      ]}
    />
  );
}
