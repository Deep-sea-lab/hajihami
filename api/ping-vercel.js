// Vercel API endpoint for /api/ping
// Simple health check endpoint

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Content-Type', 'application/json');

    res.status(200).json({
      code: 200,
      message: 'OK',
      timestamp: new Date().toISOString(),
      environment: 'vercel',
      uptime: process.uptime(),
      version: process.version
    });
  } catch (error) {
    console.error('Ping API错误:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误',
      error: error.message
    });
  }
}
