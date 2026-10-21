// Paid-plan UI is retained for local testing, never enabled by a URL parameter.
export const COMMUNITY_ACCESS = !(import.meta.env?.DEV && import.meta.env?.VITE_PAID_TESTING === 'true');
