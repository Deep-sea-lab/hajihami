// Simple favicon handler for Vercel
export default function handler(req, res) {
  // Return a simple empty favicon
  res.setHeader('Content-Type', 'image/x-icon');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  // Return a minimal 16x16 transparent favicon (1x1 pixel)
  const favicon = Buffer.from('AAABAAEABAAAAEAIAAoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAgAAAAEAAAAAAAAAAAAAAAIAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//wAA', 'base64');
  res.status(200).send(favicon);
}
