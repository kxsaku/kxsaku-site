import React from "react";
import { createRoot } from "react-dom/client";
import RotatingText from "../../home/reactbits/RotatingText.js";

// Mount into the span we’ll add inside the existing H1
const mount = document.getElementById("rt-headline");
if (mount) {
  createRoot(mount).render(
    <RotatingText
      texts={["Reliability", "Security", "Availability", "Affordability"]}
      // IMPORTANT: no pill background, no tacky gradients
      mainClassName="rt-inline"
      // baseline + no layout jump
      splitLevelClassName="rt-split"
      elementLevelClassName="rt-el"
      staggerFrom={"last"}
      staggerDuration={0.012}
      initial={{ y: "110%", opacity: 0 }}
      animate={{ y: "0%", opacity: 1 }}
      exit={{ y: "-110%", opacity: 0 }}
      transition={{ type: "spring", damping: 34, stiffness: 520, mass: 0.55 }}
      rotationInterval={2400}
    />
  );
}
