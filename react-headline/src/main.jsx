import React from 'react'
import ReactDOM from 'react-dom/client'
import RotatingText from './RotatingText'
import './RotatingText.css'
import './headline.css'

const rootEl = document.getElementById('rt-headline-root')

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <RotatingText
      texts={['Assessment', 'Reliability', 'Security', 'Support']}
      staggerFrom="last"
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "-120%", opacity: 0 }}
      staggerDuration={0.025}
      transition={{ type: "spring", damping: 30, stiffness: 400 }}
      rotationInterval={2500}
      mainClassName="headline-rotating"
      splitLevelClassName="headline-word"
      elementLevelClassName="headline-char"
    />
  )
}


