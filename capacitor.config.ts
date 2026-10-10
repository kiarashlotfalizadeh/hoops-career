import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hoopscareer.app',
  appName: 'Hoops Career',
  webDir: 'dist',
  backgroundColor: '#0b0e14',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never' },
};

export default config;
