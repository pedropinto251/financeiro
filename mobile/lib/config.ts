declare const __DEV__: boolean;

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://localhost:3000' : 'https://softpinto.pt');
