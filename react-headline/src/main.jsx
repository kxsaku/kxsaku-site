import React from 'react'
import ReactDOM from 'react-dom/client'
import { LayoutGroup, motion } from 'motion/react'
import RotatingText from './RotatingText'
import './RotatingText.css'
import './headline.css'

const rootEl = document.getElementById('rt-headline-root')

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <div className="rotating-text-demo">
      <LayoutGroup>
        <motion.p className="rotating-text-ptag" layout>
          <motion.span
            layout
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          >
            Network{' '}
          </motion.span>
          <RotatingText
            texts={['Reliability', 'Security', 'Continuity', 'Affordability']}
            mainClassName="rotating-text-main"
            staggerFrom="last"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-120%' }}
            staggerDuration={0.025}
            splitLevelClassName="rotating-text-split"
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            rotationInterval={2000}
          />
        </motion.p>
      </LayoutGroup>
    </div>
  )
}


