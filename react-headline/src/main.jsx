import React from 'react'
import ReactDOM from 'react-dom/client'
import RotatingText from './RotatingText'
import './RotatingText.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <RotatingText
    texts={['Reliable', 'Secure', 'Scalable', 'Managed']}
    rotationInterval={2000}
    staggerFrom="last"
  />
)


