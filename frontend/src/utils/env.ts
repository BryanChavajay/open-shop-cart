export const BASE_API_V1_URL: string = import.meta.env.VITE_API_V1_URL;
export const EMAIL_SERVICES_ENABLE: boolean =
  String(import.meta.env.VITE_EMAIL_SERVICES_ENABLE).toLowerCase() === "true";
