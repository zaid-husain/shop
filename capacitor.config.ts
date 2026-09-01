import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.zashly.bharatautoparts",
  appName: "Bharat Auto Parts",
  // webDir is used as a fallback if the server.url is unreachable,
  // though typically it just loads the remote URL.
  webDir: ".output/public",
  server: {
    url: "https://bharatautoparts.vercel.app",
    cleartext: true,
  },
  plugins: {
    Keyboard: {
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      showSpinner: true,
      androidSpinnerStyle: "large",
      spinnerColor: "#0f172a",
    },
  },
};

export default config;
