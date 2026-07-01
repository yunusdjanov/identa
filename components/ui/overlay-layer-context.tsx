"use client"

import * as React from "react"

type OverlayLayer = "page" | "dialog"

const OverlayLayerContext = React.createContext<OverlayLayer>("page")

interface OverlayLayerProviderProps {
  children: React.ReactNode
  layer: OverlayLayer
}

/**
 * Shares the nearest overlay layer with portalled primitives so popups keep
 * the expected stack order when they are opened from page content or a dialog.
 */
function OverlayLayerProvider({ children, layer }: OverlayLayerProviderProps) {
  return (
    <OverlayLayerContext.Provider value={layer}>
      {children}
    </OverlayLayerContext.Provider>
  )
}

/** Returns the nearest overlay layer for portalled primitives. */
function useOverlayLayer() {
  return React.useContext(OverlayLayerContext)
}

export { OverlayLayerProvider, useOverlayLayer }
