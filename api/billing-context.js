const COUNTRY_CODE = /^[A-Za-z]{2}$/;

export default function handler(request, response) {
  const value = request.headers['x-vercel-ip-country'];
  const country = typeof value === 'string' && COUNTRY_CODE.test(value) ? value.toUpperCase() : null;
  response.setHeader('Cache-Control', 'private, no-store');
  response.status(200).json({ country });
}
