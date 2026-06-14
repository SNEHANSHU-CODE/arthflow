// Updated InstallPrompt.jsx
import React, { useState, useEffect } from 'react'
import { usePWA } from './usePWA';
import './styles/InstallPrompt.css';

const InstallPrompt = () => {
  const { installApp, isInstallable } = usePWA()
  const [isVisible, setIsVisible] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [dismissedAt, setDismissedAt] = useState(null)

  // Initialize dismissed timestamp from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('install-prompt-dismissed')
      if (stored) {
        setDismissedAt(parseInt(stored))
      }
    } catch (error) {
    }
  }, [])

  // Show prompt logic
  useEffect(() => {
    if (!isInstallable) {
      setIsVisible(false)
      return
    }

    const weekAgo = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()
    const timeSinceDismissed = dismissedAt ? now - dismissedAt : null

    if (dismissedAt && timeSinceDismissed < weekAgo) {
      setIsVisible(false)
    } else {
      setIsVisible(true)
    }
  }, [isInstallable, dismissedAt])

  const handleInstall = async () => {
    setIsInstalling(true)
    try {
      const success = await installApp()
      if (success) {
        setIsVisible(false)
      }
    } catch (error) {
    } finally {
      setIsInstalling(false)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
    const timestamp = Date.now()
    setDismissedAt(timestamp)
    try {
      localStorage.setItem('install-prompt-dismissed', timestamp.toString())
    } catch (error) {
    }
  }

  if (!isVisible) {
    return null
  }

  return (
    <div className="install-prompt">
      <div className="install-content">
        <h3>Install ArthFlow</h3>
        <p>Get quick access to ArthFlow</p>
        <div className="install-actions">
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className={`install-btn install-btn-primary ${isInstalling ? 'installing' : ''}`}
          >
            {isInstalling ? 'Installing...' : 'Install App'}
          </button>
          <button
            onClick={handleDismiss}
            className="install-btn install-btn-secondary"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  )
}

export default InstallPrompt;