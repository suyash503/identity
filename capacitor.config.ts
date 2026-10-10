import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.suyash.identity',
  appName: 'IDENTITY',
  webDir: 'dist',
  // The app's pages load from https://localhost inside the app, so the backup server must allow that origin.
  android: { backgroundColor: '#000000' },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_identity', iconColor: '#f5f5f7' },
  },
}

export default config
