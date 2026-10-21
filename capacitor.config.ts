import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hoopscareer.app',
  appName: 'Hoops Career',
  webDir: 'dist',
  backgroundColor: '#f3efe7',
  // Android 15 draws edge to edge: let Capacitor inset the web view under the system bars
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'auto' },
  ios: { contentInset: 'never' },
};

export default config;
