import React from 'react'
import ReactDOM from 'react-dom/client'
import RotatingText from './RotatingText'
import './RotatingText.css'

ReactDOM.createRoot(document.getElementById('rt-react-root')).render(
  <React.StrictMode>
    <RotatingText
      texts={['Wi-Fi', 'Networks', 'Security', 'Stability']}
      staggerFrom="last"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '-120%' }}
      staggerDuration={0.025}
      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
      rotationInterval={2000}
    />
  </React.StrictMode>
)
