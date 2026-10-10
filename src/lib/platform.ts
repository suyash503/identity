import { Capacitor } from '@capacitor/core'

/** True inside the installed Android app, false in a browser (the PWA). */
export const isNative = Capacitor.isNativePlatform()
